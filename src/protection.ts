import * as dagCbor from '@ipld/dag-cbor';
import { coerce } from 'multiformats/bytes';
import { CID } from 'multiformats/cid';
import * as raw from 'multiformats/codecs/raw';
import { sha256 } from 'multiformats/hashes/sha2';

import { err, ok, type TeleportResult } from './result';
import type {
  EncodedCapabilityBlock,
  TeleportKeyEnvelopeBlock,
  TeleportKeyEnvelopeDescriptor
} from './types';
import type { VerifiedTeleportCartridge } from './cartridge';

const KDF_ITERATIONS = 310_000;
const encoder = new TextEncoder();

const arrayBuffer = (bytes: Uint8Array): ArrayBuffer => Uint8Array.from(bytes).buffer;

const randomId = (): string => {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return [...crypto.getRandomValues(new Uint8Array(16))].map(byte => byte.toString(16).padStart(2, '0')).join('');
};

const importAesKey = (bytes: Uint8Array, usages: readonly KeyUsage[]): Promise<CryptoKey> =>
  crypto.subtle.importKey('raw', arrayBuffer(bytes), { name: 'AES-GCM' }, false, [...usages]);

const deriveWrappingKey = async (passphrase: string, salt: Uint8Array, usage: KeyUsage): Promise<CryptoKey> => {
  const material = await crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', iterations: KDF_ITERATIONS, salt: arrayBuffer(salt) },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    [usage]
  );
};

const associatedData = (capability: Pick<EncodedCapabilityBlock, 'capabilityId' | 'instanceId' | 'schemaVersion'>, envelopeId: string): Uint8Array =>
  coerce(dagCbor.encode({
    type: 'wx-teleport-capability-aad',
    version: 1,
    capabilityId: capability.capabilityId,
    instanceId: capability.instanceId,
    schemaVersion: capability.schemaVersion,
    keyEnvelopeId: envelopeId
  }));

export interface ProtectedCapabilitySet {
  readonly capabilities: readonly EncodedCapabilityBlock[];
  readonly keyEnvelopes: readonly TeleportKeyEnvelopeBlock[];
}

const encryptCapabilities = async (
  capabilities: readonly EncodedCapabilityBlock[],
  envelopeId: string
): Promise<Readonly<{ capabilities: readonly EncodedCapabilityBlock[]; keys: readonly Readonly<{ keyId: string; key: Uint8Array }>[] }>> => {
  const keys: Array<Readonly<{ keyId: string; key: Uint8Array }>> = [];
  const protectedCapabilities: EncodedCapabilityBlock[] = [];
  for (const capability of capabilities) {
    const keyId = randomId();
    const keyBytes = crypto.getRandomValues(new Uint8Array(32));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: arrayBuffer(iv), additionalData: arrayBuffer(associatedData(capability, envelopeId)), tagLength: 128 },
      await importAesKey(keyBytes, ['encrypt']), arrayBuffer(capability.bytes)
    ));
    keys.push({ keyId, key: keyBytes });
    protectedCapabilities.push({ ...capability, bytes: ciphertext, cid: CID.createV1(raw.code, await sha256.digest(ciphertext)), protection: { mode: 'aes-256-gcm-v1', keyEnvelopeId: envelopeId, keyId, iv, plaintextCid: capability.cid } });
  }
  return { capabilities: protectedCapabilities, keys };
};

export const protectCapabilityBlocks = async (
  capabilities: readonly EncodedCapabilityBlock[],
  passphrase: string
): Promise<TeleportResult<ProtectedCapabilitySet>> => {
  if (!passphrase) return err({ code: 'capability-invalid', message: 'A non-empty export passphrase is required.' });
  try {
    const envelopeId = randomId();
    const encrypted = await encryptCapabilities(capabilities, envelopeId);
    const envelopePlaintext = coerce(dagCbor.encode({
      type: 'wx-teleport-key-envelope',
      version: 1,
      keys: encrypted.keys
    }));
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const envelopeBytes = new Uint8Array(await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: arrayBuffer(iv), tagLength: 128 },
      await deriveWrappingKey(passphrase, salt, 'encrypt'),
      arrayBuffer(envelopePlaintext)
    ));
    const descriptor: TeleportKeyEnvelopeDescriptor = {
      id: envelopeId,
      mode: 'pbkdf2-aes-256-gcm-v1',
      block: CID.createV1(raw.code, await sha256.digest(envelopeBytes)),
      salt,
      iv,
      iterations: KDF_ITERATIONS,
      hash: 'SHA-256'
    };
    return ok({ capabilities: encrypted.capabilities, keyEnvelopes: [{ descriptor, bytes: envelopeBytes }] });
  } catch {
    return err({ code: 'capability-invalid', message: 'Capability protection failed.' });
  }
};

export const protectCapabilityBlocksForRecipient = async (
  capabilities: readonly EncodedCapabilityBlock[],
  recipient: Readonly<{ keyId: string; publicKey: CryptoKey }>
): Promise<TeleportResult<ProtectedCapabilitySet>> => protectCapabilityBlocksForRecipients(capabilities, [recipient]);

export const protectCapabilityBlocksForRecipients = async (
  capabilities: readonly EncodedCapabilityBlock[],
  recipients: readonly Readonly<{ keyId: string; publicKey: CryptoKey }>[]
): Promise<TeleportResult<ProtectedCapabilitySet>> => {
  if (!recipients.length || new Set(recipients.map(recipient => recipient.keyId)).size !== recipients.length || recipients.some(recipient => !recipient.keyId || recipient.publicKey.algorithm.name !== 'RSA-OAEP')) return err({ code: 'capability-invalid', message: 'One or more unique RSA-OAEP recipient keys are required.' });
  try {
    const primaryEnvelopeId = randomId();
    const encrypted = await encryptCapabilities(capabilities, primaryEnvelopeId);
    const plaintext = coerce(dagCbor.encode({ type: 'wx-teleport-key-envelope', version: 1, keys: encrypted.keys }));
    const keyEnvelopes: TeleportKeyEnvelopeBlock[] = [];
    for (const [index, recipient] of recipients.entries()) {
      const envelopeId = index === 0 ? primaryEnvelopeId : randomId();
      const wrappingKey = crypto.getRandomValues(new Uint8Array(32));
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: arrayBuffer(iv), tagLength: 128 }, await importAesKey(wrappingKey, ['encrypt']), arrayBuffer(plaintext)));
      const wrappedKey = new Uint8Array(await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, recipient.publicKey, arrayBuffer(wrappingKey)));
      const envelopeBytes = coerce(dagCbor.encode({ wrappedKey, ciphertext }));
      const descriptor: TeleportKeyEnvelopeDescriptor = { id: envelopeId, mode: 'rsa-oaep-aes-256-gcm-v1', block: CID.createV1(raw.code, await sha256.digest(envelopeBytes)), recipientKeyId: recipient.keyId, iv, hash: 'SHA-256' };
      keyEnvelopes.push({ descriptor, bytes: envelopeBytes });
    }
    return ok({ capabilities: encrypted.capabilities, keyEnvelopes });
  } catch {
    return err({ code: 'capability-invalid', message: 'Recipient capability protection failed.' });
  }
};

const parseEnvelopePayload = (value: unknown): TeleportResult<Map<string, Uint8Array>> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return err({ code: 'decode-failed', message: 'Key envelope payload is invalid.' });
  }
  const record = value as Record<string, unknown>;
  if (record.type !== 'wx-teleport-key-envelope' || record.version !== 1 || !Array.isArray(record.keys)) {
    return err({ code: 'decode-failed', message: 'Key envelope payload is invalid.' });
  }
  const keys = new Map<string, Uint8Array>();
  for (const entry of record.keys) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return err({ code: 'decode-failed', message: 'Key envelope item is invalid.' });
    const item = entry as Record<string, unknown>;
    if (typeof item.keyId !== 'string' || !(item.key instanceof Uint8Array) || item.key.byteLength !== 32 || keys.has(item.keyId)) {
      return err({ code: 'decode-failed', message: 'Key envelope item is invalid.' });
    }
    keys.set(item.keyId, item.key);
  }
  return ok(keys);
};

export const unlockTeleportCartridge = async (
  cartridge: VerifiedTeleportCartridge,
  passphrase: string
): Promise<TeleportResult<VerifiedTeleportCartridge>> => {
  if (!passphrase) return err({ code: 'decode-failed', message: 'A cartridge passphrase is required.' });
  try {
    const unwrapped = new Map<string, Map<string, Uint8Array>>();
    for (const envelope of cartridge.keyEnvelopes) {
      if (envelope.descriptor.mode !== 'pbkdf2-aes-256-gcm-v1') {
        return err({ code: 'policy-rejected', message: 'Cartridge requires a recipient private key rather than a passphrase.' });
      }
      const plaintext = new Uint8Array(await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: arrayBuffer(envelope.descriptor.iv), tagLength: 128 },
        await deriveWrappingKey(passphrase, envelope.descriptor.salt, 'decrypt'),
        arrayBuffer(envelope.bytes)
      ));
      const parsed = parseEnvelopePayload(dagCbor.decode(plaintext));
      if (!parsed.ok) return parsed;
      unwrapped.set(envelope.descriptor.id, parsed.value);
    }
    const capabilities = [];
    for (const capability of cartridge.capabilities) {
      const protection = capability.descriptor.protection;
      if (protection.mode === 'plain') {
        capabilities.push({ ...capability, contentBytes: capability.storedBytes });
        continue;
      }
      const key = unwrapped.get(protection.keyEnvelopeId)?.get(protection.keyId);
      if (!key) return err({ code: 'missing-block', message: 'Protected capability key is unavailable.', capabilityId: capability.descriptor.capabilityId, instanceId: capability.descriptor.instanceId });
      const plaintext = new Uint8Array(await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: arrayBuffer(protection.iv),
          additionalData: arrayBuffer(associatedData(capability.descriptor, protection.keyEnvelopeId)),
          tagLength: 128
        },
        await importAesKey(key, ['decrypt']),
        arrayBuffer(capability.storedBytes)
      ));
      const digest = await sha256.digest(plaintext);
      if (!digest.bytes.every((byte, index) => byte === protection.plaintextCid.multihash.bytes[index])) {
        return err({ code: 'cid-mismatch', message: 'Protected capability plaintext does not match its CID.', capabilityId: capability.descriptor.capabilityId, instanceId: capability.descriptor.instanceId });
      }
      capabilities.push({ ...capability, contentBytes: plaintext });
    }
    return ok({ ...cartridge, capabilities });
  } catch {
    return err({ code: 'decode-failed', message: 'Cartridge unlock failed.' });
  }
};

export interface TeleportRecipientKeyUnwrapper {
  readonly keyId: string;
  unwrapKey(wrappedKey: Uint8Array): Promise<TeleportResult<Uint8Array>>;
}

export const unlockTeleportCartridgeWithRecipientUnwrapper = async (
  cartridge: VerifiedTeleportCartridge,
  recipient: TeleportRecipientKeyUnwrapper
): Promise<TeleportResult<VerifiedTeleportCartridge>> => {
  if (!recipient.keyId) return err({ code: 'decode-failed', message: 'A recipient key identity is required.' });
  try {
    const unwrapped = new Map<string, Map<string, Uint8Array>>();
    const allKeys = new Map<string, Uint8Array>();
    for (const envelope of cartridge.keyEnvelopes) {
      const descriptor = envelope.descriptor;
      if (descriptor.mode !== 'rsa-oaep-aes-256-gcm-v1' || descriptor.recipientKeyId !== recipient.keyId) continue;
      const payload = dagCbor.decode(envelope.bytes) as { wrappedKey?: unknown; ciphertext?: unknown };
      if (!(payload.wrappedKey instanceof Uint8Array) || !(payload.ciphertext instanceof Uint8Array)) return err({ code: 'decode-failed', message: 'Recipient key envelope is invalid.' });
      const unwrappedKey = await recipient.unwrapKey(Uint8Array.from(payload.wrappedKey));
      if (!unwrappedKey.ok) return unwrappedKey;
      const wrappingKey = unwrappedKey.value;
      if (wrappingKey.byteLength !== 32) return err({ code: 'decode-failed', message: 'Recipient unwrapped key is invalid.' });
      const plaintext = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: arrayBuffer(descriptor.iv), tagLength: 128 }, await importAesKey(wrappingKey, ['decrypt']), arrayBuffer(payload.ciphertext)));
      const parsed = parseEnvelopePayload(dagCbor.decode(plaintext));
      if (!parsed.ok) return parsed;
      unwrapped.set(descriptor.id, parsed.value);
      for (const [keyId, key] of parsed.value) allKeys.set(keyId, key);
    }
    if (!unwrapped.size) return err({ code: 'policy-rejected', message: 'Cartridge recipient key identity does not match.' });
    const capabilities = [];
    for (const capability of cartridge.capabilities) {
      const protection = capability.descriptor.protection;
      if (protection.mode === 'plain') { capabilities.push({ ...capability, contentBytes: capability.storedBytes }); continue; }
      const key = unwrapped.get(protection.keyEnvelopeId)?.get(protection.keyId) ?? allKeys.get(protection.keyId);
      if (!key) return err({ code: 'missing-block', message: 'Protected capability key is unavailable.', capabilityId: capability.descriptor.capabilityId, instanceId: capability.descriptor.instanceId });
      const plaintext = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: arrayBuffer(protection.iv), additionalData: arrayBuffer(associatedData(capability.descriptor, protection.keyEnvelopeId)), tagLength: 128 }, await importAesKey(key, ['decrypt']), arrayBuffer(capability.storedBytes)));
      const digest = await sha256.digest(plaintext);
      if (!digest.bytes.every((byte, index) => byte === protection.plaintextCid.multihash.bytes[index])) return err({ code: 'cid-mismatch', message: 'Protected capability plaintext does not match its CID.', capabilityId: capability.descriptor.capabilityId, instanceId: capability.descriptor.instanceId });
      capabilities.push({ ...capability, contentBytes: plaintext });
    }
    return ok({ ...cartridge, capabilities });
  } catch {
    return err({ code: 'decode-failed', message: 'Recipient cartridge unlock failed.' });
  }
};

export const unlockTeleportCartridgeForRecipient = async (
  cartridge: VerifiedTeleportCartridge,
  recipient: Readonly<{ keyId: string; privateKey: CryptoKey }>
): Promise<TeleportResult<VerifiedTeleportCartridge>> => {
  if (!recipient.keyId || recipient.privateKey.algorithm.name !== 'RSA-OAEP') return err({ code: 'decode-failed', message: 'An RSA-OAEP recipient private key is required.' });
  return unlockTeleportCartridgeWithRecipientUnwrapper(cartridge, {
    keyId: recipient.keyId,
    unwrapKey: async wrappedKey => {
      try {
        return ok(new Uint8Array(await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, recipient.privateKey, arrayBuffer(wrappedKey))));
      } catch {
        return err({ code: 'decode-failed', message: 'Recipient key unwrap failed.' });
      }
    }
  });
};
