import type { Result } from 'neverthrow';
import { describe, expect, it } from 'vitest';

import { commitAuthorityGrant, type AuthorityGrantCommitPort } from '../broker/authority-lifecycle-journal.ts';
import {
  parseAuthorityInstant,
  type AuthorityInstant,
  type AuthorityLifecycleResult,
  type CommitAuthorityGrantEffect
} from '../broker/authority-lifecycle.ts';
import {
  journalErr,
  journalOk,
  parseConsentId,
  parseJournalOperationId,
  parseRedactedAuthorityDigest,
  validateGrantWithConsent,
  type CommitGrantWithConsent,
  type JournalResult
} from '../broker/journal.ts';
import { parseCredentialReference } from '../broker/lease.ts';
import {
  parseCanonicalRepository,
  parseCredentialSlotId,
  parseGrantId,
  parseRecipeRevision
} from '../broker/primitives.ts';

const unwrapLifecycle = <T>(result: AuthorityLifecycleResult<T>): T => {
  if (result.type === 'err') throw new Error(result.issues[0].message);
  return result.value;
};

const unwrapJournal = <T>(result: JournalResult<T>): T => {
  if (result.type === 'err') throw new Error(result.issues[0].message);
  return result.value;
};

const unwrapBroker = <T>(result: Result<T, unknown>): T => {
  if (result.isErr()) throw new Error('broker seam fixture failed');
  return result.value;
};

const instant = (value: number): AuthorityInstant => unwrapLifecycle(parseAuthorityInstant(value));

const grantCommand = (): CommitGrantWithConsent => {
  const operationId = unwrapJournal(parseJournalOperationId('authority-enrollment-1'));
  const consentId = unwrapJournal(parseConsentId('authority-consent-1'));
  const repository = unwrapBroker(parseCanonicalRepository('R:\\Code\\weather-app'));
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
      occurredAtMs: 500,
      outcome: 'approved'
    },
    grant: {
      id: unwrapBroker(parseGrantId('grant-1')),
      operationId,
      repository,
      recipeRevision,
      credentialBindings: [{
        slotId: credentialSlotId,
        credentialReference: unwrapBroker(parseCredentialReference('weather-primary'))
      }],
      consentId,
      generation: 1,
      issuedAtMs: 500,
      expiresAtMs: 10_000,
      state: 'active'
    }
  };
};

const commitEffect = (): CommitAuthorityGrantEffect => {
  const command = grantCommand();
  return {
    type: 'commit-grant-with-consent',
    correlationId: command.operationId,
    idempotencyKey: command.operationId,
    expectedPredecessorGeneration: 0,
    requiredAuthority: 'authority-journal',
    deadline: instant(command.grant.expiresAtMs),
    command
  };
};

describe('authority lifecycle to durable journal seam', () => {
  it('delegates the closed grant command through the journal port and correlates its completion', async () => {
    const effect = commitEffect();
    const port: AuthorityGrantCommitPort = {
      commitWithConsent: command => {
        const validated = validateGrantWithConsent(command);
        return Promise.resolve(validated.type === 'err'
          ? validated
          : journalOk({ status: 'committed', record: command.grant }));
      }
    };

    expect(await commitAuthorityGrant(effect, instant(600), port)).toEqual({
      type: 'grant-persisted',
      operationId: effect.correlationId,
      grantId: effect.command.grant.id,
      at: instant(600)
    });
  });

  it('returns a redacted correlated failure event instead of allowing the adapter to choose policy', async () => {
    const effect = commitEffect();
    const port: AuthorityGrantCommitPort = {
      commitWithConsent: () => Promise.resolve(journalErr({
        code: 'journal-busy',
        message: 'The authority journal is busy.'
      }))
    };

    expect(await commitAuthorityGrant(effect, instant(600), port)).toEqual({
      type: 'grant-persistence-failed',
      operationId: effect.correlationId,
      grantId: effect.command.grant.id,
      at: instant(600),
      issues: [{ code: 'journal-busy', message: 'The authority journal is busy.' }]
    });
  });
});
