import type { VerifiedTeleportCartridge } from './cartridge';
import { err, ok, type TeleportIssue, type TeleportResult } from './result';
import {
  completeTeleportS3PutPlan,
  planTeleportCloudPublication,
  planTeleportS3HeadPut,
  planTeleportS3ImmutablePut,
  planTeleportS3Read,
  planTeleportS3Scope,
  useTeleportMultipartPut,
  type PublishTeleportCloudOptions,
  type TeleportByteRange,
  type TeleportCloudHead,
  type TeleportCloudObject,
  type TeleportCloudObjectKind,
  type TeleportCloudPublication,
  type TeleportS3GetOutput,
  type TeleportS3Port,
  type TeleportS3PutInput,
  type TeleportS3PutOutput,
  type TeleportS3Scope,
  type TeleportS3StoreOptions
} from './transport-policy';

export interface TeleportCloudStore {
  readonly putImmutable: (
    object: TeleportCloudObject
  ) => Promise<TeleportResult<'created' | 'exists'>>;
  readonly publishHead?: (
    head: TeleportCloudHead
  ) => Promise<TeleportResult<Readonly<{ version: string }>>>;
}

export interface TeleportS3Source {
  readonly readObject: (
    cid: string,
    kind: TeleportCloudObjectKind,
    range?: TeleportByteRange
  ) => Promise<TeleportResult<TeleportS3GetOutput>>;
}

const captureTransportValue = <T>(
  effect: () => T | PromiseLike<T>,
  issue: TeleportIssue
): Promise<TeleportResult<T>> => Promise.resolve()
  .then(effect)
  .then(
    value => ok(value),
    () => err(issue)
  );

const captureTransportResult = <T>(
  effect: () => PromiseLike<TeleportResult<T>>,
  issue: TeleportIssue
): Promise<TeleportResult<T>> => Promise.resolve()
  .then(effect)
  .then(
    result => result,
    () => err(issue)
  );

const base64 = (bytes: Uint8Array): string => btoa(
  Array.from(bytes, byte => String.fromCharCode(byte)).join('')
);

const publishObjects = async (
  publication: TeleportCloudPublication,
  store: TeleportCloudStore,
  index = 0,
  warnings: readonly TeleportIssue[] = []
): Promise<TeleportResult<void>> => {
  const object = publication.objects[index];
  if (object === undefined) return ok(undefined, warnings);
  const stored = await captureTransportResult(
    () => store.putImmutable(object),
    {
      code: 'execution-failed',
      message: `Cloud object ${object.cid.toString()} publication failed unexpectedly.`
    }
  );
  return stored.ok
    ? publishObjects(publication, store, index + 1, [...warnings, ...stored.warnings])
    : stored;
};

/**
 * Stateful orchestration boundary: immutable graph writes complete in order,
 * then (and only then) the optional CAS-protected mutable head is published.
 */
export const publishTeleportCloudCartridge = async (
  cartridge: VerifiedTeleportCartridge,
  store: TeleportCloudStore,
  options: PublishTeleportCloudOptions = {}
): Promise<TeleportResult<Readonly<{ root: string; headVersion?: string }>>> => {
  const publication = planTeleportCloudPublication(cartridge);
  if (!publication.ok) return publication;
  const stored = await publishObjects(publication.value, store);
  if (!stored.ok) return stored;
  if (!options.workspaceId) {
    return ok({ root: publication.value.root }, [...publication.warnings, ...stored.warnings]);
  }
  if (store.publishHead === undefined) {
    return err({
      code: 'dependency-invalid',
      message: 'Cloud store does not support mutable workspace heads.'
    });
  }
  const head: TeleportCloudHead = {
    workspaceId: options.workspaceId,
    root: publication.value.root,
    ...(options.previousHeadVersion === undefined
      ? {}
      : { previousVersion: options.previousHeadVersion })
  };
  const published = await captureTransportResult(
    () => store.publishHead?.(head) ?? Promise.resolve(err({
      code: 'dependency-invalid',
      message: 'Cloud store does not support mutable workspace heads.'
    })),
    {
      code: 'execution-failed',
      message: `Workspace head ${options.workspaceId} publication failed unexpectedly.`
    }
  );
  return published.ok
    ? ok(
        { root: publication.value.root, headVersion: published.value.version },
        [...publication.warnings, ...stored.warnings, ...published.warnings]
      )
    : published;
};

/** Creates a tenant-scoped, range-capable reader for immutable DAG objects. */
export const createTeleportS3Source = (
  port: TeleportS3Port,
  options: Pick<TeleportS3StoreOptions, 'bucket' | 'tenantPrefix'>
): TeleportResult<TeleportS3Source> => {
  const scope = planTeleportS3Scope(options);
  const getObject = port.getObject;
  if (!scope.ok || getObject === undefined) {
    return err({
      code: 'dependency-invalid',
      message: 'S3 range source configuration is invalid.'
    });
  }
  return ok({
    readObject: (cid, kind, range) => {
      const input = planTeleportS3Read(scope.value, cid, kind, range);
      return input.ok
        ? captureTransportResult(
            () => getObject(input.value),
            {
              code: 'execution-failed',
              message: `S3 object ${cid} read failed unexpectedly.`
            }
          )
        : Promise.resolve(input);
    }
  });
};

const putTeleportS3Object = (
  port: TeleportS3Port,
  options: TeleportS3StoreOptions,
  input: TeleportS3PutInput
): Promise<TeleportResult<TeleportS3PutOutput>> => {
  const multipart = port.putMultipart;
  const operation = useTeleportMultipartPut(input.body.byteLength, options, multipart !== undefined)
    && multipart !== undefined
    ? (): Promise<TeleportResult<TeleportS3PutOutput>> => multipart({
        ...input,
        partSizeBytes: options.multipartPartSizeBytes ?? 8 * 1024 * 1024
      })
    : (): Promise<TeleportResult<TeleportS3PutOutput>> => port.putObject(input);
  return captureTransportResult(operation, {
    code: 'execution-failed',
    message: `S3 object ${input.key} write failed unexpectedly.`
  });
};

const publishTeleportS3Head = async (
  port: TeleportS3Port,
  options: TeleportS3StoreOptions,
  scope: TeleportS3Scope,
  head: TeleportCloudHead
): Promise<TeleportResult<Readonly<{ version: string }>>> => {
  const plan = planTeleportS3HeadPut(scope, head);
  if (!plan.ok) return plan;
  const digest = await captureTransportValue(
    () => crypto.subtle.digest('SHA-256', Uint8Array.from(plan.value.body).buffer),
    {
      code: 'execution-failed',
      message: `Workspace head ${head.workspaceId} checksum calculation failed.`
    }
  );
  if (!digest.ok) return digest;
  const published = await putTeleportS3Object(
    port,
    options,
    completeTeleportS3PutPlan(
      plan.value,
      base64(new Uint8Array(digest.value))
    )
  );
  return published.ok
    ? ok({ version: published.value.version }, [...digest.warnings, ...published.warnings])
    : published;
};

/** Binds pure S3 projections to caller-supplied object-store effects. */
export const createTeleportS3Store = (
  port: TeleportS3Port,
  options: TeleportS3StoreOptions
): TeleportResult<TeleportCloudStore> => {
  const scope = planTeleportS3Scope(options);
  if (!scope.ok) return scope;
  return ok({
    putImmutable: async object => {
      const published = await putTeleportS3Object(
        port,
        options,
        planTeleportS3ImmutablePut(
          scope.value,
          object,
          base64(object.cid.multihash.digest)
        )
      );
      return published.ok
        ? ok(published.value.outcome ?? 'created', published.warnings)
        : published;
    },
    publishHead: head => publishTeleportS3Head(port, options, scope.value, head)
  });
};
