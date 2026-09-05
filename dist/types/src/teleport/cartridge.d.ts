import { CID } from 'multiformats/cid';
import { type TeleportCodecRegistry } from './codec';
import { type TeleportIssue, type TeleportResult } from './result';
import { type EncodedCapabilityBlock, type TeleportCapabilityDescriptor, type TeleportCartridgeLimits, type TeleportCartridgeManifestV1, type TeleportKeyEnvelopeBlock, type TeleportKeyEnvelopeDescriptor, type TeleportSignatureBlock, type TeleportSignatureDescriptor } from './types';
export interface CreateTeleportCartridgeInput {
    readonly capabilities: readonly EncodedCapabilityBlock[];
    readonly keyEnvelopes?: readonly TeleportKeyEnvelopeBlock[];
    readonly signatures?: readonly TeleportSignatureBlock[];
    readonly createdAt?: string;
    readonly limits?: Partial<TeleportCartridgeLimits>;
}
export interface TeleportCartridgeArchive {
    readonly bytes: Uint8Array;
    readonly root: CID;
    readonly rootBytes: Uint8Array;
    readonly manifest: TeleportCartridgeManifestV1;
}
export interface TeleportCartridgeStreamArchive extends Omit<TeleportCartridgeArchive, 'bytes'> {
    readonly chunks: AsyncIterable<Uint8Array>;
}
export interface TeleportCartridgeChunkSink {
    readonly write: (chunk: Uint8Array) => Promise<void>;
}
export declare const streamTeleportCartridge: (input: CreateTeleportCartridgeInput) => Promise<TeleportResult<TeleportCartridgeStreamArchive>>;
export declare const writeTeleportCartridge: (input: CreateTeleportCartridgeInput, sink: TeleportCartridgeChunkSink) => Promise<TeleportResult<Omit<TeleportCartridgeArchive, "bytes">>>;
export declare const createTeleportCartridge: (input: CreateTeleportCartridgeInput) => Promise<TeleportResult<TeleportCartridgeArchive>>;
export interface VerifiedCapability {
    readonly descriptor: TeleportCapabilityDescriptor;
    readonly storedBytes: Uint8Array;
    readonly contentBytes?: Uint8Array;
}
export interface VerifiedKeyEnvelope {
    readonly descriptor: TeleportKeyEnvelopeDescriptor;
    readonly bytes: Uint8Array;
}
export interface VerifiedSignature {
    readonly descriptor: TeleportSignatureDescriptor;
    readonly bytes: Uint8Array;
}
export interface VerifiedTeleportCartridge {
    readonly root: CID;
    readonly rootBytes: Uint8Array;
    readonly manifest: TeleportCartridgeManifestV1;
    readonly capabilities: readonly VerifiedCapability[];
    readonly keyEnvelopes: readonly VerifiedKeyEnvelope[];
    readonly signatures: readonly VerifiedSignature[];
}
export declare const verifyTeleportCartridge: (bytes: Uint8Array, overrides?: Partial<TeleportCartridgeLimits>) => Promise<TeleportResult<VerifiedTeleportCartridge>>;
export declare const verifyTeleportCartridgeStream: (chunks: AsyncIterable<Uint8Array>, limits?: Partial<TeleportCartridgeLimits>) => Promise<TeleportResult<VerifiedTeleportCartridge>>;
export type TeleportInventoryEntry = Readonly<{
    status: 'supported';
    capability: VerifiedCapability;
    value: unknown;
}> | Readonly<{
    status: 'unsupported-optional';
    capability: VerifiedCapability;
}> | Readonly<{
    status: 'unsupported-required';
    capability: VerifiedCapability;
    issue: TeleportIssue;
}> | Readonly<{
    status: 'invalid';
    capability: VerifiedCapability;
    issues: readonly TeleportIssue[];
}>;
export declare const decodeTeleportInventory: (cartridge: VerifiedTeleportCartridge, registry: TeleportCodecRegistry) => readonly TeleportInventoryEntry[];
export declare const reexportVerifiedCartridge: (cartridge: VerifiedTeleportCartridge, createdAt?: string | undefined) => Promise<TeleportResult<TeleportCartridgeArchive>>;
