import { describe, expect, it } from 'vitest';

import {
  decodeCapability,
  encodeCapability,
  runTeleportCodecConformance
} from '../teleport/public.ts';
import { parseTransferId } from './journal.ts';
import {
  createSecretTransferAuthenticatedPreview,
  createSecretTransferPortableFactsBinding,
  secretTransferInventoryCapabilityCodec,
  secretTransferPreviewCapabilityCodec,
  secretTransferPreviewInstanceId,
  validateSecretTransferPreviewAdmission,
  verifySecretTransferPreviewBinding
} from './secret-transfer-preview.ts';
import type { SecretTransferPortableFacts } from './secret-transfer.ts';

const factsFixture = (): SecretTransferPortableFacts => {
  const transferId = parseTransferId('transfer-preview-1');
  if (transferId.type === 'err') throw new Error('preview transfer fixture is invalid');
  return {
    transferId: transferId.value,
    provider: 'weather-provider',
    accountId: 'private-account-7',
    accountLabel: 'Private Account',
    environment: 'sandbox',
    secretKind: 'api-token',
    providerScopes: ['forecast:read', 'alerts:read'],
    intendedRecipientKeyId: 'recipient-device-1',
    issuedAtMs: 1_000,
    transferExpiresAtMs: 5_000,
    upstreamExpiresAtMs: 9_000
  };
};

describe('authenticated secret-transfer preview codec', () => {
  it('canonically binds public preview facts to the full portable facts without exposing account identity', async () => {
    const facts = factsFixture();
    const binding = await createSecretTransferPortableFactsBinding(facts);
    const preview = await createSecretTransferAuthenticatedPreview({
      facts,
      inventoryCid: 'bafkreiauthenticatedinventorycid'
    });
    if (binding.type === 'err' || preview.type === 'err') {
      throw new Error('preview construction failed');
    }

    expect(preview.value.portableFactsBinding).toBe(binding.value);
    expect(preview.value.accountHint).toMatch(/^account:/);
    expect(JSON.stringify(preview.value)).not.toContain(facts.accountId);
    expect(JSON.stringify(preview.value)).not.toContain(facts.accountLabel);
    expect(await verifySecretTransferPreviewBinding(preview.value, facts)).toEqual({
      type: 'ok',
      value: undefined
    });
    expect(await verifySecretTransferPreviewBinding(preview.value, {
      ...facts,
      accountId: 'substituted-account'
    })).toMatchObject({ type: 'err', issues: [{ code: 'preview-mismatch' }] });
  });

  it('passes the common codec conformance harness and retains one exact inventory dependency', async () => {
    const preview = await createSecretTransferAuthenticatedPreview({
      facts: factsFixture(),
      inventoryCid: 'bafkreiauthenticatedinventorycid'
    });
    if (preview.type === 'err') throw new Error('preview fixture construction failed');
    const report = await runTeleportCodecConformance({
      codec: secretTransferPreviewCapabilityCodec,
      currentValue: preview.value
    });
    const encoded = await encodeCapability({
      codec: secretTransferPreviewCapabilityCodec,
      value: preview.value,
      instanceId: secretTransferPreviewInstanceId(preview.value.transferId)
    });

    expect(report).toMatchObject({ ok: true });
    expect(encoded).toMatchObject({
      ok: true,
      value: {
        dependencies: [{
          kind: 'hard-decode',
          required: true,
          instanceId: preview.value.inventoryInstanceId
        }]
      }
    });
  });

  it('rejects preview recipient and expiry before any unlock operation', async () => {
    const preview = await createSecretTransferAuthenticatedPreview({
      facts: factsFixture(),
      inventoryCid: 'bafkreiauthenticatedinventorycid'
    });
    if (preview.type === 'err') throw new Error('preview fixture construction failed');

    expect(validateSecretTransferPreviewAdmission({
      preview: preview.value,
      recipientKeyId: 'recipient-other',
      atMs: 2_000
    })).toMatchObject({ type: 'err', issues: [{ code: 'recipient-mismatch' }] });
    expect(validateSecretTransferPreviewAdmission({
      preview: preview.value,
      recipientKeyId: 'recipient-device-1',
      atMs: 5_000
    })).toMatchObject({ type: 'err', issues: [{ code: 'transfer-expired' }] });
  });

  it('round-trips only bounded encrypted private-inventory bytes through the raw carrier codec', async () => {
    const bytes = Uint8Array.of(1, 2, 3, 4);
    const encoded = await encodeCapability({
      codec: secretTransferInventoryCapabilityCodec,
      value: { bytes },
      instanceId: 'credential-inventory:atomic'
    });
    if (!encoded.ok) throw new Error('inventory carrier encoding failed');
    const decoded = decodeCapability(
      secretTransferInventoryCapabilityCodec,
      1,
      encoded.value.bytes
    );

    expect(decoded).toMatchObject({ ok: true });
    if (decoded.ok) expect([...decoded.value.bytes]).toEqual([...bytes]);
    expect(secretTransferInventoryCapabilityCodec.decode(1, new Uint8Array()))
      .toMatchObject({ ok: false });
  });
});
