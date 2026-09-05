import type { VerifiedTeleportCartridge } from './cartridge';
import { type TeleportResult } from './result';
import type { EncodedCapabilityBlock, TeleportKeyEnvelopeBlock } from './types';
type Recipient = Readonly<{
    keyId: string;
    publicKey: CryptoKey;
}>;
export interface ProtectedCapabilitySet {
    readonly capabilities: readonly EncodedCapabilityBlock[];
    readonly keyEnvelopes: readonly TeleportKeyEnvelopeBlock[];
}
export declare const protectCapabilityBlocks: (capabilities: readonly EncodedCapabilityBlock[], passphrase: string) => Promise<TeleportResult<ProtectedCapabilitySet>>;
export declare const protectCapabilityBlocksForRecipient: (capabilities: readonly EncodedCapabilityBlock[], recipient: Recipient) => Promise<TeleportResult<ProtectedCapabilitySet>>;
export declare const protectCapabilityBlocksForRecipients: (capabilities: readonly EncodedCapabilityBlock[], recipients: readonly Recipient[]) => Promise<TeleportResult<ProtectedCapabilitySet>>;
export declare const unlockTeleportCartridge: (cartridge: VerifiedTeleportCartridge, passphrase: string) => Promise<TeleportResult<VerifiedTeleportCartridge>>;
type TeleportRecipientKeyUnwrapperIdentity = Readonly<{
    keyId: string;
}>;
type TeleportRecipientKeyUnwrapperOperations = Readonly<{
    unwrapKey: (wrappedKey: Uint8Array) => Promise<TeleportResult<Uint8Array>>;
}>;
export type TeleportRecipientKeyUnwrapper = TeleportRecipientKeyUnwrapperIdentity & TeleportRecipientKeyUnwrapperOperations;
export declare const unlockTeleportCartridgeWithRecipientUnwrapper: (cartridge: VerifiedTeleportCartridge, recipient: TeleportRecipientKeyUnwrapper) => Promise<TeleportResult<VerifiedTeleportCartridge>>;
export declare const unlockTeleportCartridgeForRecipient: (cartridge: VerifiedTeleportCartridge, recipient: Readonly<{
    keyId: string;
    privateKey: CryptoKey;
}>) => Promise<TeleportResult<VerifiedTeleportCartridge>>;
export {};
