import type { Result } from 'neverthrow';
import { describe, expect, it } from 'vitest';

import {
  createAuthorityAtomSet,
  createAuthorityWindow,
  createCredentialSlotSet,
  openAuthorityRequest,
  operationRequirements,
  parseAuthorityAtom,
  parseAuthorityInstant,
  parseConsentPromptVersion,
  parseProviderEnvironment,
  parseProviderId,
  parseRecipeDisplayPath,
  parseRequestingExecutable,
  reduceAuthorityRequest,
  type AuthorityGrantProposal,
  type AuthorityInstant,
  type AuthorityLifecycleResult,
  type AuthorityRequest,
  type AuthorityRequestTransition,
  type AwaitingConsentAuthorityRequest,
  type OpenAuthorityConsentEffect
} from './authority-lifecycle.ts';
import {
  parseConsentId,
  parseJournalOperationId,
  parseRedactedAuthorityDigest,
  type JournalResult
} from './journal.ts';
import { parseCredentialReference, secretLeaseTaskErr } from './lease.ts';
import type { SecretStoreAdminPort } from './bun-secret-store.ts';
import {
  parseCanonicalRepository,
  parseCredentialSlotId,
  parseGrantId,
  parseRecipeRevision
} from './primitives.ts';
import {
  planTrustedCredentialPrompt,
  runTrustedCredentialEnrollment,
  trustedPromptTaskOk,
  type TrustedCredentialPromptPort
} from './trusted-prompt.ts';

const unwrapLifecycle = <Value>(result: AuthorityLifecycleResult<Value>): Value => {
  if (result.type === 'err') throw new Error(result.issues[0].message);
  return result.value;
};

const unwrapJournal = <Value>(result: JournalResult<Value>): Value => {
  if (result.type === 'err') throw new Error(result.issues[0].message);
  return result.value;
};

const unwrapBroker = <Value>(result: Result<Value, unknown>): Value => {
  if (result.isErr()) throw new Error('trusted prompt broker fixture failed');
  return result.value;
};

const instant = (value: number): AuthorityInstant => unwrapLifecycle(parseAuthorityInstant(value));

const requestState = <State extends AuthorityRequest['state']>(
  transition: AuthorityRequestTransition,
  expected: State
): Extract<AuthorityRequest, { state: State }> => {
  if (transition.state.state !== expected) throw new Error(`expected ${expected}`);
  return transition.state as Extract<AuthorityRequest, { state: State }>;
};

const proposal = (consentPurpose: AuthorityGrantProposal['consentPurpose']): AuthorityGrantProposal => {
  const operation = unwrapLifecycle(parseAuthorityAtom('forecast'));
  return {
    grantId: unwrapBroker(parseGrantId('grant-1')),
    repository: unwrapBroker(parseCanonicalRepository('R:\\Code\\weather-app')),
    recipeRevision: unwrapBroker(parseRecipeRevision('sha256:recipe-v1')),
    recipeDisplayPath: unwrapLifecycle(parseRecipeDisplayPath('.pk/recipes/weather.xml')),
    requestingExecutable: unwrapLifecycle(parseRequestingExecutable('mise run weather')),
    credentialReference: unwrapBroker(parseCredentialReference('credential-weather-primary')),
    credentialSlotIds: createCredentialSlotSet(unwrapBroker(parseCredentialSlotId('weather-api'))),
    authorityDigest: unwrapJournal(parseRedactedAuthorityDigest('sha256:redacted-weather-authority')),
    providerAuthority: {
      provider: unwrapLifecycle(parseProviderId('weather')),
      account: { type: 'unspecified' },
      environment: unwrapLifecycle(parseProviderEnvironment('production')),
      requirements: operationRequirements(createAuthorityAtomSet(operation))
    },
    promptVersion: unwrapLifecycle(parseConsentPromptVersion('nebular-consent/v1')),
    consentPurpose,
    requestedGrantExpiresAt: instant(10_000),
    grantGeneration: 1,
    deliveryMode: 'cooperative-bootstrap'
  };
};

const promptFixture = (
  consentPurpose: AuthorityGrantProposal['consentPurpose'] = 'credential-enrollment'
): Readonly<{
  state: AwaitingConsentAuthorityRequest;
  effect: OpenAuthorityConsentEffect;
}> => {
  const requestWindow = unwrapLifecycle(createAuthorityWindow(instant(100), instant(5_000)));
  const received = requestState(unwrapLifecycle(openAuthorityRequest({
    operationId: unwrapJournal(parseJournalOperationId('authority-request-1')),
    requestWindow
  })), 'received');
  const requestProposal = proposal(consentPurpose);
  const parsed = requestState(unwrapLifecycle(reduceAuthorityRequest(received, {
    type: 'parsed',
    at: instant(200),
    proposal: requestProposal
  })), 'parsed');
  const policy = requestState(unwrapLifecycle(reduceAuthorityRequest(parsed, {
    type: 'policy-accepted',
    at: instant(300),
    providerAuthority: requestProposal.providerAuthority,
    credentialSlotIds: requestProposal.credentialSlotIds,
    grantExpiresAt: instant(9_000)
  })), 'policy-accepted');
  const consent = unwrapLifecycle(reduceAuthorityRequest(policy, {
    type: 'consent-requested',
    at: instant(400),
    consentId: unwrapJournal(parseConsentId('consent-1')),
    deadline: instant(4_000)
  }));
  const state = requestState(consent, 'awaiting-consent');
  const effect = consent.effects.find(candidate => candidate.type === 'open-authority-consent');
  if (effect?.type !== 'open-authority-consent') throw new Error('expected trusted prompt effect');
  return { state, effect };
};

const unavailableStore: SecretStoreAdminPort = {
  store: () => secretLeaseTaskErr({ code: 'secret-store-failed', message: 'Store must not be called.' }),
  delete: () => secretLeaseTaskErr({ code: 'secret-store-failed', message: 'Delete must not be called.' })
};

describe('trusted credential prompt contract', () => {
  it('projects only broker-derived display facts and explicit secure-host requirements', () => {
    const fixture = promptFixture();
    const planned = planTrustedCredentialPrompt(fixture.state, fixture.effect, instant(500));
    expect(planned.isOk()).toBe(true);
    if (planned.isOk()) {
      expect(planned.value).toEqual(expect.objectContaining({
        version: 'nebular.trusted-prompt/v1',
        kind: 'credential-entry',
        hostRequirement: 'distinct-user-visible-broker-window',
        inputPolicy: {
          echo: 'masked',
          clipboard: 'forbidden',
          minimumCodeUnits: 1,
          maximumCodeUnits: 16 * 1024
        }
      }));
      expect(JSON.stringify(planned.value)).not.toContain(fixture.state.proposal.credentialReference.value);
    }
  });

  it('rejects caller-spoofed display, expired launch, and the repository-approval method', () => {
    const fixture = promptFixture();
    const spoofedExecutable = unwrapLifecycle(parseRequestingExecutable('attacker.exe'));
    const spoofed: OpenAuthorityConsentEffect = {
      ...fixture.effect,
      display: { ...fixture.effect.display, requestingExecutable: spoofedExecutable }
    };
    const spoofedResult = planTrustedCredentialPrompt(fixture.state, spoofed, instant(500));
    expect(spoofedResult.isErr()).toBe(true);
    if (spoofedResult.isErr()) expect(spoofedResult.error[0].code).toBe('prompt-identity-mismatch');
    const expiredResult = planTrustedCredentialPrompt(fixture.state, fixture.effect, instant(4_000));
    expect(expiredResult.isErr()).toBe(true);
    if (expiredResult.isErr()) expect(expiredResult.error[0].code).toBe('prompt-expired');

    const approval = promptFixture('repository-approval');
    const approvalResult = planTrustedCredentialPrompt(approval.state, approval.effect, instant(500));
    expect(approvalResult.isErr()).toBe(true);
    if (approvalResult.isErr()) expect(approvalResult.error[0].code).toBe('prompt-transition-invalid');
  });

  it.each([
    ['denied', 600, 'denied', 'user-denied'],
    ['cancelled', 600, 'cancelled', 'cancelled'],
    ['timed-out', 4_000, 'timed-out', undefined]
  ] as const)('projects a %s terminal without invoking the secret store', async (
    promptOutcome,
    atMs,
    expectedOutcome,
    expectedReason
  ) => {
    const fixture = promptFixture();
    const prompt: TrustedCredentialPromptPort = {
      withCredentialInput: () => trustedPromptTaskOk(promptOutcome === 'timed-out'
        ? { outcome: 'timed-out', decidedAt: instant(atMs) }
        : { outcome: promptOutcome, decidedAt: instant(atMs) })
    };
    const result = await runTrustedCredentialEnrollment(
      fixture.state,
      fixture.effect,
      instant(500),
      prompt,
      unavailableStore
    );
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.outcome).toBe(expectedOutcome);
      if (result.value.event.type === 'denied') expect(result.value.event.reason).toBe(expectedReason);
      if (result.value.event.type === 'expire') expect(expectedReason).toBeUndefined();
    }
  });

  it('rejects a timeout reported before the trusted prompt deadline', async () => {
    const fixture = promptFixture();
    const prompt: TrustedCredentialPromptPort = {
      withCredentialInput: () => trustedPromptTaskOk({ outcome: 'timed-out', decidedAt: instant(700) })
    };
    const result = await runTrustedCredentialEnrollment(
      fixture.state,
      fixture.effect,
      instant(500),
      prompt,
      unavailableStore
    );
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error[0].code).toBe('prompt-transition-invalid');
  });
});
