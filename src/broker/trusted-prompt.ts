import {
  err,
  errAsync,
  ok,
  okAsync,
  Result,
  ResultAsync,
  type Result as NeverthrowResult,
  type ResultAsync as NeverthrowResultAsync
} from 'neverthrow';

import {
  createAuthorityAtomSet,
  createCredentialSlotSet,
  parseAuthorityInstant,
  type AuthorityAtomSet,
  type AuthorityCredentialBinding,
  type AuthorityCredentialBindingSet,
  type AuthorityConsentDisplay,
  type AuthorityInstant,
  type AuthorityRequestEvent,
  type AuthorityRequirements,
  type AwaitingConsentAuthorityRequest,
  type CredentialSlotSet,
  type OpenAuthorityConsentEffect,
  type ProviderAccount,
  type ProviderAuthority
} from './authority-lifecycle.ts';
import {
  SECRET_INPUT_MAX_CODE_UNITS,
  disposeSecretInputScope,
  openSecretInputScope,
  sealSecretInputScope,
  secretInputBelongsToScope,
  type SecretInput,
  type SecretInputScope,
  type SecretStoreAdminPort,
  type SecretStoreWriteOutcome
} from './bun-secret-store.ts';
import type {
  SecretLeaseIssue,
  SecretLeaseIssues,
  SecretLeaseResult,
  SecretLeaseTaskResult
} from './lease.ts';

export const TRUSTED_PROMPT_VERSION = 'nebular.trusted-prompt/v1' as const;
export const TRUSTED_PROMPT_CLAIM_VERSION = 'nebular.trusted-prompt-claim/v2' as const;
export const TRUSTED_PROMPT_MAX_SECRET_CODE_UNITS = SECRET_INPUT_MAX_CODE_UNITS;

export type TrustedPromptIssueCode =
  | 'prompt-expired'
  | 'prompt-identity-mismatch'
  | 'prompt-idempotency-failed'
  | 'prompt-input-invalid'
  | 'prompt-transition-invalid'
  | 'prompt-unavailable'
  | 'secret-store-failed';

export type TrustedPromptIssue = Readonly<{
  code: TrustedPromptIssueCode;
  message: string;
}>;

export type TrustedPromptIssues = readonly [TrustedPromptIssue, ...TrustedPromptIssue[]];
export type TrustedPromptResult<Value> = NeverthrowResult<Value, TrustedPromptIssues>;
export type TrustedPromptTaskResult<Value> = NeverthrowResultAsync<Value, TrustedPromptIssues>;

export const trustedPromptOk = <Value>(value: Value): TrustedPromptResult<Value> => ok(value);
export const trustedPromptErr = <Value = never>(
  issue: TrustedPromptIssue,
  ...rest: readonly TrustedPromptIssue[]
): TrustedPromptResult<Value> => err([issue, ...rest]);
export const trustedPromptTaskOk = <Value>(value: Value): TrustedPromptTaskResult<Value> => okAsync(value);
export const trustedPromptTaskErr = <Value = never>(
  issue: TrustedPromptIssue,
  ...rest: readonly TrustedPromptIssue[]
): TrustedPromptTaskResult<Value> => errAsync([issue, ...rest]);

export type TrustedCredentialPrompt = Readonly<{
  version: typeof TRUSTED_PROMPT_VERSION;
  kind: 'credential-entry';
  correlationId: OpenAuthorityConsentEffect['correlationId'];
  consentId: OpenAuthorityConsentEffect['idempotencyKey'];
  deadline: AuthorityInstant;
  display: AuthorityConsentDisplay;
  credentialBinding: AuthorityCredentialBinding;
  bindingPosition: Readonly<{ ordinal: number; count: number }>;
  hostRequirement: 'distinct-user-visible-broker-window';
  inputPolicy: Readonly<{
    echo: 'masked';
    clipboard: 'forbidden';
    minimumCodeUnits: 1;
    maximumCodeUnits: typeof TRUSTED_PROMPT_MAX_SECRET_CODE_UNITS;
  }>;
}>;

export type TrustedCredentialPromptOutcome<Value> =
  | Readonly<{ outcome: 'accepted'; value: Value }>
  | Readonly<{ outcome: 'denied' }>
  | Readonly<{ outcome: 'cancelled' }>;

export type TrustedPromptSecretInputPort = Readonly<{
  capture: (secretText: unknown) => TrustedPromptResult<SecretInput>;
}>;

/**
 * Production implementations own a distinct user-visible broker window, mask
 * input, forbid clipboard use, and invoke `use` exactly once iff they return
 * `accepted`. They invoke it zero times for `denied` or `cancelled`. The broker
 * owns time and timeout; the host supplies neither timestamps nor a timeout
 * terminal. Raw input never enters argv, environment, IPC, logs, or outcomes.
 */
export type TrustedCredentialPromptPort = Readonly<{
  withCredentialInput: <Value>(
    prompt: TrustedCredentialPrompt,
    input: TrustedPromptSecretInputPort,
    use: (input: SecretInput) => TrustedPromptTaskResult<Value>
  ) => TrustedPromptTaskResult<TrustedCredentialPromptOutcome<Value>>;
}>;

export type TrustedPromptDeadlineSignal = Readonly<{
  elapsed: Promise<void>;
}>;

export type TrustedPromptDeadlineCancellation = Readonly<{
  cancel: () => void;
}>;

export type TrustedPromptDeadlineHandle = TrustedPromptDeadlineSignal & TrustedPromptDeadlineCancellation;

export type TrustedPromptRuntimePort = Readonly<{
  nowMs: () => number;
  openDeadline: (afterMs: number) => TrustedPromptDeadlineHandle;
}>;

export type TrustedCredentialEnrollmentCompletion =
  | Readonly<{
      outcome: 'accepted';
      event: Extract<AuthorityRequestEvent, { type: 'credential-entry-accepted' }>;
      receipt: Readonly<{ credentialsStored: number }>;
    }>
  | Readonly<{
      outcome: 'denied';
      event: Extract<AuthorityRequestEvent, { type: 'denied' }>;
    }>
  | Readonly<{
      outcome: 'cancelled';
      event: Extract<AuthorityRequestEvent, { type: 'denied' }>;
    }>
  | Readonly<{
      outcome: 'timed-out';
      event: Extract<AuthorityRequestEvent, { type: 'expire' }>;
    }>;

export type TrustedCredentialEnrollmentClaim = Readonly<{
  version: typeof TRUSTED_PROMPT_CLAIM_VERSION;
  operationId: string;
  consentId: string;
  repository: string;
  recipeRevision: string;
  credentialReference: string;
  credentialSlotIds: readonly string[];
  credentialBindingOrdinal: number;
  credentialBindingCount: number;
  authorityDigest: string;
  expectedGrantGeneration: number;
  deadlineMs: number;
}>;

export type TrustedCredentialEnrollmentIdempotencyOutcome =
  | Readonly<{
      outcome: 'executed';
      completion: TrustedCredentialEnrollmentCompletion;
    }>
  | Readonly<{
      outcome: 'replayed';
      completion: TrustedCredentialEnrollmentCompletion;
    }>;

/**
 * The implementation must transactionally claim the complete identity before
 * invoking `execute`. One durable claimant may invoke it exactly once; an exact
 * completed replay invokes it zero times and returns the committed completion.
 * Concurrent/mismatched/nonterminal reuse fails typed and leaves recoverable
 * nonsecret state. Secret bytes never cross this port.
 */
export type TrustedCredentialEnrollmentIdempotencyPort = Readonly<{
  runOnce: (
    claim: TrustedCredentialEnrollmentClaim,
    execute: () => TrustedPromptTaskResult<TrustedCredentialEnrollmentCompletion>
  ) => TrustedPromptTaskResult<TrustedCredentialEnrollmentIdempotencyOutcome>;
}>;

export type TrustedCredentialEnrollmentPorts = Readonly<{
  runtime: TrustedPromptRuntimePort;
  prompt: TrustedCredentialPromptPort;
  store: SecretStoreAdminPort;
  idempotency: TrustedCredentialEnrollmentIdempotencyPort;
}>;

const promptUnavailableIssue = (): TrustedPromptIssue => ({
  code: 'prompt-unavailable',
  message: 'The trusted credential prompt is unavailable.'
});

const idempotencyFailedIssue = (): TrustedPromptIssue => ({
  code: 'prompt-idempotency-failed',
  message: 'Durable trusted-prompt idempotency could not be established.'
});

const inputInvalidIssue = (): TrustedPromptIssue => ({
  code: 'prompt-input-invalid',
  message: 'Credential input is invalid.'
});

const transitionInvalidIssue = (): TrustedPromptIssue => ({
  code: 'prompt-transition-invalid',
  message: 'The trusted prompt returned an invalid transition.'
});

const freezeClone = <Value extends object>(value: Value): Value => Object.freeze({ ...value });

const cloneAuthorityAtomSet = (values: AuthorityAtomSet): AuthorityAtomSet => Object.freeze(
  createAuthorityAtomSet(
    freezeClone(values[0]),
    ...values.slice(1).map(value => freezeClone(value))
  )
);

const cloneRequirements = (requirements: AuthorityRequirements): AuthorityRequirements => {
  switch (requirements.type) {
    case 'operations':
      return Object.freeze({
        type: 'operations',
        operations: cloneAuthorityAtomSet(requirements.operations),
        scopes: Object.freeze([] as const)
      });
    case 'scopes':
      return Object.freeze({
        type: 'scopes',
        operations: Object.freeze([] as const),
        scopes: cloneAuthorityAtomSet(requirements.scopes)
      });
    case 'operations-and-scopes':
      return Object.freeze({
        type: 'operations-and-scopes',
        operations: cloneAuthorityAtomSet(requirements.operations),
        scopes: cloneAuthorityAtomSet(requirements.scopes)
      });
  }
};

const cloneAccount = (account: ProviderAccount): ProviderAccount => account.type === 'unspecified'
  ? Object.freeze({ type: 'unspecified' })
  : Object.freeze({ type: 'named', label: freezeClone(account.label) });

const cloneProviderAuthority = (authority: ProviderAuthority): ProviderAuthority => Object.freeze({
  provider: freezeClone(authority.provider),
  account: cloneAccount(authority.account),
  environment: freezeClone(authority.environment),
  requirements: cloneRequirements(authority.requirements)
});

const cloneCredentialSlotSet = (
  values: CredentialSlotSet
): CredentialSlotSet => Object.freeze(
  createCredentialSlotSet(values[0], ...values.slice(1))
);

const cloneCredentialBinding = (
  binding: AuthorityCredentialBinding
): AuthorityCredentialBinding => Object.freeze({
  credentialReference: freezeClone(binding.credentialReference),
  credentialSlotIds: cloneCredentialSlotSet(binding.credentialSlotIds),
  providerAuthority: cloneProviderAuthority(binding.providerAuthority)
});

const cloneCredentialBindingSet = (
  bindings: AuthorityCredentialBindingSet
): AuthorityCredentialBindingSet => Object.freeze([
  cloneCredentialBinding(bindings[0]),
  ...bindings.slice(1).map(cloneCredentialBinding)
]);

const sameValues = (
  left: readonly Readonly<{ value: string }>[],
  right: readonly Readonly<{ value: string }>[]
): boolean => {
  const leftValues = left.map(value => value.value).toSorted();
  const rightValues = right.map(value => value.value).toSorted();
  return leftValues.length === rightValues.length &&
    leftValues.every((value, index) => value === rightValues[index]);
};

const sameAccount = (left: ProviderAccount, right: ProviderAccount): boolean =>
  left.type === 'unspecified'
    ? right.type === 'unspecified'
    : right.type === 'named' && left.label.value === right.label.value;

const sameText = (left: string, right: string): boolean => left === right;

const sameProviderAuthority = (left: ProviderAuthority, right: ProviderAuthority): boolean =>
  left.provider.value === right.provider.value &&
  sameAccount(left.account, right.account) &&
  left.environment.value === right.environment.value &&
  left.requirements.type === right.requirements.type &&
  sameValues(left.requirements.operations, right.requirements.operations) &&
  sameValues(left.requirements.scopes, right.requirements.scopes);

const sameCredentialBinding = (
  left: AuthorityCredentialBinding,
  right: AuthorityCredentialBinding
): boolean => left.credentialReference.value === right.credentialReference.value &&
  sameProviderAuthority(left.providerAuthority, right.providerAuthority) &&
  sameValues(
    left.credentialSlotIds.map(value => ({ value })),
    right.credentialSlotIds.map(value => ({ value }))
  );

const sameCredentialBindingSet = (
  left: AuthorityCredentialBindingSet,
  right: AuthorityCredentialBindingSet
): boolean => left.length === right.length && left.every(binding => {
  const candidate = right.find(
    current => current.credentialReference.value === binding.credentialReference.value
  );
  return candidate !== undefined && sameCredentialBinding(binding, candidate);
});

const sameDisplay = (left: AuthorityConsentDisplay, right: AuthorityConsentDisplay): boolean =>
  left.repository === right.repository &&
  left.recipeRevision === right.recipeRevision &&
  left.recipeDisplayPath.value === right.recipeDisplayPath.value &&
  left.requestingExecutable.value === right.requestingExecutable.value &&
  sameCredentialBindingSet(left.credentialBindings, right.credentialBindings) &&
  sameText(left.deliveryMode, right.deliveryMode) &&
  left.grantExpiresAt.value === right.grantExpiresAt.value;

const expectedDisplay = (state: AwaitingConsentAuthorityRequest): AuthorityConsentDisplay => Object.freeze({
  repository: state.proposal.repository,
  recipeRevision: state.proposal.recipeRevision,
  recipeDisplayPath: freezeClone(state.proposal.recipeDisplayPath),
  requestingExecutable: freezeClone(state.proposal.requestingExecutable),
  credentialBindings: cloneCredentialBindingSet(state.policy.credentialBindings),
  deliveryMode: state.proposal.deliveryMode,
  grantExpiresAt: freezeClone(state.policy.grantExpiresAt)
});

const promptIdentityMatches = (
  state: AwaitingConsentAuthorityRequest,
  effect: OpenAuthorityConsentEffect
): boolean =>
  effect.correlationId.value === state.operationId.value &&
  effect.idempotencyKey.value === state.consentId.value &&
  effect.expectedGrantGeneration === state.proposal.grantGeneration &&
  effect.deadline.value === state.consentWindow.expiresAt.value &&
  sameDisplay(effect.display, expectedDisplay(state));

export const planTrustedCredentialPrompt = (
  state: AwaitingConsentAuthorityRequest,
  effect: OpenAuthorityConsentEffect,
  startedAt: AuthorityInstant,
  credentialBinding: AuthorityCredentialBinding,
  bindingOrdinal: number
): TrustedPromptResult<TrustedCredentialPrompt> => {
  if (state.proposal.consentPurpose !== 'credential-enrollment' ||
      effect.method !== 'credential-enrollment') {
    return trustedPromptErr({
      code: 'prompt-transition-invalid',
      message: 'Credential entry is not the authorized consent method.'
    });
  }
  if (!promptIdentityMatches(state, effect)) {
    return trustedPromptErr({
      code: 'prompt-identity-mismatch',
      message: 'Trusted prompt identity does not match broker-derived authority.'
    });
  }
  const authorizedBinding = state.policy.credentialBindings.find(binding =>
    binding.credentialReference.value === credentialBinding.credentialReference.value
  );
  if (authorizedBinding === undefined || !sameCredentialBinding(authorizedBinding, credentialBinding)) {
    return trustedPromptErr({
      code: 'prompt-identity-mismatch',
      message: 'Credential prompt binding does not match broker-derived authority.'
    });
  }
  const bindingCount = state.policy.credentialBindings.length;
  if (!Number.isSafeInteger(bindingOrdinal) || bindingOrdinal < 1 || bindingOrdinal > bindingCount ||
      state.policy.credentialBindings[bindingOrdinal - 1]?.credentialReference.value !==
        credentialBinding.credentialReference.value) {
    return trustedPromptErr({
      code: 'prompt-identity-mismatch',
      message: 'Credential prompt position does not match broker-derived authority.'
    });
  }
  if (startedAt.value < state.consentWindow.issuedAt.value ||
      startedAt.value >= state.consentWindow.expiresAt.value) {
    return trustedPromptErr({ code: 'prompt-expired', message: 'Trusted credential prompt is expired.' });
  }
  return trustedPromptOk(Object.freeze({
    version: TRUSTED_PROMPT_VERSION,
    kind: 'credential-entry',
    correlationId: freezeClone(state.operationId),
    consentId: freezeClone(state.consentId),
    deadline: freezeClone(state.consentWindow.expiresAt),
    display: expectedDisplay(state),
    credentialBinding: cloneCredentialBinding(credentialBinding),
    bindingPosition: Object.freeze({ ordinal: bindingOrdinal, count: bindingCount }),
    hostRequirement: 'distinct-user-visible-broker-window',
    inputPolicy: Object.freeze({
      echo: 'masked',
      clipboard: 'forbidden',
      minimumCodeUnits: 1,
      maximumCodeUnits: TRUSTED_PROMPT_MAX_SECRET_CODE_UNITS
    })
  }));
};

const validateDecisionTime = (
  state: AwaitingConsentAuthorityRequest,
  decidedAt: AuthorityInstant
): TrustedPromptResult<AuthorityInstant> =>
  decidedAt.value >= state.consentWindow.issuedAt.value &&
    decidedAt.value < state.consentWindow.expiresAt.value
    ? trustedPromptOk(freezeClone(decidedAt))
    : trustedPromptErr({ code: 'prompt-expired', message: 'Trusted prompt decision is outside its authority window.' });

const validateTimeout = (
  state: AwaitingConsentAuthorityRequest,
  decidedAt: AuthorityInstant
): TrustedPromptResult<AuthorityInstant> =>
  decidedAt.value >= state.consentWindow.expiresAt.value
    ? trustedPromptOk(freezeClone(decidedAt))
    : trustedPromptErr({ code: 'prompt-transition-invalid', message: 'Trusted prompt timed out before its deadline.' });

const readClock = (runtime: TrustedPromptRuntimePort): TrustedPromptResult<AuthorityInstant> => Result.fromThrowable(
  () => runtime.nowMs(),
  () => [promptUnavailableIssue()] as const
)().andThen(value => {
  const parsed = parseAuthorityInstant(value);
  return parsed.type === 'ok'
    ? trustedPromptOk(freezeClone(parsed.value))
    : trustedPromptErr(promptUnavailableIssue());
});

const safeTrustedTask = <Value>(
  operation: () => TrustedPromptTaskResult<Value>,
  failure: TrustedPromptIssue
): TrustedPromptTaskResult<Value> => {
  const promised: Promise<TrustedPromptResult<Value>> = Promise.resolve().then(operation);
  return ResultAsync.fromPromise(promised, () => [failure] as const).andThen(result => result);
};

const secretStoreFailureIssue = (): SecretLeaseIssue => ({
  code: 'secret-store-failed',
  message: 'The operating-system credential operation failed.'
});

const safeSecretStoreTask = <Value>(
  operation: () => SecretLeaseTaskResult<Value>
): SecretLeaseTaskResult<Value> => {
  const promised: Promise<SecretLeaseResult<Value>> = Promise.resolve().then(operation);
  return ResultAsync.fromPromise(
    promised,
    () => [secretStoreFailureIssue()] as const
  ).andThen(result => result);
};

const storeIssues = (issues: SecretLeaseIssues): TrustedPromptIssues => issues.some(
  issue => issue.code === 'secret-input-invalid'
)
  ? [inputInvalidIssue()]
  : [{
      code: 'secret-store-failed',
      message: 'The entered credential could not be stored by the operating-system credential service.'
    }];

const capturePort = (scope: SecretInputScope): TrustedPromptSecretInputPort => Object.freeze({
  capture: (secretText: unknown) => scope.capture.capture(secretText).mapErr(() => [inputInvalidIssue()] as const)
});

const promptResultTask = <Value>(result: TrustedPromptResult<Value>): TrustedPromptTaskResult<Value> =>
  result.isOk()
    ? trustedPromptTaskOk(result.value)
    : trustedPromptTaskErr(result.error[0], ...result.error.slice(1));

const promptInputSeal: unique symbol = Symbol('nebular.trusted-prompt-input/v2');

type PendingCredentialInput = Readonly<{
  [promptInputSeal]: true;
}>;

type PendingCredentialInputState = Readonly<{
  acceptedAt: AuthorityInstant;
  input: SecretInput;
}>;

type StoredCredentialConsent = Readonly<{
  acceptedAt: AuthorityInstant;
  store: SecretStoreWriteOutcome;
}>;

type PromptCallbackGuards = Readonly<{
  first: AbortController;
  violation: AbortController;
  closed: AbortController;
  runClosed: AbortController;
}>;

const prepareCredentialInput = (
  state: AwaitingConsentAuthorityRequest,
  input: SecretInput,
  scope: SecretInputScope,
  runtime: TrustedPromptRuntimePort,
  guards: PromptCallbackGuards,
  pendingInputs: WeakMap<object, PendingCredentialInputState>
): TrustedPromptTaskResult<PendingCredentialInput> => {
  if (guards.closed.signal.aborted || guards.runClosed.signal.aborted || guards.first.signal.aborted) {
    guards.violation.abort();
    return trustedPromptTaskErr({
      code: 'prompt-transition-invalid',
      message: 'Trusted prompt input callback was invoked outside its single-use window.'
    });
  }
  guards.first.abort();
  if (!secretInputBelongsToScope(scope.nonce, input)) return trustedPromptTaskErr(inputInvalidIssue());
  const acceptedAt = readClock(runtime).andThen(at => validateDecisionTime(state, at));
  if (acceptedAt.isErr()) return trustedPromptTaskErr(acceptedAt.error[0], ...acceptedAt.error.slice(1));
  const pendingInput: PendingCredentialInput = Object.freeze({ [promptInputSeal]: true });
  pendingInputs.set(pendingInput, { acceptedAt: acceptedAt.value, input });
  return trustedPromptTaskOk(pendingInput);
};

const consumePendingCredentialInput = (
  candidate: unknown,
  pendingInputs: WeakMap<object, PendingCredentialInputState>
): PendingCredentialInputState | null => {
  if (typeof candidate !== 'object' || candidate === null) return null;
  const pendingInput = pendingInputs.get(candidate);
  if (pendingInput === undefined) return null;
  pendingInputs.delete(candidate);
  return pendingInput;
};

const acceptedCompletion = (
  consent: StoredCredentialConsent,
  credentialsStored = 1
): TrustedCredentialEnrollmentCompletion => Object.freeze({
  outcome: 'accepted',
  event: Object.freeze({ type: 'credential-entry-accepted', at: freezeClone(consent.acceptedAt) }),
  receipt: Object.freeze({ credentialsStored })
});

const deniedCompletion = (
  at: AuthorityInstant,
  outcome: 'denied' | 'cancelled'
): TrustedCredentialEnrollmentCompletion => outcome === 'denied'
  ? Object.freeze({
      outcome: 'denied',
      event: Object.freeze({ type: 'denied', at: freezeClone(at), reason: 'user-denied' })
    })
  : Object.freeze({
      outcome: 'cancelled',
      event: Object.freeze({ type: 'denied', at: freezeClone(at), reason: 'cancelled' })
    });

const timedOutCompletion = (
  at: AuthorityInstant
): TrustedCredentialEnrollmentCompletion => Object.freeze({
  outcome: 'timed-out',
  event: Object.freeze({ type: 'expire', at: freezeClone(at) })
});

const storeAcceptedCredentialInput = (
  state: AwaitingConsentAuthorityRequest,
  credentialBinding: AuthorityCredentialBinding,
  ticket: unknown,
  pendingInputs: WeakMap<object, PendingCredentialInputState>,
  scope: SecretInputScope,
  ports: TrustedCredentialEnrollmentPorts
): TrustedPromptTaskResult<TrustedCredentialEnrollmentCompletion> => {
  const pendingInput = consumePendingCredentialInput(ticket, pendingInputs);
  if (pendingInput === null) return trustedPromptTaskErr({
    code: 'prompt-transition-invalid',
    message: 'Trusted prompt acceptance was not produced by its input callback.'
  });
  const beforeStore = readClock(ports.runtime).andThen(at => validateDecisionTime(state, at));
  if (beforeStore.isErr()) return trustedPromptTaskErr(beforeStore.error[0], ...beforeStore.error.slice(1));
  return safeSecretStoreTask(() => ports.store.store(
    credentialBinding.credentialReference,
    pendingInput.input,
    scope.nonce
  )).mapErr(storeIssues).andThen(storeOutcome => {
    const completedAt = readClock(ports.runtime).andThen(at => validateDecisionTime(state, at));
    return completedAt.isErr()
      ? trustedPromptTaskErr(completedAt.error[0], ...completedAt.error.slice(1))
      : trustedPromptTaskOk(acceptedCompletion({ acceptedAt: pendingInput.acceptedAt, store: storeOutcome }));
  });
};

const settleNonaccepted = (
  state: AwaitingConsentAuthorityRequest,
  outcome: 'denied' | 'cancelled',
  runtime: TrustedPromptRuntimePort
): TrustedPromptTaskResult<TrustedCredentialEnrollmentCompletion> => {
  const decidedAt = readClock(runtime);
  if (decidedAt.isErr()) return trustedPromptTaskErr(decidedAt.error[0], ...decidedAt.error.slice(1));
  if (decidedAt.value.value >= state.consentWindow.expiresAt.value) {
    return trustedPromptTaskOk(timedOutCompletion(freezeClone(state.consentWindow.expiresAt)));
  }
  return promptResultTask(validateDecisionTime(state, decidedAt.value).map(at => deniedCompletion(at, outcome)));
};

const settlePromptOutcome = (
  state: AwaitingConsentAuthorityRequest,
  credentialBinding: AuthorityCredentialBinding,
  outcome: TrustedCredentialPromptOutcome<PendingCredentialInput>,
  guards: PromptCallbackGuards,
  pendingInputs: WeakMap<object, PendingCredentialInputState>,
  scope: SecretInputScope,
  ports: TrustedCredentialEnrollmentPorts
): TrustedPromptTaskResult<TrustedCredentialEnrollmentCompletion> => {
  guards.closed.abort();
  sealSecretInputScope(scope);
  if (guards.runClosed.signal.aborted) return trustedPromptTaskErr({
    code: 'prompt-expired',
    message: 'Trusted prompt completed after its broker-owned deadline.'
  });
  if (guards.violation.signal.aborted) return trustedPromptTaskErr(transitionInvalidIssue());
  switch (outcome.outcome) {
    case 'accepted':
      return guards.first.signal.aborted
        ? storeAcceptedCredentialInput(state, credentialBinding, outcome.value, pendingInputs, scope, ports)
        : trustedPromptTaskErr(transitionInvalidIssue());
    case 'denied':
    case 'cancelled':
      return guards.first.signal.aborted
        ? trustedPromptTaskErr(transitionInvalidIssue())
        : settleNonaccepted(state, outcome.outcome, ports.runtime);
    default:
      return trustedPromptTaskErr(transitionInvalidIssue());
  }
};

const runPromptInteraction = (
  state: AwaitingConsentAuthorityRequest,
  credentialBinding: AuthorityCredentialBinding,
  prompt: TrustedCredentialPrompt,
  scope: SecretInputScope,
  guards: PromptCallbackGuards,
  ports: TrustedCredentialEnrollmentPorts
): TrustedPromptTaskResult<TrustedCredentialEnrollmentCompletion> => {
  const pendingInputs = new WeakMap<object, PendingCredentialInputState>();
  return safeTrustedTask(
    () => ports.prompt.withCredentialInput(
      prompt,
      capturePort(scope),
      input => prepareCredentialInput(state, input, scope, ports.runtime, guards, pendingInputs)
    ).andThen(outcome => settlePromptOutcome(
      state,
      credentialBinding,
      outcome,
      guards,
      pendingInputs,
      scope,
      ports
    )),
    promptUnavailableIssue()
  );
};

const claimFor = (
  state: AwaitingConsentAuthorityRequest,
  credentialBinding: AuthorityCredentialBinding,
  bindingOrdinal: number
): TrustedCredentialEnrollmentClaim => Object.freeze({
  version: TRUSTED_PROMPT_CLAIM_VERSION,
  operationId: state.operationId.value,
  consentId: state.consentId.value,
  repository: state.proposal.repository,
  recipeRevision: state.proposal.recipeRevision,
  credentialReference: credentialBinding.credentialReference.value,
  credentialSlotIds: Object.freeze([...credentialBinding.credentialSlotIds]),
  credentialBindingOrdinal: bindingOrdinal,
  credentialBindingCount: state.policy.credentialBindings.length,
  authorityDigest: state.proposal.authorityDigest.value,
  expectedGrantGeneration: state.proposal.grantGeneration,
  deadlineMs: state.consentWindow.expiresAt.value
});

const normalizeCompletion = (
  state: AwaitingConsentAuthorityRequest,
  completion: TrustedCredentialEnrollmentCompletion
): TrustedPromptResult<TrustedCredentialEnrollmentCompletion> => Result.fromThrowable(
  () => completion,
  () => [idempotencyFailedIssue()] as const
)().andThen(candidate => {
  switch (candidate.outcome) {
    case 'accepted':
      return sameText(candidate.event.type, 'credential-entry-accepted') &&
        candidate.receipt.credentialsStored === 1
        ? validateDecisionTime(state, candidate.event.at).map(at => acceptedCompletion({
            acceptedAt: at,
            store: { outcome: 'stored' }
          }))
        : trustedPromptErr(idempotencyFailedIssue());
    case 'denied':
      return sameText(candidate.event.type, 'denied') && sameText(candidate.event.reason, 'user-denied')
        ? validateDecisionTime(state, candidate.event.at).map(at => deniedCompletion(at, 'denied'))
        : trustedPromptErr(idempotencyFailedIssue());
    case 'cancelled':
      return sameText(candidate.event.type, 'denied') && sameText(candidate.event.reason, 'cancelled')
        ? validateDecisionTime(state, candidate.event.at).map(at => deniedCompletion(at, 'cancelled'))
        : trustedPromptErr(idempotencyFailedIssue());
    case 'timed-out':
      return sameText(candidate.event.type, 'expire')
        ? validateTimeout(state, candidate.event.at).map(timedOutCompletion)
        : trustedPromptErr(idempotencyFailedIssue());
  }
});

type IdempotencyExecutionGuards = Readonly<{
  invoked: AbortController;
  violation: AbortController;
}>;

const runDurablyClaimed = (
  state: AwaitingConsentAuthorityRequest,
  credentialBinding: AuthorityCredentialBinding,
  bindingOrdinal: number,
  prompt: TrustedCredentialPrompt,
  scope: SecretInputScope,
  promptGuards: PromptCallbackGuards,
  ports: TrustedCredentialEnrollmentPorts
): TrustedPromptTaskResult<TrustedCredentialEnrollmentCompletion> => {
  const executionGuards: IdempotencyExecutionGuards = {
    invoked: new AbortController(),
    violation: new AbortController()
  };
  const execute = (): TrustedPromptTaskResult<TrustedCredentialEnrollmentCompletion> => {
    if (promptGuards.runClosed.signal.aborted || executionGuards.invoked.signal.aborted) {
      executionGuards.violation.abort();
      return trustedPromptTaskErr(idempotencyFailedIssue());
    }
    executionGuards.invoked.abort();
    return runPromptInteraction(state, credentialBinding, prompt, scope, promptGuards, ports);
  };
  return safeTrustedTask(
    () => ports.idempotency.runOnce(claimFor(state, credentialBinding, bindingOrdinal), execute),
    idempotencyFailedIssue()
  ).andThen(outcome => {
    if (executionGuards.violation.signal.aborted) return trustedPromptTaskErr(idempotencyFailedIssue());
    const invocationMatches = outcome.outcome === 'executed'
      ? executionGuards.invoked.signal.aborted
      : !executionGuards.invoked.signal.aborted;
    return invocationMatches
      ? promptResultTask(normalizeCompletion(state, outcome.completion))
      : trustedPromptTaskErr(idempotencyFailedIssue());
  });
};

type EnrollmentRaceOutcome =
  | Readonly<{
      outcome: 'operation';
      result: TrustedPromptResult<TrustedCredentialEnrollmentCompletion>;
    }>
  | Readonly<{ outcome: 'deadline' }>
  | Readonly<{ outcome: 'deadline-failed' }>;

const cancelDeadline = (deadline: TrustedPromptDeadlineHandle): void => {
  Result.fromThrowable(deadline.cancel, () => undefined)();
};

const finalizeEnrollmentRace = (
  state: AwaitingConsentAuthorityRequest,
  raced: EnrollmentRaceOutcome,
  scope: SecretInputScope,
  guards: PromptCallbackGuards,
  deadline: TrustedPromptDeadlineHandle
): TrustedPromptResult<TrustedCredentialEnrollmentCompletion> => {
  guards.runClosed.abort();
  guards.closed.abort();
  sealSecretInputScope(scope);
  disposeSecretInputScope(scope);
  cancelDeadline(deadline);
  if (raced.outcome === 'operation') return raced.result;
  if (raced.outcome === 'deadline-failed') return trustedPromptErr(promptUnavailableIssue());
  return guards.first.signal.aborted
    ? trustedPromptErr(transitionInvalidIssue())
    : trustedPromptOk(timedOutCompletion(freezeClone(state.consentWindow.expiresAt)));
};

const raceEnrollment = (
  state: AwaitingConsentAuthorityRequest,
  operation: TrustedPromptTaskResult<TrustedCredentialEnrollmentCompletion>,
  scope: SecretInputScope,
  guards: PromptCallbackGuards,
  deadline: TrustedPromptDeadlineHandle
): TrustedPromptTaskResult<TrustedCredentialEnrollmentCompletion> => {
  const operationPromise: Promise<EnrollmentRaceOutcome> = Promise.resolve(operation).then(
    result => ({ outcome: 'operation', result } as const),
    () => ({ outcome: 'operation', result: trustedPromptErr(promptUnavailableIssue()) } as const)
  );
  const deadlinePromise: Promise<EnrollmentRaceOutcome> = Promise.resolve().then(
    () => deadline.elapsed
  ).then(
    () => ({ outcome: 'deadline' } as const),
    () => ({ outcome: 'deadline-failed' } as const)
  );
  return ResultAsync.fromSafePromise(Promise.race([operationPromise, deadlinePromise]))
    .andThen(raced => finalizeEnrollmentRace(state, raced, scope, guards, deadline));
};

const openDeadline = (
  runtime: TrustedPromptRuntimePort,
  afterMs: number
): TrustedPromptResult<TrustedPromptDeadlineHandle> => Result.fromThrowable(
  () => runtime.openDeadline(afterMs),
  () => [promptUnavailableIssue()] as const
)();

const runTrustedCredentialBindingEnrollment = (
  state: AwaitingConsentAuthorityRequest,
  effect: OpenAuthorityConsentEffect,
  credentialBinding: AuthorityCredentialBinding,
  bindingOrdinal: number,
  ports: TrustedCredentialEnrollmentPorts
): TrustedPromptTaskResult<TrustedCredentialEnrollmentCompletion> => {
  const startedAt = readClock(ports.runtime);
  if (startedAt.isErr()) return trustedPromptTaskErr(startedAt.error[0], ...startedAt.error.slice(1));
  const planned = planTrustedCredentialPrompt(
    state,
    effect,
    startedAt.value,
    credentialBinding,
    bindingOrdinal
  );
  if (planned.isErr()) return trustedPromptTaskErr(planned.error[0], ...planned.error.slice(1));
  const deadline = openDeadline(
    ports.runtime,
    planned.value.deadline.value - startedAt.value.value
  );
  if (deadline.isErr()) return trustedPromptTaskErr(deadline.error[0], ...deadline.error.slice(1));
  const scope = openSecretInputScope();
  const guards: PromptCallbackGuards = {
    first: new AbortController(),
    violation: new AbortController(),
    closed: new AbortController(),
    runClosed: new AbortController()
  };
  return raceEnrollment(
    state,
    runDurablyClaimed(state, credentialBinding, bindingOrdinal, planned.value, scope, guards, ports),
    scope,
    guards,
    deadline.value
  );
};

const runCredentialBindingSet = (
  state: AwaitingConsentAuthorityRequest,
  effect: OpenAuthorityConsentEffect,
  bindings: AuthorityCredentialBindingSet,
  index: number,
  ports: TrustedCredentialEnrollmentPorts
): TrustedPromptTaskResult<TrustedCredentialEnrollmentCompletion> => {
  const binding = bindings[index];
  if (binding === undefined) return trustedPromptTaskErr(transitionInvalidIssue());
  return runTrustedCredentialBindingEnrollment(state, effect, binding, index + 1, ports).andThen(completion => {
    if (completion.outcome !== 'accepted') return trustedPromptTaskOk(completion);
    const next = index + 1;
    if (next < bindings.length) return runCredentialBindingSet(state, effect, bindings, next, ports);
    return trustedPromptTaskOk(Object.freeze({
      outcome: 'accepted' as const,
      event: completion.event,
      receipt: Object.freeze({ credentialsStored: bindings.length })
    }));
  });
};

/**
 * Each credential binding is claimed and prompted independently under the one
 * broker-owned consent window. A partially completed sequence never emits the
 * lifecycle approval event; durable idempotency can resume already stored
 * bindings without exposing their values or asking for them again.
 */
export const runTrustedCredentialEnrollment = (
  state: AwaitingConsentAuthorityRequest,
  effect: OpenAuthorityConsentEffect,
  ports: TrustedCredentialEnrollmentPorts
): TrustedPromptTaskResult<TrustedCredentialEnrollmentCompletion> =>
  runCredentialBindingSet(state, effect, state.policy.credentialBindings, 0, ports);
