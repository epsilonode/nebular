import { CID } from 'multiformats/cid';
import * as raw from 'multiformats/codecs/raw';
import { sha256 } from 'multiformats/hashes/sha2';
import { describe, expect, it } from 'vitest';

import { createTeleportCartridge, verifyTeleportCartridge } from './cartridge';
import {
  protectCapabilityBlocksForRecipient,
  protectCapabilityBlocksForRecipients,
  unlockTeleportCartridgeForRecipient,
  unlockTeleportCartridgeWithRecipientUnwrapper
} from './protection';
import type { EncodedCapabilityBlock } from './types';

const rsaPair = () => crypto.subtle.generateKey({
  name: 'RSA-OAEP',
  modulusLength: 2048,
  publicExponent: Uint8Array.of(1, 0, 1),
  hash: 'SHA-256'
}, false, ['encrypt', 'decrypt']);

const rawCapability = async (): Promise<EncodedCapabilityBlock> => {
  const bytes = Uint8Array.of(7, 11, 13, 17);
  return {
    capabilityId: 'wx.test.protection',
    instanceId: 'protection:one',
    schemaVersion: 1,
    securityClass: 'secret',
    required: true,
    restoreMode: 'merge',
    codec: 'raw',
    dependencies: [],
    bytes,
    cid: CID.createV1(raw.code, await sha256.digest(bytes))
  };
};

describe('Teleport protection boundary', () => {
  it('preserves recipient order while every recipient can unlock the primary capability keys', async () => {
    const first = await rsaPair();
    const second = await rsaPair();
    const capability = await rawCapability();
    const protectedSet = await protectCapabilityBlocksForRecipients([capability], [
      { keyId: 'recipient-z', publicKey: first.publicKey },
      { keyId: 'recipient-a', publicKey: second.publicKey }
    ]);
    expect(protectedSet.ok).toBe(true);
    if (!protectedSet.ok) return;
    expect(protectedSet.value.keyEnvelopes.map(envelope => (
      envelope.descriptor.mode === 'rsa-oaep-aes-256-gcm-v1'
        ? envelope.descriptor.recipientKeyId
        : undefined
    ))).toEqual(['recipient-z', 'recipient-a']);
    const primaryEnvelope = protectedSet.value.keyEnvelopes[0];
    const protection = protectedSet.value.capabilities[0]?.protection;
    expect(protection?.mode).toBe('aes-256-gcm-v1');
    if (primaryEnvelope === undefined || protection?.mode !== 'aes-256-gcm-v1') return;
    expect(protection.keyEnvelopeId).toBe(primaryEnvelope.descriptor.id);

    const archive = await createTeleportCartridge({
      capabilities: protectedSet.value.capabilities,
      keyEnvelopes: protectedSet.value.keyEnvelopes
    });
    if (!archive.ok) throw new Error('Protection fixture archive creation failed.');
    const verified = await verifyTeleportCartridge(archive.value.bytes);
    if (!verified.ok) throw new Error('Protection fixture archive verification failed.');
    const unlocked = await unlockTeleportCartridgeForRecipient(verified.value, {
      keyId: 'recipient-a',
      privateKey: second.privateKey
    });
    expect(unlocked.ok).toBe(true);
    if (unlocked.ok) {
      expect([...unlocked.value.capabilities[0]?.contentBytes ?? []]).toEqual([...capability.bytes]);
    }
  });

  it('rejects duplicate recipient identities before producing envelopes', async () => {
    const pair = await rsaPair();
    const result = await protectCapabilityBlocksForRecipients([await rawCapability()], [
      { keyId: 'recipient-duplicate', publicKey: pair.publicKey },
      { keyId: 'recipient-duplicate', publicKey: pair.publicKey }
    ]);
    expect(result).toMatchObject({
      ok: false,
      issues: [{
        code: 'capability-invalid',
        message: 'One or more unique RSA-OAEP recipient keys are required.'
      }]
    });
  });

  it('normalizes foreign crypto and unwrapper rejection without exposing causes', async () => {
    const pair = await rsaPair();
    const capability = await rawCapability();
    const invalidProtection = await protectCapabilityBlocksForRecipient([capability], {
      keyId: 'recipient-private-as-public',
      publicKey: pair.privateKey
    });
    expect(invalidProtection).toMatchObject({
      ok: false,
      issues: [{
        code: 'capability-invalid',
        message: 'Recipient capability protection failed.'
      }]
    });

    const protectedSet = await protectCapabilityBlocksForRecipient([capability], {
      keyId: 'recipient-rejecting-port',
      publicKey: pair.publicKey
    });
    if (!protectedSet.ok) throw new Error('Protection fixture encryption failed.');
    const archive = await createTeleportCartridge({
      capabilities: protectedSet.value.capabilities,
      keyEnvelopes: protectedSet.value.keyEnvelopes
    });
    if (!archive.ok) throw new Error('Protection fixture archive creation failed.');
    const verified = await verifyTeleportCartridge(archive.value.bytes);
    if (!verified.ok) throw new Error('Protection fixture archive verification failed.');
    const rejected = await unlockTeleportCartridgeWithRecipientUnwrapper(verified.value, {
      keyId: 'recipient-rejecting-port',
      unwrapKey: () => Promise.reject(new Error('secret-canary-should-never-escape'))
    });
    expect(rejected).toMatchObject({
      ok: false,
      issues: [{
        code: 'decode-failed',
        message: 'Recipient cartridge unlock failed.'
      }]
    });
    expect(JSON.stringify(rejected)).not.toContain('secret-canary');
  });
});
