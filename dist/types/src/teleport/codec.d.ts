import { type TeleportResult } from './result';
import { type EncodedCapabilityBlock, type TeleportCapabilityCodec, type TeleportRestoreMode, type TeleportRestoreStep, type TeleportSecurityClass } from './types';
type RegisteredTeleportCodecData = Readonly<{
    readonly capabilityId: string;
    readonly currentVersion: number;
    readonly acceptedVersions: readonly number[];
    readonly securityClass: TeleportSecurityClass;
    readonly blockCodec: 'dag-cbor' | 'raw';
}>;
type RegisteredTeleportCodecOperations = Readonly<{
    readonly decode: (version: number, bytes: Uint8Array) => TeleportResult<unknown>;
    readonly restorePlan: (version: number, bytes: Uint8Array, context: Readonly<{
        instanceId: string;
        restoreMode: TeleportRestoreMode;
    }>) => TeleportResult<readonly TeleportRestoreStep[]>;
}>;
export type RegisteredTeleportCodec = RegisteredTeleportCodecData & RegisteredTeleportCodecOperations;
export type TeleportCodecRegistry = readonly RegisteredTeleportCodec[];
export declare const createTeleportCodecRegistry: () => TeleportCodecRegistry;
export declare const teleportCodecFromRegistry: (registry: TeleportCodecRegistry, capabilityId: string) => RegisteredTeleportCodec | undefined;
export declare const teleportCodecRegistrySupports: (registry: TeleportCodecRegistry, capabilityId: string, version: number) => boolean;
export declare const registerTeleportCodec: <T>(registry: TeleportCodecRegistry, codec: TeleportCapabilityCodec<T>) => TeleportResult<TeleportCodecRegistry>;
export declare const createTeleportCodecRegistryWith: <T>(codec: TeleportCapabilityCodec<T>) => TeleportResult<TeleportCodecRegistry>;
export declare const migrateCapabilityValue: <T>(codec: TeleportCapabilityCodec<T>, version: number, value: unknown) => TeleportResult<T>;
export interface EncodeCapabilityInput<T> {
    readonly codec: TeleportCapabilityCodec<T>;
    readonly value: T;
    readonly instanceId: string;
    readonly required?: boolean;
    readonly restoreMode?: TeleportRestoreMode;
}
export declare const encodeCapability: <T>(input: EncodeCapabilityInput<T>) => Promise<TeleportResult<EncodedCapabilityBlock<T>>>;
export declare const decodeCapability: <T>(codec: TeleportCapabilityCodec<T>, version: number, bytes: Uint8Array) => TeleportResult<T>;
export {};
