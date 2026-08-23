import type { VerifiedCapability, VerifiedKeyEnvelope, VerifiedTeleportCartridge } from './cartridge';
import {
  isRsaOaepKey,
  protectionBytesMatchCid,
  protectionDecode,
  protectionDecryptAes,
  protectionDecryptForRecipient,
  protectionDecryptWithPassphrase,
  protectionEncode,
  protectionEncryptAes,
  protectionEncryptForRecipient,
  protectionEncryptWithPassphrase,
  protectionRandomBytes,
  protectionRandomId,
  protectionRawCid,
  runProtectionEffect
} from './protection-webcrypto-runtime';
import { err, ok, type TeleportIssue, type TeleportResult } from './result';
import type {
  EncodedCapabilityBlock,
  TeleportCapabilityProtection,
  TeleportKeyEnvelopeBlock,
  TeleportKeyEnvelopeDescriptor
} from './types';

const KDF_ITERATIONS = 310_000;

const PROTECTION_FAILED: TeleportIssue = {
  code: 'capability-invalid',
  message: 'Capability protection failed.'
};

const RECIPIENT_PROTECTION_FAILED: TeleportIssue = {
  code: 'capability-invalid',
  message: 'Recipient capability protection failed.'
};

const UNLOCK_FAILED: TeleportIssue = {
  code: 'decode-failed',
  message: 'Cartridge unlock failed.'
};

const RECIPIENT_UNLOCK_FAILED: TeleportIssue = {
  code: 'decode-failed',
  message: 'Recipient cartridge unlock failed.'
};

const RECIPIENT_KEY_UNWRAP_FAILED: TeleportIssue = {
  code: 'decode-failed',
  message: 'Recipient key unwrap failed.'
};

type CapabilityKey = Readonly<{
  keyId: string;
  key: Uint8Array;
}>;

type EncryptedCapability = Readonly<{
  capability: EncodedCapabilityBlock;
  key: CapabilityKey;
}>;

type EncryptedCapabilities = Readonly<{
  capabilities: readonly EncodedCapabilityBlock[];
  keys: readonly CapabilityKey[];
}>;

type UnwrappedEnvelope = Readonly<{
  envelopeId: string;
  keys: readonly CapabilityKey[];
}>;

type Recipient = Readonly<{
  keyId: string;
  publicKey: CryptoKey;
}>;

type ProtectedCapability = Extract<TeleportCapabilityProtection, Readonly<{ mode: 'aes-256-gcm-v1' }>>;

type AsyncProjection<Input, Output> = (
  value: Input,
  index: number
) => Promise<TeleportResult<Output>>;

type Projection<Input, Output> = (
  value: Input,
  index: number
) => TeleportResult<Output>;

const warningsFrom = (
  ...warnings: readonly (readonly TeleportIssue[])[]
): readonly TeleportIssue[] => warnings.flat();

const traverse = <Input, Output>(
  values: readonly Input[],
  project: Projection<Input, Output>
): TeleportResult<readonly Output[]> => values.reduce<TeleportResult<readonly Output[]>>(
  (accumulated, value, index) => {
    if (!accumulated.ok) return accumulated;
    const projected = project(value, index);
    return projected.ok
      ? ok(
        [...accumulated.value, projected.value],
        warningsFrom(accumulated.warnings, projected.warnings)
      )
      : projected;
  },
  ok([])
);

const traverseAsync = <Input, Output>(
  values: readonly Input[],
  project: AsyncProjection<Input, Output>
): Promise<TeleportResult<readonly Output[]>> => values.reduce<Promise<TeleportResult<readonly Output[]>>>(
  async (pending, value, index) => {
    const accumulated = await pending;
    if (!accumulated.ok) return accumulated;
    const projected = await project(value, index);
    return projected.ok
      ? ok(
        [...accumulated.value, projected.value],
        warningsFrom(accumulated.warnings, projected.warnings)
      )
      : projected;
  },
  Promise.resolve(ok([]))
);

const associatedData = (
  capability: Pick<EncodedCapabilityBlock, 'capabilityId' | 'instanceId' | 'schemaVersion'>,
  envelopeId: string,
  issue: TeleportIssue
): TeleportResult<Uint8Array> => protectionEncode({
  type: 'wx-teleport-capability-aad',
  version: 1,
  capabilityId: capability.capabilityId,
  instanceId: capability.instanceId,
  schemaVersion: capability.schemaVersion,
  keyEnvelopeId: envelopeId
}, issue);

export interface ProtectedCapabilitySet {
  readonly capabilities: readonly EncodedCapabilityBlock[];
  readonly keyEnvelopes: readonly TeleportKeyEnvelopeBlock[];
}

const encryptCapability = async (
  capability: EncodedCapabilityBlock,
  envelopeId: string
): Promise<TeleportResult<EncryptedCapability>> => {
  const keyId = protectionRandomId(PROTECTION_FAILED);
  if (!keyId.ok) return keyId;
  const keyBytes = protectionRandomBytes(32, PROTECTION_FAILED);
  if (!keyBytes.ok) return keyBytes;
  const iv = protectionRandomBytes(12, PROTECTION_FAILED);
  if (!iv.ok) return iv;
  const aad = associatedData(capability, envelopeId, PROTECTION_FAILED);
  if (!aad.ok) return aad;
  const ciphertext = await protectionEncryptAes(
    keyBytes.value,
    capability.bytes,
    iv.value,
    aad.value,
    PROTECTION_FAILED
  );
  if (!ciphertext.ok) return ciphertext;
  const cid = await protectionRawCid(ciphertext.value, PROTECTION_FAILED);
  return cid.ok
    ? ok({
      capability: {
        ...capability,
        bytes: ciphertext.value,
        cid: cid.value,
        protection: {
          mode: 'aes-256-gcm-v1',
          keyEnvelopeId: envelopeId,
          keyId: keyId.value,
          iv: iv.value,
          plaintextCid: capability.cid
        }
      },
      key: { keyId: keyId.value, key: keyBytes.value }
    }, warningsFrom(
      keyId.warnings,
      keyBytes.warnings,
      iv.warnings,
      aad.warnings,
      ciphertext.warnings,
      cid.warnings
    ))
    : cid;
};

const encryptCapabilities = async (
  capabilities: readonly EncodedCapabilityBlock[],
  envelopeId: string
): Promise<TeleportResult<EncryptedCapabilities>> => {
  const encrypted = await traverseAsync(
    capabilities,
    capability => encryptCapability(capability, envelopeId)
  );
  return encrypted.ok
    ? ok({
      capabilities: encrypted.value.map(entry => entry.capability),
      keys: encrypted.value.map(entry => entry.key)
    }, encrypted.warnings)
    : encrypted;
};

const encodeEnvelopeKeys = (
  keys: readonly CapabilityKey[],
  issue: TeleportIssue
): TeleportResult<Uint8Array> => protectionEncode({
  type: 'wx-teleport-key-envelope',
  version: 1,
  keys
}, issue);

export const protectCapabilityBlocks = async (
  capabilities: readonly EncodedCapabilityBlock[],
  passphrase: string
): Promise<TeleportResult<ProtectedCapabilitySet>> => {
  if (!passphrase) {
    return err({ code: 'capability-invalid', message: 'A non-empty export passphrase is required.' });
  }
  const envelopeId = protectionRandomId(PROTECTION_FAILED);
  if (!envelopeId.ok) return envelopeId;
  const encrypted = await encryptCapabilities(capabilities, envelopeId.value);
  if (!encrypted.ok) return encrypted;
  const envelopePlaintext = encodeEnvelopeKeys(encrypted.value.keys, PROTECTION_FAILED);
  if (!envelopePlaintext.ok) return envelopePlaintext;
  const salt = protectionRandomBytes(16, PROTECTION_FAILED);
  if (!salt.ok) return salt;
  const iv = protectionRandomBytes(12, PROTECTION_FAILED);
  if (!iv.ok) return iv;
  const envelopeBytes = await protectionEncryptWithPassphrase(
    passphrase,
    salt.value,
    KDF_ITERATIONS,
    envelopePlaintext.value,
    iv.value,
    PROTECTION_FAILED
  );
  if (!envelopeBytes.ok) return envelopeBytes;
  const block = await protectionRawCid(envelopeBytes.value, PROTECTION_FAILED);
  if (!block.ok) return block;
  const descriptor: TeleportKeyEnvelopeDescriptor = {
    id: envelopeId.value,
    mode: 'pbkdf2-aes-256-gcm-v1',
    block: block.value,
    salt: salt.value,
    iv: iv.value,
    iterations: KDF_ITERATIONS,
    hash: 'SHA-256'
  };
  return ok({
    capabilities: encrypted.value.capabilities,
    keyEnvelopes: [{ descriptor, bytes: envelopeBytes.value }]
  }, warningsFrom(
    envelopeId.warnings,
    encrypted.warnings,
    envelopePlaintext.warnings,
    salt.warnings,
    iv.warnings,
    envelopeBytes.warnings,
    block.warnings
  ));
};

const recipientSetIsValid = (recipients: readonly Recipient[]): boolean => recipients.length > 0
  && recipients.every(recipient => recipient.keyId.length > 0 && isRsaOaepKey(recipient.publicKey))
  && new Set(recipients.map(recipient => recipient.keyId)).size === recipients.length;

const protectEnvelopeForRecipient = async (
  recipient: Recipient,
  index: number,
  primaryEnvelopeId: string,
  plaintext: Uint8Array
): Promise<TeleportResult<TeleportKeyEnvelopeBlock>> => {
  const envelopeId = index === 0
    ? ok(primaryEnvelopeId)
    : protectionRandomId(RECIPIENT_PROTECTION_FAILED);
  if (!envelopeId.ok) return envelopeId;
  const wrappingKey = protectionRandomBytes(32, RECIPIENT_PROTECTION_FAILED);
  if (!wrappingKey.ok) return wrappingKey;
  const iv = protectionRandomBytes(12, RECIPIENT_PROTECTION_FAILED);
  if (!iv.ok) return iv;
  const ciphertext = await protectionEncryptAes(
    wrappingKey.value,
    plaintext,
    iv.value,
    undefined,
    RECIPIENT_PROTECTION_FAILED
  );
  if (!ciphertext.ok) return ciphertext;
  const wrappedKey = await protectionEncryptForRecipient(
    recipient.publicKey,
    wrappingKey.value,
    RECIPIENT_PROTECTION_FAILED
  );
  if (!wrappedKey.ok) return wrappedKey;
  const envelopeBytes = protectionEncode({
    wrappedKey: wrappedKey.value,
    ciphertext: ciphertext.value
  }, RECIPIENT_PROTECTION_FAILED);
  if (!envelopeBytes.ok) return envelopeBytes;
  const block = await protectionRawCid(envelopeBytes.value, RECIPIENT_PROTECTION_FAILED);
  if (!block.ok) return block;
  const descriptor: TeleportKeyEnvelopeDescriptor = {
    id: envelopeId.value,
    mode: 'rsa-oaep-aes-256-gcm-v1',
    block: block.value,
    recipientKeyId: recipient.keyId,
    iv: iv.value,
    hash: 'SHA-256'
  };
  return ok({ descriptor, bytes: envelopeBytes.value }, warningsFrom(
    envelopeId.warnings,
    wrappingKey.warnings,
    iv.warnings,
    ciphertext.warnings,
    wrappedKey.warnings,
    envelopeBytes.warnings,
    block.warnings
  ));
};

export const protectCapabilityBlocksForRecipient = async (
  capabilities: readonly EncodedCapabilityBlock[],
  recipient: Recipient
): Promise<TeleportResult<ProtectedCapabilitySet>> => protectCapabilityBlocksForRecipients(
  capabilities,
  [recipient]
);

export const protectCapabilityBlocksForRecipients = async (
  capabilities: readonly EncodedCapabilityBlock[],
  recipients: readonly Recipient[]
): Promise<TeleportResult<ProtectedCapabilitySet>> => {
  if (!recipientSetIsValid(recipients)) {
    return err({
      code: 'capability-invalid',
      message: 'One or more unique RSA-OAEP recipient keys are required.'
    });
  }
  const primaryEnvelopeId = protectionRandomId(RECIPIENT_PROTECTION_FAILED);
  if (!primaryEnvelopeId.ok) return primaryEnvelopeId;
  const encrypted = await encryptCapabilities(capabilities, primaryEnvelopeId.value);
  if (!encrypted.ok) return encrypted;
  const plaintext = encodeEnvelopeKeys(encrypted.value.keys, RECIPIENT_PROTECTION_FAILED);
  if (!plaintext.ok) return plaintext;
  const keyEnvelopes = await traverseAsync(
    recipients,
    (recipient, index) => protectEnvelopeForRecipient(
      recipient,
      index,
      primaryEnvelopeId.value,
      plaintext.value
    )
  );
  return keyEnvelopes.ok
    ? ok({
      capabilities: encrypted.value.capabilities,
      keyEnvelopes: keyEnvelopes.value
    }, warningsFrom(
      primaryEnvelopeId.warnings,
      encrypted.warnings,
      plaintext.warnings,
      keyEnvelopes.warnings
    ))
    : keyEnvelopes;
};

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const parseEnvelopeKey = (value: unknown): TeleportResult<CapabilityKey> => {
  if (!isRecord(value)) {
    return err({ code: 'decode-failed', message: 'Key envelope item is invalid.' });
  }
  const keyId = value['keyId'];
  const key = value['key'];
  return typeof keyId === 'string' && keyId.length > 0 && key instanceof Uint8Array && key.byteLength === 32
    ? ok({ keyId, key: Uint8Array.from(key) })
    : err({ code: 'decode-failed', message: 'Key envelope item is invalid.' });
};

const parseEnvelopePayload = (value: unknown): TeleportResult<readonly CapabilityKey[]> => {
  if (!isRecord(value)) {
    return err({ code: 'decode-failed', message: 'Key envelope payload is invalid.' });
  }
  const rawKeys = value['keys'];
  if (value['type'] !== 'wx-teleport-key-envelope' || value['version'] !== 1 || !Array.isArray(rawKeys)) {
    return err({ code: 'decode-failed', message: 'Key envelope payload is invalid.' });
  }
  const parsed = traverse(rawKeys, entry => parseEnvelopeKey(entry));
  if (!parsed.ok) return parsed;
  return new Set(parsed.value.map(entry => entry.keyId)).size === parsed.value.length
    ? parsed
    : err({ code: 'decode-failed', message: 'Key envelope item is invalid.' });
};

const unwrapPassphraseEnvelope = async (
  envelope: VerifiedKeyEnvelope,
  passphrase: string
): Promise<TeleportResult<UnwrappedEnvelope>> => {
  const descriptor = envelope.descriptor;
  if (descriptor.mode !== 'pbkdf2-aes-256-gcm-v1') {
    return err({
      code: 'policy-rejected',
      message: 'Cartridge requires a recipient private key rather than a passphrase.'
    });
  }
  const plaintext = await protectionDecryptWithPassphrase(
    passphrase,
    descriptor.salt,
    descriptor.iterations,
    envelope.bytes,
    descriptor.iv,
    UNLOCK_FAILED
  );
  if (!plaintext.ok) return plaintext;
  const decoded = protectionDecode(plaintext.value, UNLOCK_FAILED);
  if (!decoded.ok) return decoded;
  const parsed = parseEnvelopePayload(decoded.value);
  return parsed.ok
    ? ok({ envelopeId: descriptor.id, keys: parsed.value }, warningsFrom(
      plaintext.warnings,
      decoded.warnings,
      parsed.warnings
    ))
    : parsed;
};

const findExactKey = (
  envelopes: readonly UnwrappedEnvelope[],
  envelopeId: string,
  keyId: string
): Uint8Array | undefined => envelopes
  .find(envelope => envelope.envelopeId === envelopeId)
  ?.keys.find(key => key.keyId === keyId)
  ?.key;

const findLastKey = (
  envelopes: readonly UnwrappedEnvelope[],
  keyId: string
): Uint8Array | undefined => envelopes
  .flatMap(envelope => envelope.keys)
  .findLast(key => key.keyId === keyId)
  ?.key;

const unlockCapability = async (
  capability: VerifiedCapability,
  findKey: (protection: ProtectedCapability) => Uint8Array | undefined,
  issue: TeleportIssue
): Promise<TeleportResult<VerifiedCapability>> => {
  const protection = capability.descriptor.protection;
  if (protection.mode === 'plain') {
    return ok({ ...capability, contentBytes: capability.storedBytes });
  }
  const key = findKey(protection);
  if (key === undefined) {
    return err({
      code: 'missing-block',
      message: 'Protected capability key is unavailable.',
      capabilityId: capability.descriptor.capabilityId,
      instanceId: capability.descriptor.instanceId
    });
  }
  const aad = associatedData(capability.descriptor, protection.keyEnvelopeId, issue);
  if (!aad.ok) return aad;
  const plaintext = await protectionDecryptAes(
    key,
    capability.storedBytes,
    protection.iv,
    aad.value,
    issue
  );
  if (!plaintext.ok) return plaintext;
  const matchesCid = await protectionBytesMatchCid(
    plaintext.value,
    protection.plaintextCid,
    issue
  );
  if (!matchesCid.ok) return matchesCid;
  return matchesCid.value
    ? ok({ ...capability, contentBytes: plaintext.value }, warningsFrom(
      aad.warnings,
      plaintext.warnings,
      matchesCid.warnings
    ))
    : err({
      code: 'cid-mismatch',
      message: 'Protected capability plaintext does not match its CID.',
      capabilityId: capability.descriptor.capabilityId,
      instanceId: capability.descriptor.instanceId
    });
};

const unlockCapabilities = (
  capabilities: readonly VerifiedCapability[],
  findKey: (protection: ProtectedCapability) => Uint8Array | undefined,
  issue: TeleportIssue
): Promise<TeleportResult<readonly VerifiedCapability[]>> => traverseAsync(
  capabilities,
  capability => unlockCapability(capability, findKey, issue)
);

export const unlockTeleportCartridge = async (
  cartridge: VerifiedTeleportCartridge,
  passphrase: string
): Promise<TeleportResult<VerifiedTeleportCartridge>> => {
  if (!passphrase) {
    return err({ code: 'decode-failed', message: 'A cartridge passphrase is required.' });
  }
  const unwrapped = await traverseAsync(
    cartridge.keyEnvelopes,
    envelope => unwrapPassphraseEnvelope(envelope, passphrase)
  );
  if (!unwrapped.ok) return unwrapped;
  const capabilities = await unlockCapabilities(
    cartridge.capabilities,
    protection => findExactKey(unwrapped.value, protection.keyEnvelopeId, protection.keyId),
    UNLOCK_FAILED
  );
  return capabilities.ok
    ? ok({ ...cartridge, capabilities: capabilities.value }, warningsFrom(
      unwrapped.warnings,
      capabilities.warnings
    ))
    : capabilities;
};

type TeleportRecipientKeyUnwrapperIdentity = Readonly<{
  keyId: string;
}>;

type TeleportRecipientKeyUnwrapperOperations = Readonly<{
  unwrapKey: (wrappedKey: Uint8Array) => Promise<TeleportResult<Uint8Array>>;
}>;

export type TeleportRecipientKeyUnwrapper =
  & TeleportRecipientKeyUnwrapperIdentity
  & TeleportRecipientKeyUnwrapperOperations;

const parseRecipientEnvelope = (
  envelope: VerifiedKeyEnvelope
): TeleportResult<Readonly<{ wrappedKey: Uint8Array; ciphertext: Uint8Array }>> => {
  const decoded = protectionDecode(envelope.bytes, RECIPIENT_UNLOCK_FAILED);
  if (!decoded.ok) return decoded;
  const payload = decoded.value;
  if (!isRecord(payload)) {
    return err({ code: 'decode-failed', message: 'Recipient key envelope is invalid.' });
  }
  const wrappedKey = payload['wrappedKey'];
  const ciphertext = payload['ciphertext'];
  return wrappedKey instanceof Uint8Array && ciphertext instanceof Uint8Array
    ? ok({
      wrappedKey: Uint8Array.from(wrappedKey),
      ciphertext: Uint8Array.from(ciphertext)
    }, decoded.warnings)
    : err({ code: 'decode-failed', message: 'Recipient key envelope is invalid.' });
};

const unwrapRecipientEnvelope = async (
  envelope: VerifiedKeyEnvelope,
  recipient: TeleportRecipientKeyUnwrapper
): Promise<TeleportResult<UnwrappedEnvelope>> => {
  const payload = parseRecipientEnvelope(envelope);
  if (!payload.ok) return payload;
  const unwrappedKey = await runProtectionEffect(
    () => recipient.unwrapKey(payload.value.wrappedKey),
    RECIPIENT_UNLOCK_FAILED
  );
  if (!unwrappedKey.ok) return unwrappedKey;
  if (unwrappedKey.value.byteLength !== 32) {
    return err({ code: 'decode-failed', message: 'Recipient unwrapped key is invalid.' });
  }
  const plaintext = await protectionDecryptAes(
    unwrappedKey.value,
    payload.value.ciphertext,
    envelope.descriptor.iv,
    undefined,
    RECIPIENT_UNLOCK_FAILED
  );
  if (!plaintext.ok) return plaintext;
  const decoded = protectionDecode(plaintext.value, RECIPIENT_UNLOCK_FAILED);
  if (!decoded.ok) return decoded;
  const parsed = parseEnvelopePayload(decoded.value);
  return parsed.ok
    ? ok({ envelopeId: envelope.descriptor.id, keys: parsed.value }, warningsFrom(
      payload.warnings,
      unwrappedKey.warnings,
      plaintext.warnings,
      decoded.warnings,
      parsed.warnings
    ))
    : parsed;
};

export const unlockTeleportCartridgeWithRecipientUnwrapper = async (
  cartridge: VerifiedTeleportCartridge,
  recipient: TeleportRecipientKeyUnwrapper
): Promise<TeleportResult<VerifiedTeleportCartridge>> => {
  if (!recipient.keyId) {
    return err({ code: 'decode-failed', message: 'A recipient key identity is required.' });
  }
  const matchingEnvelopes: readonly VerifiedKeyEnvelope[] = cartridge.keyEnvelopes.filter(envelope => {
    const descriptor = envelope.descriptor;
    return descriptor.mode === 'rsa-oaep-aes-256-gcm-v1'
      && descriptor.recipientKeyId === recipient.keyId;
  });
  if (matchingEnvelopes.length === 0) {
    return err({
      code: 'policy-rejected',
      message: 'Cartridge recipient key identity does not match.'
    });
  }
  const unwrapped = await traverseAsync(
    matchingEnvelopes,
    envelope => unwrapRecipientEnvelope(envelope, recipient)
  );
  if (!unwrapped.ok) return unwrapped;
  const capabilities = await unlockCapabilities(
    cartridge.capabilities,
    protection => findExactKey(
      unwrapped.value,
      protection.keyEnvelopeId,
      protection.keyId
    ) ?? findLastKey(unwrapped.value, protection.keyId),
    RECIPIENT_UNLOCK_FAILED
  );
  return capabilities.ok
    ? ok({ ...cartridge, capabilities: capabilities.value }, warningsFrom(
      unwrapped.warnings,
      capabilities.warnings
    ))
    : capabilities;
};

export const unlockTeleportCartridgeForRecipient = async (
  cartridge: VerifiedTeleportCartridge,
  recipient: Readonly<{ keyId: string; privateKey: CryptoKey }>
): Promise<TeleportResult<VerifiedTeleportCartridge>> => {
  if (!recipient.keyId || !isRsaOaepKey(recipient.privateKey)) {
    return err({
      code: 'decode-failed',
      message: 'An RSA-OAEP recipient private key is required.'
    });
  }
  return unlockTeleportCartridgeWithRecipientUnwrapper(cartridge, {
    keyId: recipient.keyId,
    unwrapKey: wrappedKey => protectionDecryptForRecipient(
      recipient.privateKey,
      wrappedKey,
      RECIPIENT_KEY_UNWRAP_FAILED
    )
  });
};
