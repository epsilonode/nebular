import { CID } from 'multiformats/cid';

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

export interface TeleportCloudStore {
  readonly putImmutable: (object: TeleportCloudObject) => Promise<TeleportResult<'created' | 'exists'>>;
  readonly publishHead?: (head: TeleportCloudHead) => Promise<TeleportResult<Readonly<{ version: string }>>>;
}

export interface TeleportCloudPublication {
  readonly root: string;
  readonly objects: readonly TeleportCloudObject[];
}

export const planTeleportCloudPublication = (
  cartridge: VerifiedTeleportCartridge
): TeleportResult<TeleportCloudPublication> => {
  const objects = new Map<string, TeleportCloudObject>();
  for (const capability of cartridge.capabilities) {
    objects.set(capability.descriptor.block.toString(), {
      cid: capability.descriptor.block,
      bytes: capability.storedBytes,
      kind: 'capability'
    });
  }
  for (const envelope of cartridge.keyEnvelopes) {
    objects.set(envelope.descriptor.block.toString(), {
      cid: envelope.descriptor.block,
      bytes: envelope.bytes,
      kind: 'key-envelope'
    });
  }
  for (const signature of cartridge.signatures) {
    objects.set(signature.descriptor.block.toString(), {
      cid: signature.descriptor.block,
      bytes: signature.bytes,
      kind: 'signature'
    });
  }
  objects.set(cartridge.root.toString(), {
    cid: cartridge.root,
    bytes: cartridge.rootBytes,
    kind: 'root'
  });
  return ok({
    root: cartridge.root.toString(),
    objects: [...objects.values()].sort((left, right) => {
      if (left.kind === 'root') return 1;
      if (right.kind === 'root') return -1;
      return left.cid.toString().localeCompare(right.cid.toString());
    })
  });
};

export interface PublishTeleportCloudOptions {
  readonly workspaceId?: string;
  readonly previousHeadVersion?: string;
}

export const publishTeleportCloudCartridge = async (
  cartridge: VerifiedTeleportCartridge,
  store: TeleportCloudStore,
  options: PublishTeleportCloudOptions = {}
): Promise<TeleportResult<Readonly<{ root: string; headVersion?: string }>>> => {
  const publication = planTeleportCloudPublication(cartridge);
  if (!publication.ok) return publication;
  for (const object of publication.value.objects) {
    const stored = await store.putImmutable(object);
    if (!stored.ok) return stored;
  }
  if (!options.workspaceId) return ok({ root: publication.value.root });
  if (!store.publishHead) return err({ code: 'dependency-invalid', message: 'Cloud store does not support mutable workspace heads.' });
  const published = await store.publishHead({
    workspaceId: options.workspaceId,
    root: publication.value.root,
    ...(options.previousHeadVersion ? { previousVersion: options.previousHeadVersion } : {})
  });
  return published.ok
    ? ok({ root: publication.value.root, headVersion: published.value.version })
    : published;
};

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
  readonly putMultipart?: (input: TeleportS3PutInput & Readonly<{ partSizeBytes: number }>) => Promise<TeleportResult<TeleportS3PutOutput>>;
  readonly getObject?: (input: TeleportS3GetInput) => Promise<TeleportResult<TeleportS3GetOutput>>;
}

export interface TeleportS3StoreOptions {
  readonly bucket: string;
  readonly tenantPrefix: string;
  readonly multipartThresholdBytes?: number;
  readonly multipartPartSizeBytes?: number;
}

const safePathSegment = (value: string): boolean => /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value);
const validRange = (range: TeleportByteRange): boolean =>
  Number.isSafeInteger(range.start) && Number.isSafeInteger(range.endExclusive) && range.start >= 0 && range.endExclusive > range.start;
const validCid = (value: string): boolean => {
  try { return CID.parse(value).toString() === value; } catch { return false; }
};
const base64 = (bytes: Uint8Array): string => {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

export interface TeleportS3Source {
  readonly readObject: (
    cid: string,
    kind: TeleportCloudObjectKind,
    range?: TeleportByteRange
  ) => Promise<TeleportResult<TeleportS3GetOutput>>;
}

/** Creates a tenant-scoped, range-capable reader for immutable DAG objects. */
export const createTeleportS3Source = (
  port: TeleportS3Port,
  options: Pick<TeleportS3StoreOptions, 'bucket' | 'tenantPrefix'>
): TeleportResult<TeleportS3Source> => {
  const segments = options.tenantPrefix.split('/').filter(Boolean);
  if (!options.bucket || !segments.length || segments.some(segment => !safePathSegment(segment)) || !port.getObject) {
    return err({ code: 'dependency-invalid', message: 'S3 range source configuration is invalid.' });
  }
  const prefix = segments.join('/');
  return ok({
    readObject: (cid, kind, range) => {
      if (!validCid(cid) || (range && !validRange(range))) {
        return Promise.resolve(err({ code: 'dependency-invalid', message: 'S3 object CID or byte range is invalid.' }));
      }
      return port.getObject!({
        bucket: options.bucket,
        key: `${prefix}/${kind === 'root' ? 'roots' : 'blocks'}/${cid}`,
        ...(range ? { range } : {})
      });
    }
  });
};

export const collectTeleportS3Object = async (
  output: TeleportS3GetOutput,
  maxBytes: number
): Promise<TeleportResult<Uint8Array>> => {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0 || output.contentLength > maxBytes) {
    return err({ code: 'budget-exceeded', message: 'S3 object exceeds its read budget.' });
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of output.body) {
    if (!(chunk instanceof Uint8Array)) return err({ code: 'car-invalid', message: 'S3 object stream yielded a non-byte chunk.' });
    total += chunk.byteLength;
    if (total > maxBytes || total > output.contentLength) return err({ code: 'budget-exceeded', message: 'S3 object stream exceeds its declared or configured budget.' });
    chunks.push(chunk);
  }
  if (total !== output.contentLength) return err({ code: 'car-invalid', message: 'S3 object stream length does not match its declaration.' });
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return ok(bytes);
};

export const createTeleportS3Store = (
  port: TeleportS3Port,
  options: TeleportS3StoreOptions
): TeleportResult<TeleportCloudStore> => {
  const segments = options.tenantPrefix.split('/').filter(Boolean);
  if (!options.bucket || !segments.length || segments.some(segment => !safePathSegment(segment))) {
    return err({ code: 'dependency-invalid', message: 'S3 bucket or tenant prefix is invalid.' });
  }
  const prefix = segments.join('/');
  const put = async (input: TeleportS3PutInput): Promise<TeleportResult<TeleportS3PutOutput>> =>
    port.putMultipart && input.body.byteLength >= (options.multipartThresholdBytes ?? 8 * 1024 * 1024)
      ? port.putMultipart({ ...input, partSizeBytes: options.multipartPartSizeBytes ?? 8 * 1024 * 1024 })
      : port.putObject(input);
  return ok({
    putImmutable: async object => {
      const result = await put({
        bucket: options.bucket,
        key: `${prefix}/${object.kind === 'root' ? 'roots' : 'blocks'}/${object.cid}`,
        body: object.bytes,
        checksumSha256: base64(object.cid.multihash.digest),
        contentType: object.kind === 'root' ? 'application/vnd.ipld.dag-cbor' : 'application/octet-stream',
        ifNoneMatch: '*'
      });
      return result.ok ? ok(result.value.outcome ?? 'created') : result;
    },
    publishHead: async head => {
      if (!safePathSegment(head.workspaceId)) return err({ code: 'dependency-invalid', message: 'Workspace head identity is invalid.' });
      const body = new TextEncoder().encode(JSON.stringify({ root: head.root }));
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', body));
      return put({
        bucket: options.bucket,
        key: `${prefix}/heads/${head.workspaceId}.json`,
        body,
        checksumSha256: base64(digest),
        contentType: 'application/json',
        ...(head.previousVersion ? { ifMatch: head.previousVersion } : { ifNoneMatch: '*' })
      });
    }
  });
};

export interface TeleportRetentionPlan {
  readonly retainedRoots: readonly string[];
  readonly reachableObjectCids: readonly string[];
  readonly deleteCandidateCids: readonly string[];
}

export const planTeleportReachabilityRetention = (
  publications: readonly TeleportCloudPublication[],
  retainedRoots: readonly string[],
  allObjectCids: readonly string[]
): TeleportResult<TeleportRetentionPlan> => {
  const byRoot = new Map(publications.map(publication => [publication.root, publication] as const));
  const retained = [...new Set(retainedRoots)].toSorted();
  const missing = retained.filter(root => !byRoot.has(root));
  if (missing.length) return err({ code: 'missing-block', message: `Retained cloud root ${missing[0]} has no publication inventory.` });
  const reachable = new Set<string>();
  for (const root of retained) for (const object of byRoot.get(root)?.objects ?? []) reachable.add(object.cid.toString());
  return ok({
    retainedRoots: retained,
    reachableObjectCids: [...reachable].toSorted(),
    deleteCandidateCids: [...new Set(allObjectCids)].filter(cid => !reachable.has(cid)).toSorted()
  });
};
