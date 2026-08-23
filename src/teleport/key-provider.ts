import type { VerifiedTeleportCartridge } from './cartridge';
import { err, type TeleportResult } from './result';
import { protectCapabilityBlocksForRecipient, unlockTeleportCartridgeForRecipient, unlockTeleportCartridgeWithRecipientUnwrapper, type ProtectedCapabilitySet } from './protection';
import type { EncodedCapabilityBlock } from './types';

type TeleportRecipientKeyProviderIdentity = Readonly<{
  readonly providerId: string;
}>;

type TeleportRecipientKeyProviderOperations = Readonly<{
  readonly getPublicKey: (keyId: string) => Promise<TeleportResult<CryptoKey>>;
  readonly getPrivateKey: (keyId: string) => Promise<TeleportResult<CryptoKey>>;
}>;

export type TeleportRecipientKeyProvider =
  & TeleportRecipientKeyProviderIdentity
  & TeleportRecipientKeyProviderOperations;

/** Account, KMS, and hardware seam: unwraps a data key without returning private-key material. */
type TeleportRecipientUnwrapProviderIdentity = Readonly<{
  readonly providerId: string;
}>;

type TeleportRecipientUnwrapProviderOperations = Readonly<{
  readonly unwrapKey: (keyId: string, wrappedKey: Uint8Array) => Promise<TeleportResult<Uint8Array>>;
}>;

export type TeleportRecipientUnwrapProvider =
  & TeleportRecipientUnwrapProviderIdentity
  & TeleportRecipientUnwrapProviderOperations;

export const protectCapabilityBlocksWithKeyProvider = async (
  capabilities: readonly EncodedCapabilityBlock[],
  provider: TeleportRecipientKeyProvider,
  keyId: string
): Promise<TeleportResult<ProtectedCapabilitySet>> => {
  const key = await provider.getPublicKey(keyId);
  return key.ok ? protectCapabilityBlocksForRecipient(capabilities, { keyId: `${provider.providerId}:${keyId}`, publicKey: key.value }) : key;
};

export const unlockTeleportCartridgeWithKeyProvider = async (
  cartridge: VerifiedTeleportCartridge,
  provider: TeleportRecipientKeyProvider
): Promise<TeleportResult<VerifiedTeleportCartridge>> => {
  const descriptor = cartridge.keyEnvelopes.map(envelope => envelope.descriptor).find(candidate => candidate.mode === 'rsa-oaep-aes-256-gcm-v1' && candidate.recipientKeyId.startsWith(`${provider.providerId}:`));
  if (!descriptor || descriptor.mode !== 'rsa-oaep-aes-256-gcm-v1') return err({ code: 'policy-rejected', message: `Cartridge has no recipient envelope for provider ${provider.providerId}.` });
  const localKeyId = descriptor.recipientKeyId.slice(provider.providerId.length + 1);
  const key = await provider.getPrivateKey(localKeyId);
  return key.ok ? unlockTeleportCartridgeForRecipient(cartridge, { keyId: descriptor.recipientKeyId, privateKey: key.value }) : key;
};

export const unlockTeleportCartridgeWithUnwrapProvider = async (
  cartridge: VerifiedTeleportCartridge,
  provider: TeleportRecipientUnwrapProvider
): Promise<TeleportResult<VerifiedTeleportCartridge>> => {
  const descriptor = cartridge.keyEnvelopes.map(envelope => envelope.descriptor).find(candidate => candidate.mode === 'rsa-oaep-aes-256-gcm-v1' && candidate.recipientKeyId.startsWith(`${provider.providerId}:`));
  if (!descriptor || descriptor.mode !== 'rsa-oaep-aes-256-gcm-v1') return err({ code: 'policy-rejected', message: `Cartridge has no recipient envelope for provider ${provider.providerId}.` });
  const localKeyId = descriptor.recipientKeyId.slice(provider.providerId.length + 1);
  return unlockTeleportCartridgeWithRecipientUnwrapper(cartridge, {
    keyId: descriptor.recipientKeyId,
    unwrapKey: wrappedKey => provider.unwrapKey(localKeyId, wrappedKey)
  });
};
