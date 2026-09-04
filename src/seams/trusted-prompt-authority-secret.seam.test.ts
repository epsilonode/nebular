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
} from '../broker/authority-lifecycle.ts';
import {
  createBunSecretStoreAdminPort,
  type BunSecretsWritePort
} from '../broker/bun-secret-store.ts';
import {
  parseConsentId,
  parseJournalOperationId,
  parseRedactedAuthorityDigest,
  type JournalResult
} from '../broker/journal.ts';
import { parseCredentialReference } from '../broker/lease.ts';
import {
  parseCanonicalRepository,
  parseCredentialSlotId,
  parseGrantId,
  parseRecipeRevision
} from '../broker/primitives.ts';
import {
  runTrustedCredentialEnrollment,
  trustedPromptTaskErr,
  type TrustedCredentialEnrollmentIdempotencyPort,
  type TrustedCredentialPromptPort
} from '../broker/trusted-prompt.ts';

const unwrapLifecycle = <Value>(result: AuthorityLifecycleResult<Value>): Value => {
  if (result.type === 'err') throw new Error(result.issues[0].message);
  return result.value;
};

const unwrapJournal = <Value>(result: JournalResult<Value>): Value => {
  if (result.type === 'err') throw new Error(result.issues[0].message);
  return result.value;
};

const unwrapBroker = <Value>(result: Result<Value, unknown>): Value => {
  if (result.isErr()) throw new Error('trusted prompt seam fixture failed');
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

const proposal = (): AuthorityGrantProposal => {
  const operation = unwrapLifecycle(parseAuthorityAtom('forecast'));
  const credentialBindings: AuthorityGrantProposal['credentialBindings'] = [{
    credentialReference: unwrapBroker(parseCredentialReference('credential-weather-primary')),
    credentialSlotIds: createCredentialSlotSet(unwrapBroker(parseCredentialSlotId('weather-api'))),
    providerAuthority: {
      provider: unwrapLifecycle(parseProviderId('weather')),
      account: { type: 'unspecified' },
      environment: unwrapLifecycle(parseProviderEnvironment('production')),
      requirements: operationRequirements(createAuthorityAtomSet(operation))
    }
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
    deliveryMode: 'cooperative-bootstrap'
  };
};

const promptFixture = (): Readonly<{
  state: AwaitingConsentAuthorityRequest;
  effect: OpenAuthorityConsentEffect;
}> => {
  const received = requestState(unwrapLifecycle(openAuthorityRequest({
    operationId: unwrapJournal(parseJournalOperationId('authority-request-1')),
    requestWindow: unwrapLifecycle(createAuthorityWindow(instant(100), instant(5_000)))
  })), 'received');
  const requestProposal = proposal();
  const parsed = requestState(unwrapLifecycle(reduceAuthorityRequest(received, {
    type: 'parsed',
    at: instant(200),
    proposal: requestProposal
  })), 'parsed');
  const policy = requestState(unwrapLifecycle(reduceAuthorityRequest(parsed, {
    type: 'policy-accepted',
    at: instant(300),
    credentialBindings: requestProposal.credentialBindings,
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

const executeOnce: TrustedCredentialEnrollmentIdempotencyPort = {
  runOnce: (_claim, execute) => execute().map(completion => ({ outcome: 'executed', completion }))
};

const runtimeSequence = (...times: readonly number[]) => {
  let index = 0;
  return {
    nowMs: () => {
      const time = times[Math.min(index, times.length - 1)];
      index += 1;
      if (time === undefined) throw new Error('clock fixture exhausted');
      return time;
    },
    openDeadline: () => ({
      elapsed: new Promise<void>(() => undefined),
      cancel: () => undefined
    })
  };
};

describe('authority consent to trusted prompt and OS secret-store seam', () => {
  it('stores callback-scoped input before emitting the secret-free approval event', async () => {
    const secretCanary = 'trusted-prompt-secret-canary';
    const fixture = promptFixture();
    const writes: string[] = [];
    const keychain: BunSecretsWritePort = {
      set: options => {
        writes.push(options.value);
        return Promise.resolve();
      },
      delete: () => Promise.resolve(false)
    };
    const prompt: TrustedCredentialPromptPort = {
      withCredentialInput: (request, input, use) => {
        expect(request.hostRequirement).toBe('distinct-user-visible-broker-window');
        expect(JSON.stringify(request)).not.toContain(secretCanary);
        const entered = input.capture(secretCanary);
        if (entered.isErr()) return trustedPromptTaskErr({
          code: 'prompt-input-invalid',
          message: 'Credential input fixture failed.'
        });
        return use(entered.value).map(value => ({ outcome: 'accepted', value }));
      }
    };
    const completion = await runTrustedCredentialEnrollment(
      fixture.state,
      fixture.effect,
      {
        runtime: runtimeSequence(500, 600, 601, 602),
        prompt,
        store: createBunSecretStoreAdminPort(keychain),
        idempotency: executeOnce
      }
    );
    expect(completion.isOk()).toBe(true);
    if (completion.isErr()) return;
    expect(writes).toEqual([secretCanary]);
    expect(JSON.stringify(completion.value)).not.toContain(secretCanary);

    const reduced = reduceAuthorityRequest(fixture.state, completion.value.event);
    expect(reduced).toEqual(expect.objectContaining({
      type: 'ok',
      value: expect.objectContaining({
        terminal: { outcome: 'approved', grantId: fixture.state.proposal.grantId }
      })
    }));
  });

  it('does not touch the OS secret-store when the trusted host is unavailable', async () => {
    const fixture = promptFixture();
    const prompt: TrustedCredentialPromptPort = {
      withCredentialInput: () => trustedPromptTaskErr({
        code: 'prompt-unavailable',
        message: 'No admitted trusted console host is available.'
      })
    };
    const keychain: BunSecretsWritePort = {
      set: () => Promise.reject(new Error('must not write')),
      delete: () => Promise.resolve(false)
    };
    const completion = await runTrustedCredentialEnrollment(
      fixture.state,
      fixture.effect,
      {
        runtime: runtimeSequence(500),
        prompt,
        store: createBunSecretStoreAdminPort(keychain),
        idempotency: executeOnce
      }
    );
    expect(completion.isErr()).toBe(true);
    if (completion.isErr()) expect(completion.error[0].code).toBe('prompt-unavailable');
  });
});
