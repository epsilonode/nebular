import { describe, expect, it } from 'vitest';
import type { Result } from 'neverthrow';

import {
  isAttemptTransitionAllowed,
  parseConsentId,
  parseJournalOperationId,
  parseLeaseJournalId,
  parseRedactedAuthorityDigest,
  parseTransferId,
  validateAttemptTransition,
  validateGrantWithConsent,
  validateLeaseCreation,
  validateTransferConsumption,
  type CommitGrantWithConsent,
  type JournalResult
} from './journal.ts';
import { parseCredentialReference } from './lease.ts';
import {
  parseCanonicalRepository,
  parseCredentialSlotId,
  parseGrantId,
  parseProcessAttemptId,
  parseRecipeRevision
} from './primitives.ts';

const unwrapJournal = <T>(result: JournalResult<T>): T => {
  if (result.type === 'err') throw new Error(result.issues[0].message);
  return result.value;
};

const unwrapBroker = <T>(result: Result<T, unknown>): T => {
  if (result.isErr()) throw new Error('broker primitive fixture failed');
  return result.value;
};

const commandFixture = (): CommitGrantWithConsent => {
  const operationId = unwrapJournal(parseJournalOperationId('operation-enroll-1'));
  const consentId = unwrapJournal(parseConsentId('consent-1'));
  const repository = unwrapBroker(parseCanonicalRepository('R:\\Code\\example'));
  const recipeRevision = unwrapBroker(parseRecipeRevision('sha256:recipe-v1'));
  const credentialSlotId = unwrapBroker(parseCredentialSlotId('weather-api'));
  return {
    operationId,
    consent: {
      id: consentId,
      operationId,
      repository,
      recipeRevision,
      authorityDigest: unwrapJournal(parseRedactedAuthorityDigest('sha256:redacted-authority')),
      promptVersion: 'nebular-consent/v1',
      credentialSlotIds: [credentialSlotId],
      deliveryMode: 'cooperative-bootstrap',
      grantExpiresAtMs: 10_000,
      occurredAtMs: 1_000,
      outcome: 'approved'
    },
    grant: {
      id: unwrapBroker(parseGrantId('grant-1')),
      operationId,
      repository,
      recipeRevision,
      credentialReference: unwrapBroker(parseCredentialReference('credential-reference-1')),
      credentialSlotIds: [credentialSlotId],
      consentId,
      generation: 1,
      issuedAtMs: 1_000,
      expiresAtMs: 10_000,
      state: 'active'
    }
  };
};

describe('nonsecret authority journal algebra', () => {
  it('admits only matching approved consent and grant facts', () => {
    const valid = commandFixture();
    expect(validateGrantWithConsent(valid)).toEqual({ type: 'ok', value: valid });

    const denied = {
      ...valid,
      consent: { ...valid.consent, outcome: 'denied' as const }
    };
    expect(validateGrantWithConsent(denied)).toEqual(expect.objectContaining({
      type: 'err',
      issues: [expect.objectContaining({ code: 'journal-invalid' })]
    }));

    const widened = {
      ...valid,
      grant: {
        ...valid.grant,
        credentialSlotIds: [
          ...valid.grant.credentialSlotIds,
          unwrapBroker(parseCredentialSlotId('unapproved-slot'))
        ]
      }
    };
    expect(validateGrantWithConsent(widened).type).toBe('err');
  });

  it('keeps lease creation narrower than its typed authorized state', () => {
    const authority = commandFixture();
    const operationId = unwrapJournal(parseJournalOperationId('operation-lease-1'));
    const lease = {
      id: unwrapJournal(parseLeaseJournalId('lease-1')),
      operationId,
      grantId: authority.grant.id,
      grantGeneration: 1,
      processAttemptId: unwrapBroker(parseProcessAttemptId('attempt-1')),
      issuedAtMs: 1_200,
      expiresAtMs: 5_000,
      terminatedAtMs: null,
      state: 'authorized' as const
    };
    expect(validateLeaseCreation({ operationId, lease }).type).toBe('ok');
    expect(validateLeaseCreation({
      operationId,
      lease: { ...lease, expiresAtMs: lease.issuedAtMs }
    }).type).toBe('err');
  });

  it('uses a closed attempt transition algebra instead of mutable boolean flags', () => {
    expect(isAttemptTransitionAllowed('reserved', 'materializing')).toBe(true);
    expect(isAttemptTransitionAllowed('cleaned', 'running')).toBe(false);
    expect(validateAttemptTransition({
      operationId: unwrapJournal(parseJournalOperationId('operation-attempt-transition-1')),
      attemptId: unwrapBroker(parseProcessAttemptId('attempt-1')),
      expectedState: 'reserved',
      nextState: 'materializing',
      atMs: 1_100,
      receiverCorrelation: null
    }).type).toBe('ok');
    expect(validateAttemptTransition({
      operationId: unwrapJournal(parseJournalOperationId('operation-attempt-transition-2')),
      attemptId: unwrapBroker(parseProcessAttemptId('attempt-1')),
      expectedState: 'cleaned',
      nextState: 'running',
      atMs: 1_200,
      receiverCorrelation: null
    }).type).toBe('err');
  });

  it('rejects expired transfer consumption before persistence', () => {
    const operationId = unwrapJournal(parseJournalOperationId('operation-transfer-1'));
    const transfer = {
      id: unwrapJournal(parseTransferId('transfer-1')),
      operationId,
      destinationGrantId: commandFixture().grant.id,
      issuedAtMs: 1_000,
      expiresAtMs: 2_000,
      consumedAtMs: 2_000,
      state: 'consumed' as const
    };
    expect(validateTransferConsumption({ operationId, transfer }).type).toBe('err');
  });
});
