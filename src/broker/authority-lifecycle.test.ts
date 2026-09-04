import type { Result } from 'neverthrow';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  createAuthorityAtomSet,
  createAuthorityWindow,
  createCredentialSlotSet,
  deriveGrantFromApprovedRequest,
  isAuthorityWindowExpired,
  openAuthorityRequest,
  operationAndScopeRequirements,
  operationRequirements,
  parseAuthorityAtom,
  parseAuthorityInstant,
  parseConsentPromptVersion,
  parseProviderAccountLabel,
  parseProviderEnvironment,
  parseProviderId,
  parseRecipeDisplayPath,
  parseRequestingExecutable,
  reduceAuthorityGrant,
  reduceAuthorityRequest,
  type ActiveAuthorityGrant,
  type ApprovedAuthorityRequest,
  type AuthorityGrantProposal,
  type AuthorityGrantTransition,
  type AuthorityCredentialBindingSet,
  type AuthorityInstant,
  type AuthorityLifecycleResult,
  type AuthorityRequest,
  type AuthorityRequestTransition,
  type AwaitingConsentAuthorityRequest,
  type CommitAuthorityGrantEffect,
  type ParsedAuthorityRequest,
  type PendingAuthorityGrant,
  type PolicyAcceptedAuthorityRequest,
  type ProviderAuthority,
  type ReceivedAuthorityRequest,
  type RecoveryRequiredAuthorityGrant
} from './authority-lifecycle.ts';
import {
  parseConsentId,
  parseJournalOperationId,
  parseRedactedAuthorityDigest,
  validateGrantWithConsent,
  type JournalResult
} from './journal.ts';
import { parseCredentialReference } from './lease.ts';
import {
  parseCanonicalRepository,
  parseCredentialSlotId,
  parseGrantId,
  parseRecipeRevision
} from './primitives.ts';

const unwrapLifecycle = <T>(result: AuthorityLifecycleResult<T>): T => {
  if (result.type === 'err') throw new Error(result.issues[0].message);
  return result.value;
};

const unwrapJournal = <T>(result: JournalResult<T>): T => {
  if (result.type === 'err') throw new Error(result.issues[0].message);
  return result.value;
};

const unwrapBroker = <T>(result: Result<T, unknown>): T => {
  if (result.isErr()) throw new Error('broker fixture failed');
  return result.value;
};

const instant = (value: number): AuthorityInstant => unwrapLifecycle(parseAuthorityInstant(value));
const operationId = (value: string) => unwrapJournal(parseJournalOperationId(value));

const providerAuthority = (
  operations: readonly string[] = ['forecast'],
  scopes: readonly string[] = ['alerts:read']
): ProviderAuthority => {
  const operationAtoms = operations.map(value => unwrapLifecycle(parseAuthorityAtom(value)));
  const scopeAtoms = scopes.map(value => unwrapLifecycle(parseAuthorityAtom(value)));
  const firstOperation = operationAtoms[0];
  const firstScope = scopeAtoms[0];
  if (firstOperation === undefined || firstScope === undefined) throw new Error('authority fixture must be nonempty');
  return {
    provider: unwrapLifecycle(parseProviderId('weather')),
    account: {
      type: 'named',
      label: unwrapLifecycle(parseProviderAccountLabel('primary weather account'))
    },
    environment: unwrapLifecycle(parseProviderEnvironment('production')),
    requirements: operationAndScopeRequirements(
      createAuthorityAtomSet(firstOperation, ...operationAtoms.slice(1)),
      createAuthorityAtomSet(firstScope, ...scopeAtoms.slice(1))
    )
  };
};

const proposal = (
  overrides: Partial<AuthorityGrantProposal> = {}
): AuthorityGrantProposal => {
  const firstSlot = unwrapBroker(parseCredentialSlotId('weather-api'));
  const credentialBindings: AuthorityCredentialBindingSet = [{
    credentialReference: unwrapBroker(parseCredentialReference('weather-primary')),
    credentialSlotIds: createCredentialSlotSet(firstSlot),
    providerAuthority: providerAuthority()
  }];
  return {
    grantId: unwrapBroker(parseGrantId('grant-1')),
    repository: unwrapBroker(parseCanonicalRepository('R:\\Code\\weather-app')),
    recipeRevision: unwrapBroker(parseRecipeRevision('sha256:recipe-v1')),
    recipeDisplayPath: unwrapLifecycle(parseRecipeDisplayPath('.pk/recipes/weather.xml')),
    requestingExecutable: unwrapLifecycle(parseRequestingExecutable('mise run weather')),
    credentialBindings,
    authorityDigest: unwrapJournal(parseRedactedAuthorityDigest('sha256:redacted-weather-authority')),
    promptVersion: unwrapLifecycle(parseConsentPromptVersion('nebular-consent/v1')),
    consentPurpose: 'credential-enrollment',
    requestedGrantExpiresAt: instant(10_000),
    grantGeneration: 1,
    deliveryMode: 'cooperative-bootstrap',
    ...overrides
  };
};

const stateOf = <T extends AuthorityRequest['state']>(
  transition: AuthorityRequestTransition,
  expected: T
): Extract<AuthorityRequest, { state: T }> => {
  if (transition.state.state !== expected) throw new Error(`expected ${expected}`);
  return transition.state as Extract<AuthorityRequest, { state: T }>;
};

const receivedRequest = (): ReceivedAuthorityRequest => {
  const requestWindow = unwrapLifecycle(createAuthorityWindow(instant(100), instant(5_000)));
  return stateOf(unwrapLifecycle(openAuthorityRequest({
    operationId: operationId('authority-request-1'),
    requestWindow
  })), 'received');
};

const parsedRequest = (
  requestProposal: AuthorityGrantProposal = proposal()
): ParsedAuthorityRequest => stateOf(unwrapLifecycle(reduceAuthorityRequest(receivedRequest(), {
  type: 'parsed',
  at: instant(200),
  proposal: requestProposal
})), 'parsed');

const policyAcceptedRequest = (
  requestProposal: AuthorityGrantProposal = proposal(),
  effectiveBindings: AuthorityCredentialBindingSet = requestProposal.credentialBindings,
  expiresAt: AuthorityInstant = instant(9_000)
): PolicyAcceptedAuthorityRequest => stateOf(unwrapLifecycle(reduceAuthorityRequest(parsedRequest(requestProposal), {
  type: 'policy-accepted',
  at: instant(300),
  credentialBindings: effectiveBindings,
  grantExpiresAt: expiresAt
})), 'policy-accepted');

const awaitingConsentRequest = (
  requestProposal: AuthorityGrantProposal = proposal()
): AwaitingConsentAuthorityRequest => stateOf(unwrapLifecycle(reduceAuthorityRequest(policyAcceptedRequest(requestProposal), {
  type: 'consent-requested',
  at: instant(400),
  consentId: unwrapJournal(parseConsentId('consent-1')),
  deadline: instant(4_000)
})), 'awaiting-consent');

const approvedRequest = (
  requestProposal: AuthorityGrantProposal = proposal()
): ApprovedAuthorityRequest => {
  const event = requestProposal.consentPurpose === 'credential-enrollment'
    ? { type: 'credential-entry-accepted' as const, at: instant(500) }
    : { type: 'repository-approved' as const, at: instant(500) };
  return stateOf(unwrapLifecycle(reduceAuthorityRequest(awaitingConsentRequest(requestProposal), event)), 'approved');
};

const pendingGrant = (): PendingAuthorityGrant => {
  const transition = unwrapLifecycle(deriveGrantFromApprovedRequest(approvedRequest()));
  if (transition.state.state !== 'pending-persistence') throw new Error('expected pending grant');
  return transition.state;
};

const activeGrant = (): ActiveAuthorityGrant => {
  const pending = pendingGrant();
  const transition = unwrapLifecycle(reduceAuthorityGrant(pending, {
    type: 'grant-persisted',
    operationId: pending.facts.command.operationId,
    grantId: pending.facts.command.grant.id,
    at: instant(600)
  }));
  if (transition.state.state !== 'active') throw new Error('expected active grant');
  return transition.state;
};

const commitEffect = (transition: AuthorityGrantTransition): CommitAuthorityGrantEffect => {
  const effect = transition.effects.find(candidate => candidate.type === 'commit-grant-with-consent');
  if (effect?.type !== 'commit-grant-with-consent') throw new Error('expected grant commit effect');
  return effect;
};

describe('authority request, consent, grant, revocation, and expiry algebras', () => {
  it('reduces generated grant-persistence events deterministically and rejects successor replay', () => {
    fc.assert(fc.property(fc.integer({ min: 500, max: 8_999 }), atMs => {
      const pending = pendingGrant();
      const event = {
        type: 'grant-persisted' as const,
        operationId: pending.facts.command.operationId,
        grantId: pending.facts.command.grant.id,
        at: instant(atMs)
      };
      const first = reduceAuthorityGrant(pending, event);
      const second = reduceAuthorityGrant(pending, event);
      expect(first).toEqual(second);
      expect(first).toMatchObject({ type: 'ok', value: { state: { state: 'active' }, terminal: null } });
      if (first.type === 'err') return;
      expect(reduceAuthorityGrant(first.value.state, event)).toMatchObject({
        type: 'err',
        issues: [{ code: 'grant-transition-invalid' }]
      });
    }));
  });

  it('constructs bounded temporal and authority primitives without ambient time', () => {
    expect(parseAuthorityInstant(-1).type).toBe('err');
    expect(parseAuthorityInstant(1.5).type).toBe('err');
    const window = unwrapLifecycle(createAuthorityWindow(instant(100), instant(200)));
    expect(isAuthorityWindowExpired(window, instant(199))).toBe(false);
    expect(isAuthorityWindowExpired(window, instant(200))).toBe(true);

    const read = unwrapLifecycle(parseAuthorityAtom('alerts:read'));
    const write = unwrapLifecycle(parseAuthorityAtom('alerts:write'));
    expect(createAuthorityAtomSet(write, read, write).map(atom => atom.value)).toEqual([
      'alerts:read',
      'alerts:write'
    ]);
  });

  it('advances the ordinary enrollment path and emits a secret-free trusted consent effect', () => {
    const accepted = policyAcceptedRequest();
    const consent = unwrapLifecycle(reduceAuthorityRequest(accepted, {
      type: 'consent-requested',
      at: instant(400),
      consentId: unwrapJournal(parseConsentId('consent-1')),
      deadline: instant(4_000)
    }));
    const awaiting = stateOf(consent, 'awaiting-consent');
    expect(consent.effects).toEqual([
      expect.objectContaining({
        type: 'open-authority-consent',
        method: 'credential-enrollment',
        requiredAuthority: 'broker-owned-consent-surface',
        display: expect.objectContaining({
          repository: accepted.proposal.repository,
          recipeDisplayPath: accepted.proposal.recipeDisplayPath,
          requestingExecutable: accepted.proposal.requestingExecutable,
          credentialBindings: accepted.policy.credentialBindings
        })
      })
    ]);
    expect(JSON.stringify(consent.effects)).not.toContain('secret');

    const approved = unwrapLifecycle(reduceAuthorityRequest(awaiting, {
      type: 'credential-entry-accepted',
      at: instant(500)
    }));
    expect(approved.state.state).toBe('approved');
    expect(approved.terminal).toEqual({ outcome: 'approved', grantId: accepted.proposal.grantId });
    expect(awaiting.state).toBe('awaiting-consent');
  });

  it('keeps repository approval incompatible with ordinary key entry and excludes PIN consent', () => {
    const repositoryProposal = proposal({ consentPurpose: 'repository-approval' });
    const awaiting = awaitingConsentRequest(repositoryProposal);

    expect(reduceAuthorityRequest(awaiting, {
      type: 'credential-entry-accepted',
      at: instant(500)
    })).toEqual(expect.objectContaining({
      type: 'err',
      issues: [expect.objectContaining({ code: 'consent-method-mismatch' })]
    }));
    expect(reduceAuthorityRequest(awaiting, {
      type: 'repository-approved',
      at: instant(500)
    })).toEqual(expect.objectContaining({
      type: 'ok',
      value: expect.objectContaining({ terminal: { outcome: 'approved', grantId: repositoryProposal.grantId } })
    }));
    expect(reduceAuthorityRequest(awaiting, {
      type: 'pin-accepted',
      at: instant(500)
    } as never)).toEqual(expect.objectContaining({
      type: 'err',
      issues: [expect.objectContaining({ code: 'request-transition-invalid' })]
    }));
  });

  it('allows provider-authority narrowing while rejecting operation widening or slot drift', () => {
    const baseProposal = proposal();
    const baseBinding = baseProposal.credentialBindings[0];
    const broaderProposal = proposal({
      credentialBindings: [{
        ...baseBinding,
        providerAuthority: providerAuthority(['forecast', 'history'], ['alerts:read', 'stations:read'])
      }]
    });
    const narrowedAuthority = providerAuthority(['forecast'], ['alerts:read']);
    const narrowed = unwrapLifecycle(reduceAuthorityRequest(parsedRequest(broaderProposal), {
      type: 'policy-accepted',
      at: instant(300),
      credentialBindings: [{
        ...broaderProposal.credentialBindings[0],
        providerAuthority: narrowedAuthority
      }],
      grantExpiresAt: instant(9_000)
    }));
    expect(narrowed.warnings.map(warning => warning.code)).toEqual([
      'authority-narrowed',
      'grant-expiry-clamped'
    ]);

    const unexpectedOperation = unwrapLifecycle(parseAuthorityAtom('admin'));
    const widenedAuthority: ProviderAuthority = {
      ...broaderProposal.credentialBindings[0].providerAuthority,
      requirements: operationRequirements(createAuthorityAtomSet(unexpectedOperation))
    };
    expect(reduceAuthorityRequest(parsedRequest(broaderProposal), {
      type: 'policy-accepted',
      at: instant(300),
      credentialBindings: [{
        ...broaderProposal.credentialBindings[0],
        providerAuthority: widenedAuthority
      }],
      grantExpiresAt: instant(9_000)
    })).toEqual(expect.objectContaining({
      type: 'err',
      issues: [expect.objectContaining({ code: 'authority-widened' })]
    }));
    const replacementSlot = unwrapBroker(parseCredentialSlotId('replacement-api'));
    expect(reduceAuthorityRequest(parsedRequest(broaderProposal), {
      type: 'policy-accepted',
      at: instant(300),
      credentialBindings: [{
        ...broaderProposal.credentialBindings[0],
        credentialSlotIds: createCredentialSlotSet(replacementSlot)
      }],
      grantExpiresAt: instant(9_000)
    })).toEqual(expect.objectContaining({
      type: 'err',
      issues: [expect.objectContaining({ code: 'authority-widened' })]
    }));
  });

  it('expires delayed work at boundary equality and cannot expire early', () => {
    const received = receivedRequest();
    expect(reduceAuthorityRequest(received, { type: 'expire', at: instant(4_999) })).toEqual(expect.objectContaining({
      type: 'err',
      issues: [expect.objectContaining({ code: 'request-expired' })]
    }));
    expect(reduceAuthorityRequest(received, {
      type: 'parsed',
      at: instant(5_000),
      proposal: proposal()
    })).toEqual(expect.objectContaining({
      type: 'ok',
      value: expect.objectContaining({ terminal: { outcome: 'expired' } })
    }));

    const awaiting = awaitingConsentRequest();
    const delayedApproval = unwrapLifecycle(reduceAuthorityRequest(awaiting, {
      type: 'credential-entry-accepted',
      at: instant(4_000)
    }));
    expect(delayedApproval.state.state).toBe('expired');
    expect(delayedApproval.effects).toEqual([]);
  });

  it('distinguishes policy denial from consent denial and records no secret material', () => {
    const parsed = parsedRequest();
    const policyDenied = unwrapLifecycle(reduceAuthorityRequest(parsed, {
      type: 'denied',
      at: instant(300),
      reason: 'policy-denied'
    }));
    expect(policyDenied.terminal).toEqual({ outcome: 'denied', reason: 'policy-denied' });
    expect(reduceAuthorityRequest(parsed, {
      type: 'denied',
      at: instant(300),
      reason: 'user-denied'
    }).type).toBe('err');

    const consentDenied = unwrapLifecycle(reduceAuthorityRequest(awaitingConsentRequest(), {
      type: 'denied',
      at: instant(500),
      reason: 'user-denied'
    }));
    expect(consentDenied.state).toEqual(expect.objectContaining({
      state: 'denied',
      denial: expect.objectContaining({
        type: 'consent',
        consent: expect.objectContaining({ outcome: 'denied' })
      })
    }));
    expect(JSON.stringify(consentDenied)).not.toMatch(/"(?:pin|passphrase|secret|token)"/iu);
  });

  it('derives the durable grant command only from an approved unexpired request', () => {
    const transition = unwrapLifecycle(deriveGrantFromApprovedRequest(approvedRequest()));
    const effect = commitEffect(transition);
    expect(transition.state.state).toBe('pending-persistence');
    expect(effect.expectedPredecessorGeneration).toBe(0);
    expect(validateGrantWithConsent(effect.command)).toEqual({ type: 'ok', value: effect.command });
    expect(effect.command.grant.issuedAtMs).toBe(effect.command.consent.occurredAtMs);
    expect(effect.command.grant.credentialBindings.map(binding => binding.slotId)).toEqual(
      effect.command.consent.credentialSlotIds
    );
  });

  it('derives exact heterogeneous slot mappings and rejects ambiguous binding groups', () => {
    const base = proposal();
    const alertsSlot = unwrapBroker(parseCredentialSlotId('alerts-api'));
    const alertsReference = unwrapBroker(parseCredentialReference('alerts-secondary'));
    const secondBinding = {
      credentialReference: alertsReference,
      credentialSlotIds: createCredentialSlotSet(alertsSlot),
      providerAuthority: providerAuthority(['alerts'], ['alerts:read'])
    } as const;
    const multi = proposal({
      credentialBindings: [base.credentialBindings[0], secondBinding]
    });
    const transition = unwrapLifecycle(deriveGrantFromApprovedRequest(approvedRequest(multi)));
    const effect = commitEffect(transition);

    expect(effect.command.grant.credentialBindings.map(binding => ({
      slotId: binding.slotId,
      reference: binding.credentialReference.value
    }))).toEqual([
      { slotId: 'weather-api', reference: 'weather-primary' },
      { slotId: 'alerts-api', reference: 'alerts-secondary' }
    ]);
    expect(reduceAuthorityRequest(receivedRequest(), {
      type: 'parsed',
      at: instant(200),
      proposal: proposal({
        credentialBindings: [
          base.credentialBindings[0],
          { ...secondBinding, credentialSlotIds: base.credentialBindings[0].credentialSlotIds }
        ]
      })
    })).toEqual(expect.objectContaining({
      type: 'err',
      issues: [expect.objectContaining({ code: 'authority-invalid' })]
    }));
    expect(reduceAuthorityRequest(receivedRequest(), {
      type: 'parsed',
      at: instant(200),
      proposal: proposal({
        credentialBindings: [
          base.credentialBindings[0],
          { ...secondBinding, credentialReference: base.credentialBindings[0].credentialReference }
        ]
      })
    })).toEqual(expect.objectContaining({
      type: 'err',
      issues: [expect.objectContaining({ code: 'authority-invalid' })]
    }));
  });

  it('correlates persistence, permits revocation with a new operation id, and closes terminal grants', () => {
    const pending = pendingGrant();
    const mismatched = reduceAuthorityGrant(pending, {
      type: 'grant-persisted',
      operationId: operationId('wrong-operation'),
      grantId: pending.facts.command.grant.id,
      at: instant(600)
    });
    expect(mismatched).toEqual(expect.objectContaining({
      type: 'err',
      issues: [expect.objectContaining({ code: 'grant-correlation-mismatch' })]
    }));

    const active = activeGrant();
    const revocationOperation = operationId('revoke-operation-1');
    const revoked = unwrapLifecycle(reduceAuthorityGrant(active, {
      type: 'revoke',
      operationId: revocationOperation,
      grantId: active.facts.command.grant.id,
      at: instant(700),
      reason: 'user-revoked'
    }));
    expect(revoked.terminal).toEqual({ outcome: 'revoked', reason: 'user-revoked' });
    expect(revoked.effects).toEqual([
      expect.objectContaining({
        type: 'record-grant-termination',
        idempotencyKey: revocationOperation,
        outcome: 'revoked'
      })
    ]);
    expect(reduceAuthorityGrant(revoked.state, {
      type: 'expire',
      operationId: operationId('expire-after-revoke'),
      grantId: active.facts.command.grant.id,
      at: instant(9_000)
    }).type).toBe('err');

    const expired = unwrapLifecycle(reduceAuthorityGrant(active, {
      type: 'expire',
      operationId: operationId('expire-operation-1'),
      grantId: active.facts.command.grant.id,
      at: instant(9_000)
    }));
    expect(expired.terminal).toEqual({ outcome: 'expired' });
  });

  it('makes journal failure recoverable through the same idempotent grant commit', () => {
    const pending = pendingGrant();
    const failed = unwrapLifecycle(reduceAuthorityGrant(pending, {
      type: 'grant-persistence-failed',
      operationId: pending.facts.command.operationId,
      grantId: pending.facts.command.grant.id,
      at: instant(600),
      issues: [{ code: 'journal-busy', message: 'The journal is temporarily unavailable.' }]
    }));
    expect(failed.terminal).toEqual({ outcome: 'recovery-required' });
    if (failed.state.state !== 'recovery-required') throw new Error('expected recovery-required grant');
    const recovery: RecoveryRequiredAuthorityGrant = failed.state;
    const retried = unwrapLifecycle(reduceAuthorityGrant(recovery, {
      type: 'retry-persistence',
      grantId: pending.facts.command.grant.id,
      at: instant(700)
    }));
    expect(retried.state.state).toBe('pending-persistence');
    expect(commitEffect(retried).idempotencyKey).toBe(pending.facts.command.operationId);
  });
});
