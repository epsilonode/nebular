import { describe, expect, it } from 'vitest';

import {
  decodeCapability,
  encodeCapability,
  runTeleportCodecConformance
} from '../teleport/public.ts';
import { parseCredentialReference } from './lease.ts';
import {
  parseRedactedAuthorityDigest,
  parseTransferId
} from './journal.ts';
import {
  parseCanonicalRepository,
  parseGrantId,
  parseRecipeRevision
} from './primitives.ts';
import {
  planSecretTransferExport,
  planSecretTransferImport,
  SECRET_TRANSFER_CAPABILITY_ID,
  SECRET_TRANSFER_CAPABILITY_VERSION,
  secretTransferCapabilityCodec,
  secretTransferPortableFacts,
  type AuthorizedSecretTransferDestination,
  type SecretTransferCapabilityV1,
  type SecretTransferDestinationRequest,
  type SecretTransferPortableFacts
} from './secret-transfer.ts';

const fixtureCapability = (secretText = 'codec-canary'): SecretTransferCapabilityV1 => {
  const transferId = parseTransferId('transfer-atomic-1');
  if (transferId.type === 'err') throw new Error('transfer fixture identity is invalid');
  return {
    type: SECRET_TRANSFER_CAPABILITY_ID,
    version: SECRET_TRANSFER_CAPABILITY_VERSION,
    transferId: transferId.value,
    provider: 'weather-provider',
    accountId: 'account-7',
    accountLabel: 'Development',
    environment: 'sandbox',
    secretKind: 'api-token',
    secret: { bytes: new TextEncoder().encode(secretText) },
    providerScopes: ['alerts:read', 'forecast:read'],
    intendedRecipientKeyId: 'device-recipient-1',
    issuedAtMs: 1_000,
    transferExpiresAtMs: 5_000,
    upstreamExpiresAtMs: 9_000
  };
};

const destinationFixture = (): Readonly<{
  request: SecretTransferDestinationRequest;
  authorized: AuthorizedSecretTransferDestination;
}> => {
  const repository = parseCanonicalRepository('R:/Code/weather-client');
  const recipeRevision = parseRecipeRevision('recipe-revision-1');
  const credentialReference = parseCredentialReference('weather-sandbox-account-7');
  const destinationGrantId = parseGrantId('destination-grant-1');
  const authorityDigest = parseRedactedAuthorityDigest('sha256:authority-digest-1');
  if (repository.isErr() || recipeRevision.isErr() || credentialReference.isErr() ||
      destinationGrantId.isErr() || authorityDigest.type === 'err') {
    throw new Error('destination fixture is invalid');
  }
  return {
    request: {
      repository: repository.value,
      recipeRevision: recipeRevision.value,
      credentialReference: credentialReference.value,
      conflictPolicy: 'reject'
    },
    authorized: {
      state: 'authorized',
      repository: repository.value,
      recipeRevision: recipeRevision.value,
      credentialReference: credentialReference.value,
      destinationGrantId: destinationGrantId.value,
      authorityDigest: authorityDigest.value,
      provider: 'weather-provider',
      accountId: 'account-7',
      environment: 'sandbox',
      permittedScopes: ['forecast:read'],
      grantExpiresAtMs: 8_000
    }
  };
};

describe('secret-transfer capability codec', () => {
  it('passes canonical codec conformance without mutating secret bytes', async () => {
    const capability = fixtureCapability();
    const before = [...capability.secret.bytes];
    const report = await runTeleportCodecConformance({
      codec: secretTransferCapabilityCodec,
      currentValue: capability
    });

    expect(report).toMatchObject({
      ok: true,
      value: { capabilityId: SECRET_TRANSFER_CAPABILITY_ID }
    });
    expect([...capability.secret.bytes]).toEqual(before);
  });

  it('round-trips a closed v1 value and normalizes factual scopes', async () => {
    const capability = {
      ...fixtureCapability(),
      providerScopes: ['forecast:read', 'alerts:read']
    };
    const encoded = await encodeCapability({
      codec: secretTransferCapabilityCodec,
      value: capability,
      instanceId: 'credential-transfer:atomic'
    });
    if (!encoded.ok) throw new Error('secret-transfer encoding failed');
    const decoded = decodeCapability(
      secretTransferCapabilityCodec,
      SECRET_TRANSFER_CAPABILITY_VERSION,
      encoded.value.bytes
    );

    expect(decoded).toMatchObject({
      ok: true,
      value: {
        providerScopes: ['alerts:read', 'forecast:read'],
        intendedRecipientKeyId: 'device-recipient-1'
      }
    });
  });

  it('rejects unknown fields, empty secret material, duplicate scopes, and unsupported versions', () => {
    const base = {
      type: SECRET_TRANSFER_CAPABILITY_ID,
      version: SECRET_TRANSFER_CAPABILITY_VERSION,
      transferId: 'transfer-invalid-1',
      provider: 'weather-provider',
      accountId: 'account-7',
      accountLabel: null,
      environment: 'sandbox',
      secretKind: 'api-token',
      secretBytes: Uint8Array.of(1),
      providerScopes: ['forecast:read'],
      intendedRecipientKeyId: 'device-recipient-1',
      issuedAtMs: 1_000,
      transferExpiresAtMs: 5_000,
      upstreamExpiresAtMs: null
    };

    expect(secretTransferCapabilityCodec.decode(1, { ...base, extraAuthority: 'grant-1' }))
      .toMatchObject({ ok: false });
    expect(secretTransferCapabilityCodec.decode(1, { ...base, secretBytes: new Uint8Array() }))
      .toMatchObject({ ok: false });
    expect(secretTransferCapabilityCodec.decode(1, {
      ...base,
      providerScopes: ['forecast:read', 'forecast:read']
    })).toMatchObject({ ok: false });
    expect(secretTransferCapabilityCodec.decode(2, base)).toMatchObject({
      ok: false,
      issues: [{ code: 'unsupported-version' }]
    });
  });
});

describe('secret-transfer planning algebra', () => {
  it('admits only a fresh, recipient-matched, locally narrower destination authority', () => {
    const facts = secretTransferPortableFacts(fixtureCapability());
    const destination = destinationFixture();
    const plan = planSecretTransferImport({
      facts,
      recipientKeyId: 'device-recipient-1',
      atMs: 2_000,
      replayStatus: 'fresh',
      destinationRequest: destination.request,
      destination: destination.authorized,
      destinationStatus: 'absent'
    });

    expect(plan).toMatchObject({
      type: 'ok',
      value: {
        state: 'ready-to-commit',
        consent: 'car-unlock',
        destinationStatus: 'absent'
      }
    });
  });

  it('rejects recipient mismatch, expiry, and replay before commit planning', () => {
    const facts = secretTransferPortableFacts(fixtureCapability());
    const destination = destinationFixture();
    const input = {
      facts,
      recipientKeyId: 'device-recipient-1',
      atMs: 2_000,
      replayStatus: 'fresh' as const,
      destinationRequest: destination.request,
      destination: destination.authorized,
      destinationStatus: 'absent' as const
    };

    expect(planSecretTransferImport({ ...input, recipientKeyId: 'device-other' })).toMatchObject({
      type: 'err',
      issues: [{ code: 'recipient-mismatch' }]
    });
    expect(planSecretTransferImport({ ...input, atMs: 5_000 })).toMatchObject({
      type: 'err',
      issues: [{ code: 'transfer-expired' }]
    });
    expect(planSecretTransferImport({ ...input, replayStatus: 'consumed' })).toMatchObject({
      type: 'err',
      issues: [{ code: 'transfer-replayed' }]
    });
  });

  it('rejects scope widening and existing credentials without elevated replacement policy', () => {
    const facts = secretTransferPortableFacts(fixtureCapability());
    const destination = destinationFixture();
    const widened: AuthorizedSecretTransferDestination = {
      ...destination.authorized,
      permittedScopes: ['forecast:read', 'tokens:admin']
    };
    const common = {
      facts,
      recipientKeyId: 'device-recipient-1',
      atMs: 2_000,
      replayStatus: 'fresh' as const,
      destinationRequest: destination.request,
      destinationStatus: 'absent' as const
    };

    expect(planSecretTransferImport({ ...common, destination: widened })).toMatchObject({
      type: 'err',
      issues: [{ code: 'destination-denied' }]
    });
    expect(planSecretTransferImport({
      ...common,
      destination: destination.authorized,
      destinationStatus: 'present'
    })).toMatchObject({
      type: 'err',
      issues: [{ code: 'conflict-rejected' }]
    });

    const replacementRequest: SecretTransferDestinationRequest = {
      ...destination.request,
      conflictPolicy: 'replace-with-elevated-consent'
    };
    expect(planSecretTransferImport({
      ...common,
      destinationRequest: replacementRequest,
      destination: destination.authorized,
      destinationStatus: 'present'
    })).toMatchObject({
      type: 'ok',
      value: { consent: 'car-unlock-and-elevated-replace' }
    });
  });

  it('caps export lifetime and returns only normalized redacted planning facts', () => {
    const facts: SecretTransferPortableFacts = {
      ...secretTransferPortableFacts(fixtureCapability()),
      providerScopes: ['forecast:read', 'alerts:read']
    };
    const planned = planSecretTransferExport(facts);

    expect(planned).toMatchObject({
      type: 'ok',
      value: { facts: { providerScopes: ['alerts:read', 'forecast:read'] } }
    });
    expect(planSecretTransferExport({
      ...facts,
      transferExpiresAtMs: facts.issuedAtMs + 7 * 24 * 60 * 60 * 1_000 + 1
    })).toMatchObject({ type: 'err', issues: [{ code: 'input-invalid' }] });
  });
});
