import { describe, expect, it } from 'vitest';

import {
  authorizeSecretLease,
  parseCredentialReference,
  parseSecretExposureCleanupReceiptId,
  parseSecretExposureCorrelation,
  parseSecretLeaseId,
  reduceSecretLease,
  type SecretDeliveryGrant,
  type SecretLeaseRequest,
  type SecretSlotBinding
} from './lease.ts';
import {
  parseCanonicalRepository,
  parseCredentialSlotId,
  parseGrantId,
  parseProcessAttemptId,
  parseReceiverId,
  parseRecipeRevision
} from './primitives.ts';

const fixtures = (): Readonly<{
  grant: SecretDeliveryGrant;
  request: SecretLeaseRequest;
  binding: SecretSlotBinding;
}> => {
  const repository = parseCanonicalRepository('R:/Code/example');
  const revision = parseRecipeRevision('recipe-revision-1');
  const grantId = parseGrantId('grant-1');
  const slotId = parseCredentialSlotId('weather-api');
  const reference = parseCredentialReference('credential-1');
  const leaseId = parseSecretLeaseId('lease-1');
  const exposureCorrelation = parseSecretExposureCorrelation('exposure-1');
  const receiverId = parseReceiverId('pm2');
  const processAttemptId = parseProcessAttemptId('attempt-1');
  if (repository.isErr() || revision.isErr() || grantId.isErr() || slotId.isErr() || reference.isErr() ||
      leaseId.isErr() || exposureCorrelation.isErr() || receiverId.isErr() || processAttemptId.isErr()) {
    throw new Error('typed secret lease fixture construction failed');
  }
  const binding: SecretSlotBinding = {
    slotId: slotId.value,
    credentialReference: reference.value,
    environmentName: 'WEATHER_API_TOKEN'
  };
  return {
    binding,
    grant: {
      id: grantId.value,
      generation: 3,
      repository: repository.value,
      recipeRevision: revision.value,
      bindings: [binding],
      expiresAtMs: 2_000,
      revoked: false,
      exposureMode: 'cooperative-bootstrap'
    },
    request: {
      id: leaseId.value,
      grantId: grantId.value,
      grantGeneration: 3,
      repository: repository.value,
      recipeRevision: revision.value,
      receiverId: receiverId.value,
      processAttemptId: processAttemptId.value,
      exposureCorrelation: exposureCorrelation.value,
      bindings: [binding],
      requestedAtMs: 1_000,
      expiresAtMs: 1_500,
      exposureMode: 'cooperative-bootstrap'
    }
  };
};

describe('secret lease authority and state algebra', () => {
  it('keeps an acknowledged process exposed until exact tree cleanup closes it', () => {
    const fixture = fixtures();
    const authorized = authorizeSecretLease(fixture.grant, fixture.request, 1_000);
    expect(authorized.isOk()).toBe(true);
    if (authorized.isErr()) throw new Error('expected authorized secret lease');

    const delivering = reduceSecretLease(authorized.value, { type: 'begin-delivery', atMs: 1_001 });
    expect(delivering).toEqual(expect.objectContaining({ value: expect.objectContaining({ state: 'delivering' }) }));
    if (delivering.isErr()) throw new Error('expected delivering secret lease');

    const exposed = reduceSecretLease(delivering.value, { type: 'acknowledge-exposure', atMs: 1_002 });
    expect(exposed).toEqual(expect.objectContaining({
      value: expect.objectContaining({ state: 'exposed', acknowledgedAtMs: 1_002 })
    }));
    if (exposed.isErr()) throw new Error('expected exposed secret lease');
    const closure = reduceSecretLease(exposed.value, {
      type: 'request-closure',
      atMs: 1_500,
      reason: 'lease-expired'
    });
    if (closure.isErr()) throw new Error('expected closure-required secret lease');
    const receiptId = parseSecretExposureCleanupReceiptId('cleanup-1');
    if (receiptId.isErr()) throw new Error('expected cleanup receipt identity');
    const closed = reduceSecretLease(closure.value, {
      type: 'close',
      atMs: 1_501,
      receipt: {
        format: 'secret-exposure-cleanup-receipt/v1',
        id: receiptId.value,
        exposureCorrelation: fixture.request.exposureCorrelation,
        receiverId: fixture.request.receiverId,
        processAttemptId: fixture.request.processAttemptId,
        proof: 'exact-tree-empty',
        observedAtMs: 1_501
      }
    });
    expect(closed).toEqual(expect.objectContaining({ value: expect.objectContaining({ state: 'closed' }) }));
    if (closed.isErr()) throw new Error('expected closed secret lease');
    expect(reduceSecretLease(closed.value, { type: 'begin-delivery', atMs: 1_502 })).toEqual(expect.objectContaining({
      error: [expect.objectContaining({ code: 'lease-transition-invalid' })]
    }));
  });

  it('rejects generation drift, expiry, revoked grants, widening, and environment collisions', () => {
    const fixture = fixtures();
    const otherSlot = parseCredentialSlotId('other-slot');
    const otherReference = parseCredentialReference('credential-2');
    if (otherSlot.isErr() || otherReference.isErr()) throw new Error('typed widening fixture construction failed');
    const widened: SecretSlotBinding = {
      slotId: otherSlot.value,
      credentialReference: otherReference.value,
      environmentName: 'OTHER_TOKEN'
    };

    expect(authorizeSecretLease(
      fixture.grant,
      { ...fixture.request, grantGeneration: 4 },
      1_000
    )).toEqual(expect.objectContaining({ error: [expect.objectContaining({ code: 'lease-invalid' })] }));
    expect(authorizeSecretLease(
      fixture.grant,
      { ...fixture.request, expiresAtMs: 2_001 },
      1_000
    )).toEqual(expect.objectContaining({ error: [expect.objectContaining({ code: 'lease-expired' })] }));
    expect(authorizeSecretLease(
      { ...fixture.grant, revoked: true },
      fixture.request,
      1_000
    )).toEqual(expect.objectContaining({ error: [expect.objectContaining({ code: 'grant-revoked' })] }));
    expect(authorizeSecretLease(
      fixture.grant,
      { ...fixture.request, bindings: [fixture.binding, widened] },
      1_000
    )).toEqual(expect.objectContaining({ error: [expect.objectContaining({ code: 'slot-not-authorized' })] }));
    expect(authorizeSecretLease(
      fixture.grant,
      {
        ...fixture.request,
        bindings: [fixture.binding, { ...widened, environmentName: 'weather_api_token' }]
      },
      1_000
    )).toEqual(expect.objectContaining({ error: [expect.objectContaining({ code: 'lease-invalid' })] }));
    expect(authorizeSecretLease(
      { ...fixture.grant, bindings: [{ ...fixture.binding, environmentName: 'nebular_pm2_job_identity' }] },
      { ...fixture.request, bindings: [{ ...fixture.binding, environmentName: 'nebular_pm2_job_identity' }] },
      1_000
    )).toEqual(expect.objectContaining({ error: [expect.objectContaining({ code: 'lease-invalid' })] }));
  });

  it('makes early expiration and post-terminal reuse explicit typed failures', () => {
    const fixture = fixtures();
    const authorized = authorizeSecretLease(fixture.grant, fixture.request, 1_000);
    if (authorized.isErr()) throw new Error('expected authorized secret lease');
    expect(reduceSecretLease(authorized.value, {
      type: 'revoke-unexposed', atMs: 1_499, reason: 'lease-expired'
    })).toEqual(expect.objectContaining({
      error: [expect.objectContaining({ code: 'lease-transition-invalid' })]
    }));
    const expired = reduceSecretLease(authorized.value, {
      type: 'revoke-unexposed', atMs: 1_500, reason: 'lease-expired'
    });
    expect(expired).toEqual(expect.objectContaining({ value: expect.objectContaining({ state: 'revoked' }) }));
    if (expired.isErr()) throw new Error('expected revoked secret lease');
    expect(reduceSecretLease(expired.value, { type: 'begin-delivery', atMs: 1_501 })).toEqual(expect.objectContaining({
      error: [expect.objectContaining({ code: 'lease-transition-invalid' })]
    }));
  });
});
