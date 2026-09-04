import { ResultAsync, type Result } from 'neverthrow';
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
import type { SecretInput, SecretStoreAdminPort } from './bun-secret-store.ts';
import {
  parseConsentId,
  parseJournalOperationId,
  parseRedactedAuthorityDigest,
  type JournalResult
} from './journal.ts';
import {
  parseCredentialReference,
  secretLeaseTaskErr,
  secretLeaseTaskOk
} from './lease.ts';
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
  type TrustedCredentialEnrollmentCompletion,
  type TrustedCredentialEnrollmentIdempotencyPort,
  type TrustedCredentialEnrollmentPorts,
  type TrustedCredentialPromptOutcome,
  type TrustedCredentialPromptPort,
  type TrustedPromptTaskResult,
  type TrustedPromptRuntimePort,
  type TrustedPromptSecretInputPort
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
    consentPurpose,
    requestedGrantExpiresAt: instant(10_000),
    grantGeneration: 1,
    deliveryMode: 'cooperative-bootstrap'
  };
};

const promptFixture = (
  consentPurpose: AuthorityGrantProposal['consentPurpose'] = 'credential-enrollment',
  suppliedProposal?: AuthorityGrantProposal
): Readonly<{
  state: AwaitingConsentAuthorityRequest;
  effect: OpenAuthorityConsentEffect;
}> => {
  const requestWindow = unwrapLifecycle(createAuthorityWindow(instant(100), instant(5_000)));
  const received = requestState(unwrapLifecycle(openAuthorityRequest({
    operationId: unwrapJournal(parseJournalOperationId('authority-request-1')),
    requestWindow
  })), 'received');
  const requestProposal = suppliedProposal ?? proposal(consentPurpose);
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

const runtimeSequence = (...times: readonly number[]): TrustedPromptRuntimePort => {
  let index = 0;
  return {
    nowMs: () => {
      const time = times[Math.min(index, times.length - 1)];
      index += 1;
      if (time === undefined) throw new Error('clock fixture exhausted');
      return time;
    },
    openDeadline: () => ({
      elapsed: new Promise(() => undefined),
      cancel: () => undefined
    })
  };
};

const timeoutRuntime = (nowMs: number, afterMs: number = 20): TrustedPromptRuntimePort => ({
  nowMs: () => nowMs,
  openDeadline: () => ({
    elapsed: new Promise(resolve => setTimeout(resolve, afterMs)),
    cancel: () => undefined
  })
});

const executeOnce: TrustedCredentialEnrollmentIdempotencyPort = {
  runOnce: (_claim, execute) => execute().map(completion => ({ outcome: 'executed', completion }))
};

const unavailableStore: SecretStoreAdminPort = {
  store: () => secretLeaseTaskErr({ code: 'secret-store-failed', message: 'Store must not be called.' }),
  delete: () => secretLeaseTaskErr({ code: 'secret-store-failed', message: 'Delete must not be called.' })
};

const recordingStore = (onStore: () => void): SecretStoreAdminPort => ({
  store: () => {
    onStore();
    return secretLeaseTaskOk({ outcome: 'stored' });
  },
  delete: () => secretLeaseTaskErr({ code: 'secret-store-failed', message: 'Delete must not be called.' })
});

const ports = (
  prompt: TrustedCredentialPromptPort,
  store: SecretStoreAdminPort,
  runtime: TrustedPromptRuntimePort,
  idempotency: TrustedCredentialEnrollmentIdempotencyPort = executeOnce
): TrustedCredentialEnrollmentPorts => ({ prompt, store, runtime, idempotency });

const accepted = (at: number = 600): TrustedCredentialEnrollmentCompletion => ({
  outcome: 'accepted',
  event: { type: 'credential-entry-accepted', at: instant(at) },
  receipt: { credentialsStored: 1 }
});

describe('trusted credential prompt contract', () => {
  it('deep-detaches and deep-freezes every prompt fact projected from authority state', () => {
    const fixture = promptFixture();
    const binding = fixture.state.policy.credentialBindings[0];
    const planned = planTrustedCredentialPrompt(fixture.state, fixture.effect, instant(500), binding, 1);
    expect(planned.isOk()).toBe(true);
    if (planned.isErr()) return;
    const stateOperation = binding.providerAuthority.requirements.operations[0];
    const promptOperation = planned.value.credentialBinding.providerAuthority.requirements.operations[0];
    if (stateOperation === undefined || promptOperation === undefined) throw new Error('operation fixture failed');
    const originalOperation = stateOperation.value;
    const originalOperationId = fixture.state.operationId.value;

    expect(Object.isFrozen(planned.value)).toBe(true);
    expect(Object.isFrozen(planned.value.correlationId)).toBe(true);
    expect(Object.isFrozen(planned.value.deadline)).toBe(true);
    expect(Object.isFrozen(planned.value.display)).toBe(true);
    expect(Object.isFrozen(planned.value.display.credentialBindings)).toBe(true);
    expect(Object.isFrozen(planned.value.credentialBinding)).toBe(true);
    expect(Object.isFrozen(planned.value.credentialBinding.providerAuthority)).toBe(true);
    expect(Object.isFrozen(planned.value.credentialBinding.providerAuthority.requirements)).toBe(true);
    expect(Object.isFrozen(planned.value.credentialBinding.providerAuthority.requirements.operations)).toBe(true);
    expect(Object.isFrozen(promptOperation)).toBe(true);
    expect(Object.isFrozen(planned.value.credentialBinding.credentialSlotIds)).toBe(true);
    expect(Reflect.set(planned.value.correlationId, 'value', 'attacker-operation')).toBe(false);
    expect(Reflect.set(
      promptOperation,
      'value',
      'admin'
    )).toBe(false);
    expect(fixture.state.operationId.value).toBe(originalOperationId);
    expect(stateOperation.value).toBe(originalOperation);
  });

  it('rejects spoofed display facts, expired launch, and the wrong consent method', () => {
    const fixture = promptFixture();
    const binding = fixture.state.policy.credentialBindings[0];
    const spoofed: OpenAuthorityConsentEffect = {
      ...fixture.effect,
      display: {
        ...fixture.effect.display,
        requestingExecutable: unwrapLifecycle(parseRequestingExecutable('attacker.exe'))
      }
    };
    const deliveryMode = {
      ...fixture.effect,
      display: { ...fixture.effect.display, deliveryMode: 'direct-environment' }
    } as unknown as OpenAuthorityConsentEffect;

    expect(planTrustedCredentialPrompt(fixture.state, spoofed, instant(500), binding, 1))
      .toEqual(expect.objectContaining({ error: [expect.objectContaining({ code: 'prompt-identity-mismatch' })] }));
    expect(planTrustedCredentialPrompt(fixture.state, deliveryMode, instant(500), binding, 1))
      .toEqual(expect.objectContaining({ error: [expect.objectContaining({ code: 'prompt-identity-mismatch' })] }));
    expect(planTrustedCredentialPrompt(fixture.state, fixture.effect, instant(4_000), binding, 1))
      .toEqual(expect.objectContaining({ error: [expect.objectContaining({ code: 'prompt-expired' })] }));
    const approval = promptFixture('repository-approval');
    expect(planTrustedCredentialPrompt(
      approval.state,
      approval.effect,
      instant(500),
      approval.state.policy.credentialBindings[0],
      1
    ))
      .toEqual(expect.objectContaining({ error: [expect.objectContaining({ code: 'prompt-transition-invalid' })] }));
  });

  it('stores one invocation-bound input and returns only deeply frozen redacted facts', async () => {
    const fixture = promptFixture();
    const canary = 'SECRET_ACCEPTED_INPUT_CANARY';
    const prompt: TrustedCredentialPromptPort = {
      withCredentialInput: (request, input, use) => {
        expect(request.hostRequirement).toBe('distinct-user-visible-broker-window');
        const captured = input.capture(canary);
        if (captured.isErr()) return trustedPromptTaskOk({ outcome: 'cancelled' });
        return use(captured.value).map(value => ({ outcome: 'accepted', value }));
      }
    };
    let stores = 0;
    const result = await runTrustedCredentialEnrollment(
      fixture.state,
      fixture.effect,
      ports(prompt, recordingStore(() => { stores += 1; }), runtimeSequence(500, 600, 601, 602))
    );

    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    expect(result.value.outcome).toBe('accepted');
    expect(stores).toBe(1);
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.event)).toBe(true);
    expect(JSON.stringify(result.value)).not.toContain(canary);
  });

  it('claims, prompts, and stores heterogeneous bindings independently before one approval event', async () => {
    const firstProposal = proposal('credential-enrollment');
    const secondSlot = unwrapBroker(parseCredentialSlotId('alerts-api'));
    const secondReference = unwrapBroker(parseCredentialReference('credential-alerts-secondary'));
    const multiProposal: AuthorityGrantProposal = {
      ...firstProposal,
      credentialBindings: [
        firstProposal.credentialBindings[0],
        {
          credentialReference: secondReference,
          credentialSlotIds: createCredentialSlotSet(secondSlot),
          providerAuthority: firstProposal.credentialBindings[0].providerAuthority
        }
      ]
    };
    const fixture = promptFixture('credential-enrollment', multiProposal);
    const prompted: string[] = [];
    const stored: string[] = [];
    const claimedSlots: string[][] = [];
    const claimedOrdinals: number[] = [];
    const prompt: TrustedCredentialPromptPort = {
      withCredentialInput: (request, input, use) => {
        prompted.push(request.credentialBinding.credentialReference.value);
        expect(request.bindingPosition).toEqual({
          ordinal: prompted.length,
          count: 2
        });
        const captured = input.capture(`fixture-${prompted.length}`);
        return captured.isErr()
          ? trustedPromptTaskOk({ outcome: 'cancelled' })
          : use(captured.value).map(value => ({ outcome: 'accepted', value }));
      }
    };
    const store: SecretStoreAdminPort = {
      store: reference => {
        stored.push(reference.value);
        return secretLeaseTaskOk({ outcome: 'stored' });
      },
      delete: () => secretLeaseTaskErr({ code: 'secret-store-failed', message: 'Delete must not be called.' })
    };
    const idempotency: TrustedCredentialEnrollmentIdempotencyPort = {
      runOnce: (claim, execute) => {
        claimedSlots.push([...claim.credentialSlotIds]);
        claimedOrdinals.push(claim.credentialBindingOrdinal);
        return execute().map(completion => ({ outcome: 'executed', completion }));
      }
    };

    const result = await runTrustedCredentialEnrollment(
      fixture.state,
      fixture.effect,
      ports(
        prompt,
        store,
        runtimeSequence(500, 510, 520, 530, 600, 610, 620, 630),
        idempotency
      )
    );

    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    expect(result.value).toEqual(expect.objectContaining({
      outcome: 'accepted',
      receipt: { credentialsStored: 2 }
    }));
    expect(prompted).toEqual(['credential-weather-primary', 'credential-alerts-secondary']);
    expect(stored).toEqual(prompted);
    expect(claimedSlots).toEqual([['weather-api'], ['alerts-api']]);
    expect(claimedOrdinals).toEqual([1, 2]);
  });

  it.each(['denied', 'cancelled'] as const)('accepts %s only with zero input callbacks', async outcome => {
    const fixture = promptFixture();
    const prompt: TrustedCredentialPromptPort = {
      withCredentialInput: () => trustedPromptTaskOk({ outcome })
    };
    const result = await runTrustedCredentialEnrollment(
      fixture.state,
      fixture.effect,
      ports(prompt, unavailableStore, runtimeSequence(500, 600))
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) expect(result.value.outcome).toBe(outcome);
  });

  it('rejects use-then-deny and closes the input capture surface on the non-store path', async () => {
    const fixture = promptFixture();
    let retainedCapture: TrustedPromptSecretInputPort | undefined;
    const prompt: TrustedCredentialPromptPort = {
      withCredentialInput: (_request, input, use) => {
        retainedCapture = input;
        const captured = input.capture('SECRET_DENIED_PATH_CANARY');
        if (captured.isErr()) return trustedPromptTaskOk({ outcome: 'cancelled' });
        return use(captured.value).map(() => ({ outcome: 'denied' }));
      }
    };
    const result = await runTrustedCredentialEnrollment(
      fixture.state,
      fixture.effect,
      ports(prompt, unavailableStore, runtimeSequence(500, 600))
    );
    if (retainedCapture === undefined) throw new Error('capture fixture failed');
    const late = retainedCapture.capture('late-secret');

    expect(result).toEqual(expect.objectContaining({
      error: [expect.objectContaining({ code: 'prompt-transition-invalid' })]
    }));
    expect(late).toEqual(expect.objectContaining({
      error: [expect.objectContaining({ code: 'prompt-input-invalid' })]
    }));
  });

  it('rejects fabricated and copied accepted tickets without storing', async () => {
    const fixture = promptFixture();
    const fabricated: TrustedCredentialPromptPort = {
      withCredentialInput: <Value>() => trustedPromptTaskOk({ outcome: 'accepted', value: undefined as Value })
    };
    const copied: TrustedCredentialPromptPort = {
      withCredentialInput: (_request, input, use) => {
        const captured = input.capture('SECRET_COPY_CANARY');
        if (captured.isErr()) return trustedPromptTaskOk({ outcome: 'cancelled' });
        return use(captured.value).map(value => ({
          outcome: 'accepted',
          value: Object.freeze({ ...value }) as typeof value
        }));
      }
    };
    let stores = 0;

    const fabricatedResult = await runTrustedCredentialEnrollment(
      fixture.state,
      fixture.effect,
      ports(fabricated, recordingStore(() => { stores += 1; }), runtimeSequence(500))
    );
    const copiedResult = await runTrustedCredentialEnrollment(
      fixture.state,
      fixture.effect,
      ports(copied, recordingStore(() => { stores += 1; }), runtimeSequence(500, 600))
    );

    expect(fabricatedResult).toEqual(expect.objectContaining({
      error: [expect.objectContaining({ code: 'prompt-transition-invalid' })]
    }));
    expect(copiedResult).toEqual(expect.objectContaining({
      error: [expect.objectContaining({ code: 'prompt-transition-invalid' })]
    }));
    expect(stores).toBe(0);
  });

  it('detects an ignored second callback before allowing the first ticket to store', async () => {
    const fixture = promptFixture();
    const prompt: TrustedCredentialPromptPort = {
      withCredentialInput: (_request, input, use) => {
        const first = input.capture('first-secret');
        const second = input.capture('second-secret');
        if (first.isErr() || second.isErr()) return trustedPromptTaskOk({ outcome: 'cancelled' });
        return use(first.value).map(value => {
          void use(second.value).then(() => undefined);
          return { outcome: 'accepted', value };
        });
      }
    };
    let stores = 0;
    const result = await runTrustedCredentialEnrollment(
      fixture.state,
      fixture.effect,
      ports(prompt, recordingStore(() => { stores += 1; }), runtimeSequence(500, 600))
    );

    expect(result).toEqual(expect.objectContaining({
      error: [expect.objectContaining({ code: 'prompt-transition-invalid' })]
    }));
    expect(stores).toBe(0);
  });

  it('uses a broker-owned outer deadline to terminate a hung prompt and dispose capture authority', async () => {
    const fixture = promptFixture();
    let retainedCapture: TrustedPromptSecretInputPort | undefined;
    const prompt: TrustedCredentialPromptPort = {
      withCredentialInput: (_request, input) => {
        retainedCapture = input;
        return ResultAsync.fromSafePromise(new Promise(() => undefined));
      }
    };
    const startedAt = Date.now();
    const result = await runTrustedCredentialEnrollment(
      fixture.state,
      fixture.effect,
      ports(prompt, unavailableStore, timeoutRuntime(500))
    );
    if (retainedCapture === undefined) throw new Error('capture fixture failed');

    expect(Date.now() - startedAt).toBeLessThan(1_000);
    expect(result.isOk()).toBe(true);
    if (result.isOk()) expect(result.value.outcome).toBe('timed-out');
    expect(retainedCapture.capture('late-secret')).toEqual(expect.objectContaining({
      error: [expect.objectContaining({ code: 'prompt-input-invalid' })]
    }));
  });

  it('cannot store when a host captures input then returns accepted after the outer deadline', async () => {
    const fixture = promptFixture();
    const prompt: TrustedCredentialPromptPort = {
      withCredentialInput: <Value>(_request: unknown, input: TrustedPromptSecretInputPort, use: (
        input: SecretInput
      ) => TrustedPromptTaskResult<Value>) => {
        const captured = input.capture('SECRET_DELAYED_ACCEPT_CANARY');
        if (captured.isErr()) return trustedPromptTaskOk({ outcome: 'cancelled' });
        return use(captured.value).andThen(value => ResultAsync.fromSafePromise(
          new Promise<TrustedCredentialPromptOutcome<Value>>(resolve =>
            setTimeout(() => resolve({ outcome: 'accepted', value }), 50))
        ));
      }
    };
    let stores = 0;
    const result = await runTrustedCredentialEnrollment(
      fixture.state,
      fixture.effect,
      ports(prompt, recordingStore(() => { stores += 1; }), timeoutRuntime(500, 10))
    );
    await new Promise(resolve => setTimeout(resolve, 75));

    expect(result).toEqual(expect.objectContaining({
      error: [expect.objectContaining({ code: 'prompt-transition-invalid' })]
    }));
    expect(stores).toBe(0);
  });

  it('requires the durable port to prove executed-versus-replayed callback cardinality', async () => {
    const fixture = promptFixture();
    let promptCalls = 0;
    const prompt: TrustedCredentialPromptPort = {
      withCredentialInput: () => {
        promptCalls += 1;
        return trustedPromptTaskOk({ outcome: 'cancelled' });
      }
    };
    const replay: TrustedCredentialEnrollmentIdempotencyPort = {
      runOnce: () => trustedPromptTaskOk({ outcome: 'replayed', completion: accepted() })
    };
    const falseExecuted: TrustedCredentialEnrollmentIdempotencyPort = {
      runOnce: () => trustedPromptTaskOk({ outcome: 'executed', completion: accepted() })
    };

    const replayed = await runTrustedCredentialEnrollment(
      fixture.state,
      fixture.effect,
      ports(prompt, unavailableStore, runtimeSequence(500), replay)
    );
    const rejected = await runTrustedCredentialEnrollment(
      fixture.state,
      fixture.effect,
      ports(prompt, unavailableStore, runtimeSequence(500), falseExecuted)
    );

    expect(replayed.isOk()).toBe(true);
    if (replayed.isOk()) expect(replayed.value.outcome).toBe('accepted');
    expect(rejected).toEqual(expect.objectContaining({
      error: [expect.objectContaining({ code: 'prompt-idempotency-failed' })]
    }));
    expect(promptCalls).toBe(0);
  });

  it('redacts synchronous prompt and idempotency exceptions into typed failures', async () => {
    const fixture = promptFixture();
    const throwingPrompt: TrustedCredentialPromptPort = {
      withCredentialInput: () => { throw new Error('SECRET_PROMPT_EXCEPTION_CANARY'); }
    };
    const throwingIdempotency: TrustedCredentialEnrollmentIdempotencyPort = {
      runOnce: () => { throw new Error('SECRET_IDEMPOTENCY_EXCEPTION_CANARY'); }
    };

    const promptFailure = await runTrustedCredentialEnrollment(
      fixture.state,
      fixture.effect,
      ports(throwingPrompt, unavailableStore, runtimeSequence(500), executeOnce)
    );
    const idempotencyFailure = await runTrustedCredentialEnrollment(
      fixture.state,
      fixture.effect,
      ports(throwingPrompt, unavailableStore, runtimeSequence(500), throwingIdempotency)
    );

    expect(promptFailure).toEqual(expect.objectContaining({
      error: [expect.objectContaining({ code: 'prompt-unavailable' })]
    }));
    expect(idempotencyFailure).toEqual(expect.objectContaining({
      error: [expect.objectContaining({ code: 'prompt-idempotency-failed' })]
    }));
    expect(JSON.stringify({ promptFailure, idempotencyFailure })).not.toContain('SECRET_');
  });

  it('rejects a fabricated SecretInput at the callback boundary as input-invalid', async () => {
    const fixture = promptFixture();
    const prompt: TrustedCredentialPromptPort = {
      withCredentialInput: (_request, _input, use) => use(Object.freeze({}) as SecretInput)
        .map(value => ({ outcome: 'accepted', value }))
    };
    const result = await runTrustedCredentialEnrollment(
      fixture.state,
      fixture.effect,
      ports(prompt, unavailableStore, runtimeSequence(500))
    );

    expect(result).toEqual(expect.objectContaining({
      error: [expect.objectContaining({ code: 'prompt-input-invalid' })]
    }));
  });
});
