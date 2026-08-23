import type { CID } from 'multiformats/cid';

import type { TeleportResult } from './result';

export type TeleportSecurityClass = 'public' | 'private' | 'secret' | 'opaque-native';
export type TeleportRestoreMode = 'merge' | 'replace' | 'rebase' | 'exact-replay' | 'retain';
export type TeleportDependencyKind =
  | 'hard-decode'
  | 'restore-order'
  | 'optional-enhancement'
  | 'application-availability';

export interface TeleportDecodeBudget {
  readonly maxBlockBytes: number;
  readonly maxDepth: number;
  readonly maxNodes: number;
  readonly maxStringBytes: number;
  readonly maxCollectionEntries: number;
}

export const DEFAULT_CAPABILITY_BUDGET: TeleportDecodeBudget = Object.freeze({
  maxBlockBytes: 1024 * 1024,
  maxDepth: 32,
  maxNodes: 50_000,
  maxStringBytes: 256 * 1024,
  maxCollectionEntries: 10_000
});

export interface TeleportCapabilityDependency {
  readonly kind: TeleportDependencyKind;
  readonly capabilityId: string;
  readonly instanceId?: string;
  readonly required: boolean;
}

export interface TeleportRestoreStep {
  readonly id: string;
  readonly capabilityInstanceId: string;
  readonly effect:
    | 'safe-local'
    | 'network-rebase'
    | 'secret-unlock'
    | 'asset-materialize'
    | 'store-stage'
    | 'merge'
    | 'destructive-replace'
    | 'stale-exact-replay'
    | 'unresolved-retain';
  readonly dependsOn: readonly string[];
  readonly resources: readonly string[];
  readonly requiresConfirmation: boolean;
  readonly reversible: boolean;
  readonly verification: string;
  readonly rollback?: string;
}

export interface TeleportRestorePlan {
  readonly steps: readonly TeleportRestoreStep[];
  readonly confirmations: readonly string[];
  readonly unresolvedOptionalInstances: readonly string[];
}

type TeleportCapabilityMigrationData = Readonly<{
  readonly fromVersion: number;
  readonly toVersion: number;
  readonly lossyFields: readonly string[];
}>;

type TeleportCapabilityMigrationOperations = Readonly<{
  readonly migrate: (value: unknown) => TeleportResult<unknown>;
}>;

export type TeleportCapabilityMigration =
  & TeleportCapabilityMigrationData
  & TeleportCapabilityMigrationOperations;

type TeleportCapabilityCodecData = Readonly<{
  readonly capabilityId: string;
  readonly currentVersion: number;
  readonly acceptedVersions: readonly number[];
  readonly securityClass: TeleportSecurityClass;
  readonly codec?: 'dag-cbor' | 'raw';
  readonly budget?: Partial<TeleportDecodeBudget>;
  readonly migrations?: readonly TeleportCapabilityMigration[];
}>;

type TeleportCapabilityCodecOperations<TCurrent> = Readonly<{
  readonly encode: (value: TCurrent) => TeleportResult<unknown>;
  readonly decode: (version: number, value: unknown) => TeleportResult<TCurrent>;
  readonly decodeHistorical?: (version: number, value: unknown) => TeleportResult<unknown>;
  readonly dependencies?: (value: TCurrent) => readonly TeleportCapabilityDependency[];
  readonly restorePlan?: (
    value: TCurrent,
    context: Readonly<{ instanceId: string; restoreMode: TeleportRestoreMode }>
  ) => TeleportResult<readonly TeleportRestoreStep[]>;
}>;

export type TeleportCapabilityCodec<TCurrent> =
  & TeleportCapabilityCodecData
  & TeleportCapabilityCodecOperations<TCurrent>;

export interface EncodedCapabilityBlock<TCurrent = unknown> {
  readonly capabilityId: string;
  readonly instanceId: string;
  readonly schemaVersion: number;
  readonly securityClass: TeleportSecurityClass;
  readonly required: boolean;
  readonly restoreMode: TeleportRestoreMode;
  readonly codec: 'dag-cbor' | 'raw';
  readonly dependencies: readonly TeleportCapabilityDependency[];
  readonly bytes: Uint8Array;
  readonly cid: CID;
  readonly value?: TCurrent;
  readonly protection?: TeleportCapabilityProtection;
}

export type TeleportCapabilityProtection =
  | Readonly<{ mode: 'plain' }>
  | Readonly<{
      mode: 'aes-256-gcm-v1';
      keyEnvelopeId: string;
      keyId: string;
      iv: Uint8Array;
      plaintextCid: CID;
    }>;

export type TeleportKeyEnvelopeDescriptor = Readonly<{
  readonly id: string;
  readonly mode: 'pbkdf2-aes-256-gcm-v1';
  readonly block: CID;
  readonly salt: Uint8Array;
  readonly iv: Uint8Array;
  readonly iterations: number;
  readonly hash: 'SHA-256';
}> | Readonly<{
  readonly id: string;
  readonly mode: 'rsa-oaep-aes-256-gcm-v1';
  readonly block: CID;
  readonly recipientKeyId: string;
  readonly iv: Uint8Array;
  readonly hash: 'SHA-256';
}>;

export interface TeleportKeyEnvelopeBlock {
  readonly descriptor: TeleportKeyEnvelopeDescriptor;
  readonly bytes: Uint8Array;
}

export interface TeleportSignatureDescriptor {
  readonly id: string;
  readonly mode: 'ed25519-v1';
  readonly signerKeyId: string;
  readonly signedPayload: CID;
  readonly block: CID;
}

export interface TeleportSignatureBlock {
  readonly descriptor: TeleportSignatureDescriptor;
  readonly bytes: Uint8Array;
}

export interface TeleportCapabilityDescriptor {
  readonly capabilityId: string;
  readonly instanceId: string;
  readonly schemaVersion: number;
  readonly securityClass: TeleportSecurityClass;
  readonly required: boolean;
  readonly restoreMode: TeleportRestoreMode;
  readonly codec: 'dag-cbor' | 'raw';
  readonly block: CID;
  readonly protection: TeleportCapabilityProtection;
  readonly dependencies: readonly TeleportCapabilityDependency[];
}

export interface TeleportCartridgeManifestV1 {
  readonly type: 'wx-teleport-cartridge';
  readonly version: 1;
  readonly createdAt?: string;
  readonly capabilities: readonly TeleportCapabilityDescriptor[];
  readonly keyEnvelopes: readonly TeleportKeyEnvelopeDescriptor[];
  readonly signatures: readonly TeleportSignatureDescriptor[];
}

export interface TeleportCartridgeLimits {
  readonly maxCarBytes: number;
  readonly maxBlocks: number;
  readonly maxBlockBytes: number;
  readonly maxCapabilities: number;
  readonly maxManifestBytes: number;
}

export const DEFAULT_CARTRIDGE_LIMITS: TeleportCartridgeLimits = Object.freeze({
  maxCarBytes: 64 * 1024 * 1024,
  maxBlocks: 1024,
  maxBlockBytes: 16 * 1024 * 1024,
  maxCapabilities: 512,
  maxManifestBytes: 1024 * 1024
});
