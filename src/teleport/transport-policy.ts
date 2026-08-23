import { CID } from 'multiformats/cid';
import { Result } from 'neverthrow';

import type { VerifiedTeleportCartridge } from './cartridge';
import { err, ok, type TeleportResult } from './result';

export type TeleportCloudObjectKind = 'capability' | 'key-envelope' | 'signature' | 'root';

export interface TeleportCloudObject {
  readonly cid: CID;
  readonly bytes: Uint8Array;
  readonly kind: TeleportCloudObjectKind;
}

export interface TeleportCloudHead {
  readonly workspaceId: string;
  readonly root: string;
  readonly previousVersion?: string;
}

export interface TeleportCloudPublication {
  readonly root: string;
  readonly objects: readonly TeleportCloudObject[];
}

export interface PublishTeleportCloudOptions {
  readonly workspaceId?: string;
  readonly previousHeadVersion?: string;
}

export interface TeleportS3PutInput {
  readonly bucket: string;
  readonly key: string;
  readonly body: Uint8Array;
  readonly checksumSha256: string;
  readonly contentType: string;
  readonly ifMatch?: string;
  readonly ifNoneMatch?: '*';
}

export interface TeleportByteRange {
  readonly start: number;
  readonly endExclusive: number;
}

export interface TeleportS3GetInput {
  readonly bucket: string;
  readonly key: string;
  readonly range?: TeleportByteRange;
}

export interface TeleportS3GetOutput {
  readonly body: AsyncIterable<Uint8Array>;
  readonly contentLength: number;
  readonly totalLength: number;
  readonly version?: string;
}

export interface TeleportS3PutOutput {
  readonly version: string;
  readonly outcome?: 'created' | 'exists';
}

export interface TeleportS3Port {
  readonly putObject: (input: TeleportS3PutInput) => Promise<TeleportResult<TeleportS3PutOutput>>;
  readonly putMultipart?: (
    input: TeleportS3PutInput & Readonly<{ partSizeBytes: number }>
  ) => Promise<TeleportResult<TeleportS3PutOutput>>;
  readonly getObject?: (input: TeleportS3GetInput) => Promise<TeleportResult<TeleportS3GetOutput>>;
}

export interface TeleportS3StoreOptions {
  readonly bucket: string;
  readonly tenantPrefix: string;
  readonly multipartThresholdBytes?: number;
  readonly multipartPartSizeBytes?: number;
}

export interface TeleportS3Scope {
  readonly bucket: string;
  readonly prefix: string;
}

export interface TeleportS3PutPlan {
  readonly bucket: string;
  readonly key: string;
  readonly body: Uint8Array;
  readonly contentType: string;
  readonly ifMatch?: string;
  readonly ifNoneMatch?: '*';
}

export interface TeleportRetentionPlan {
  readonly retainedRoots: readonly string[];
  readonly reachableObjectCids: readonly string[];
  readonly deleteCandidateCids: readonly string[];
}

const safePathSegment = (value: string): boolean =>
  /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value);

const parseCid = Result.fromThrowable(
  (value: string): CID => CID.parse(value),
  () => undefined
);

const validCid = (value: string): boolean => parseCid(value).match(
  cid => cid.toString() === value,
  () => false
);

const validRange = (range: TeleportByteRange): boolean =>
  Number.isSafeInteger(range.start)
  && Number.isSafeInteger(range.endExclusive)
  && range.start >= 0
  && range.endExclusive > range.start;

const uniqueSorted = (values: readonly string[]): readonly string[] => values
  .filter((value, index) => values.indexOf(value) === index)
  .toSorted();

const compareCloudObjects = (
  left: TeleportCloudObject,
  right: TeleportCloudObject
): number => {
  if (left.kind === 'root') return right.kind === 'root' ? 0 : 1;
  if (right.kind === 'root') return -1;
  return left.cid.toString().localeCompare(right.cid.toString());
};

const graphObjects = (
  cartridge: VerifiedTeleportCartridge
): readonly TeleportCloudObject[] => [
  ...cartridge.capabilities.map((capability): TeleportCloudObject => ({
    cid: capability.descriptor.block,
    bytes: capability.storedBytes,
    kind: 'capability'
  })),
  ...cartridge.keyEnvelopes.map((envelope): TeleportCloudObject => ({
    cid: envelope.descriptor.block,
    bytes: envelope.bytes,
    kind: 'key-envelope'
  })),
  ...cartridge.signatures.map((signature): TeleportCloudObject => ({
    cid: signature.descriptor.block,
    bytes: signature.bytes,
    kind: 'signature'
  })),
  {
    cid: cartridge.root,
    bytes: cartridge.rootBytes,
    kind: 'root'
  }
];

/** Pure projection: immutable graph objects are deduplicated and the root is ordered last. */
export const planTeleportCloudPublication = (
  cartridge: VerifiedTeleportCartridge
): TeleportResult<TeleportCloudPublication> => {
  const candidates: readonly TeleportCloudObject[] = graphObjects(cartridge);
  const objects: readonly TeleportCloudObject[] = candidates
    .filter((object, index) => candidates.findLastIndex(candidate => candidate.cid.equals(object.cid)) === index)
    .toSorted(compareCloudObjects);
  return ok({ root: cartridge.root.toString(), objects });
};

/** Pure validation and normalization of the caller-owned tenant namespace. */
export const planTeleportS3Scope = (
  options: Pick<TeleportS3StoreOptions, 'bucket' | 'tenantPrefix'>
): TeleportResult<TeleportS3Scope> => {
  const segments: readonly string[] = options.tenantPrefix.split('/').filter(Boolean);
  return options.bucket && segments.length > 0 && segments.every(safePathSegment)
    ? ok({ bucket: options.bucket, prefix: segments.join('/') })
    : err({ code: 'dependency-invalid', message: 'S3 bucket or tenant prefix is invalid.' });
};

/** Pure, tenant-confined range-read request projection. */
export const planTeleportS3Read = (
  scope: TeleportS3Scope,
  cid: string,
  kind: TeleportCloudObjectKind,
  range?: TeleportByteRange
): TeleportResult<TeleportS3GetInput> => {
  if (!validCid(cid) || (range !== undefined && !validRange(range))) {
    return err({ code: 'dependency-invalid', message: 'S3 object CID or byte range is invalid.' });
  }
  return ok({
    bucket: scope.bucket,
    key: `${scope.prefix}/${kind === 'root' ? 'roots' : 'blocks'}/${cid}`,
    ...(range === undefined ? {} : { range })
  });
};

/** Pure, create-only request projection for content-addressed graph objects. */
export const planTeleportS3ImmutablePut = (
  scope: TeleportS3Scope,
  object: TeleportCloudObject,
  checksumSha256: string
): TeleportS3PutInput => ({
  bucket: scope.bucket,
  key: `${scope.prefix}/${object.kind === 'root' ? 'roots' : 'blocks'}/${object.cid.toString()}`,
  body: object.bytes,
  checksumSha256,
  contentType: object.kind === 'root'
    ? 'application/vnd.ipld.dag-cbor'
    : 'application/octet-stream',
  ifNoneMatch: '*'
});

/**
 * Pure mutable-head projection. Existing heads are compare-and-swapped with
 * If-Match; first publication is create-only. Neither path can overwrite a
 * head whose version changed after the caller observed it.
 */
export const planTeleportS3HeadPut = (
  scope: TeleportS3Scope,
  head: TeleportCloudHead
): TeleportResult<TeleportS3PutPlan> => {
  if (!safePathSegment(head.workspaceId)) {
    return err({ code: 'dependency-invalid', message: 'Workspace head identity is invalid.' });
  }
  return ok({
    bucket: scope.bucket,
    key: `${scope.prefix}/heads/${head.workspaceId}.json`,
    body: new TextEncoder().encode(JSON.stringify({ root: head.root })),
    contentType: 'application/json',
    ...(head.previousVersion === undefined
      ? { ifNoneMatch: '*' }
      : { ifMatch: head.previousVersion })
  });
};

export const completeTeleportS3PutPlan = (
  plan: TeleportS3PutPlan,
  checksumSha256: string
): TeleportS3PutInput => ({ ...plan, checksumSha256 });

export const useTeleportMultipartPut = (
  bodyLength: number,
  options: TeleportS3StoreOptions,
  multipartAvailable: boolean
): boolean => multipartAvailable
  && bodyLength >= (options.multipartThresholdBytes ?? 8 * 1024 * 1024);

/** Pure reachability policy; deletion remains an explicit host-owned effect. */
export const planTeleportReachabilityRetention = (
  publications: readonly TeleportCloudPublication[],
  retainedRoots: readonly string[],
  allObjectCids: readonly string[]
): TeleportResult<TeleportRetentionPlan> => {
  const retained: readonly string[] = uniqueSorted(retainedRoots);
  const missing = retained.find(root => !publications.some(publication => publication.root === root));
  if (missing !== undefined) {
    return err({
      code: 'missing-block',
      message: `Retained cloud root ${missing} has no publication inventory.`
    });
  }
  const reachableObjectCids: readonly string[] = uniqueSorted(retained.flatMap((root): readonly string[] =>
    publications.findLast(publication => publication.root === root)?.objects
      .map(object => object.cid.toString()) ?? []
  ));
  return ok({
    retainedRoots: retained,
    reachableObjectCids,
    deleteCandidateCids: uniqueSorted(allObjectCids)
      .filter(cid => !reachableObjectCids.includes(cid))
  });
};
