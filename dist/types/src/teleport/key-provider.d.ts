import type { VerifiedTeleportCartridge } from './cartridge';
import { type TeleportResult } from './result';
import { type ProtectedCapabilitySet } from './protection';
import type { EncodedCapabilityBlock } from './types';
type TeleportRecipientKeyProviderIdentity = Readonly<{
    readonly providerId: string;
}>;
type TeleportRecipientKeyProviderOperations = Readonly<{
    readonly getPublicKey: (keyId: string) => Promise<TeleportResult<CryptoKey>>;
    readonly getPrivateKey: (keyId: string) => Promise<TeleportResult<CryptoKey>>;
}>;
export type TeleportRecipientKeyProvider = TeleportRecipientKeyProviderIdentity & TeleportRecipientKeyProviderOperations;
/** Account, KMS, and hardware seam: unwraps a data key without returning private-key material. */
type TeleportRecipientUnwrapProviderIdentity = Readonly<{
    readonly providerId: string;
}>;
type TeleportRecipientUnwrapProviderOperations = Readonly<{
    readonly unwrapKey: (keyId: string, wrappedKey: Uint8Array) => Promise<TeleportResult<Uint8Array>>;
}>;
export type TeleportRecipientUnwrapProvider = TeleportRecipientUnwrapProviderIdentity & TeleportRecipientUnwrapProviderOperations;
export declare const protectCapabilityBlocksWithKeyProvider: (capabilities: readonly EncodedCapabilityBlock[], provider: TeleportRecipientKeyProvider, keyId: string) => Promise<TeleportResult<ProtectedCapabilitySet>>;
export declare const unlockTeleportCartridgeWithKeyProvider: (cartridge: VerifiedTeleportCartridge, provider: TeleportRecipientKeyProvider) => Promise<TeleportResult<VerifiedTeleportCartridge>>;
export declare const unlockTeleportCartridgeWithUnwrapProvider: (cartridge: VerifiedTeleportCartridge, provider: TeleportRecipientUnwrapProvider) => Promise<TeleportResult<VerifiedTeleportCartridge>>;
export {};
