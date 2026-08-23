import { CID } from 'multiformats/cid';

import { encodeCapability } from './codec';
import { err, ok, type TeleportResult } from './result';
import type { EncodedCapabilityBlock, TeleportCapabilityCodec } from './types';

export const ASSET_BLOB_CAPABILITY_ID = 'wx.asset.blob' as const;
export const ASSET_METADATA_CAPABILITY_ID = 'wx.asset.metadata' as const;

export interface TeleportAssetMetadata {
  readonly name: string;
  readonly mediaType: string;
  readonly byteLength: number;
  readonly blobInstanceId: string;
  readonly blob: CID;
}

export const assetBlobCapabilityCodec: TeleportCapabilityCodec<Uint8Array> = {
  capabilityId: ASSET_BLOB_CAPABILITY_ID,
  currentVersion: 1,
  acceptedVersions: [1],
  securityClass: 'opaque-native',
  codec: 'raw',
  budget: { maxBlockBytes: 16 * 1024 * 1024 },
  encode: value => Object.prototype.toString.call(value) === '[object Uint8Array]' ? ok(Uint8Array.from(value)) : err({ code: 'capability-invalid', message: 'Asset blob must be bytes.' }),
  decode: (version, value) => version === 1 && Object.prototype.toString.call(value) === '[object Uint8Array]' ? ok(Uint8Array.from(value as Uint8Array)) : err({ code: 'decode-failed', message: 'Asset blob is invalid.' }),
  restorePlan: (_value, context) => ok([{ id: `asset-materialize:${context.instanceId}`, capabilityInstanceId: context.instanceId, effect: 'asset-materialize', dependsOn: [], resources: [`asset:${context.instanceId}`], requiresConfirmation: false, reversible: true, verification: 'asset bytes materialized with their verified CID', rollback: 'remove the materialized asset' }])
};

const validateMetadata = (value: unknown): TeleportResult<TeleportAssetMetadata> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return err({ code: 'decode-failed', message: 'Asset metadata is invalid.' });
  const record = value as Record<string, unknown>;
  if (Object.keys(record).toSorted().join(',') !== 'blob,blobInstanceId,byteLength,mediaType,name' || typeof record.name !== 'string' || !record.name || typeof record.mediaType !== 'string' || !record.mediaType || !Number.isSafeInteger(record.byteLength) || Number(record.byteLength) < 0 || typeof record.blobInstanceId !== 'string' || !record.blobInstanceId || !CID.asCID(record.blob)) return err({ code: 'decode-failed', message: 'Asset metadata contract is invalid.' });
  return ok({ name: record.name, mediaType: record.mediaType, byteLength: record.byteLength as number, blobInstanceId: record.blobInstanceId, blob: CID.asCID(record.blob)! });
};

export const assetMetadataCapabilityCodec: TeleportCapabilityCodec<TeleportAssetMetadata> = {
  capabilityId: ASSET_METADATA_CAPABILITY_ID,
  currentVersion: 1,
  acceptedVersions: [1],
  securityClass: 'public',
  encode: validateMetadata,
  decode: (version, value) => version === 1 ? validateMetadata(value) : err({ code: 'unsupported-version', message: `Unsupported asset metadata version ${version}.` }),
  dependencies: value => [{ kind: 'hard-decode', capabilityId: ASSET_BLOB_CAPABILITY_ID, instanceId: value.blobInstanceId, required: true }],
  restorePlan: (_value, context) => ok([{ id: `asset-metadata:${context.instanceId}`, capabilityInstanceId: context.instanceId, effect: 'safe-local', dependsOn: [], resources: [`asset-metadata:${context.instanceId}`], requiresConfirmation: false, reversible: true, verification: 'asset metadata points to the materialized blob CID', rollback: 'remove the imported asset metadata' }])
};

export const encodeTeleportAsset = async (input: Readonly<{ name: string; mediaType: string; bytes: Uint8Array; instanceId: string; required?: boolean }>): Promise<TeleportResult<Readonly<{ metadata: EncodedCapabilityBlock<TeleportAssetMetadata>; blob: EncodedCapabilityBlock<Uint8Array> }>>> => {
  const blobInstanceId = `${input.instanceId}:blob`;
  const blob = await encodeCapability({ codec: assetBlobCapabilityCodec, value: input.bytes, instanceId: blobInstanceId, required: input.required ?? false, restoreMode: 'replace' });
  if (!blob.ok) return blob;
  const metadata = await encodeCapability({ codec: assetMetadataCapabilityCodec, value: { name: input.name, mediaType: input.mediaType, byteLength: input.bytes.byteLength, blobInstanceId, blob: blob.value.cid }, instanceId: input.instanceId, required: input.required ?? false, restoreMode: 'replace' });
  return metadata.ok ? ok({ metadata: metadata.value, blob: blob.value }) : metadata;
};
