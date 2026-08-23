import {
  err,
  errAsync,
  ok,
  okAsync,
  type Result,
  type ResultAsync
} from 'neverthrow';

import type {
  AuthorityConsentDisplay,
  AuthorityInstant,
  AuthorityRequestEvent,
  AwaitingConsentAuthorityRequest,
  OpenAuthorityConsentEffect,
  ProviderAccount,
  ProviderAuthority
} from './authority-lifecycle.ts';
import type {
  SecretInput,
  SecretStoreAdminPort,
  SecretStoreWriteOutcome
} from './bun-secret-store.ts';

export const TRUSTED_PROMPT_VERSION = 'nebular.trusted-prompt/v1' as const;
export const TRUSTED_PROMPT_MAX_SECRET_CODE_UNITS = 16 * 1024;

export type TrustedPromptIssueCode =
  | 'prompt-expired'
  | 'prompt-identity-mismatch'
  | 'prompt-input-invalid'
  | 'prompt-transition-invalid'
  | 'prompt-unavailable'
  | 'secret-store-failed';

export type TrustedPromptIssue = Readonly<{
  code: TrustedPromptIssueCode;
  message: string;
}>;

export type TrustedPromptIssues = readonly [TrustedPromptIssue, ...TrustedPromptIssue[]];
export type TrustedPromptResult<Value> = Result<Value, TrustedPromptIssues>;
export type TrustedPromptTaskResult<Value> = ResultAsync<Value, TrustedPromptIssues>;

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
  hostRequirement: 'distinct-user-visible-broker-window';
  inputPolicy: Readonly<{
    echo: 'masked';
    clipboard: 'forbidden';
    minimumCodeUnits: 1;
    maximumCodeUnits: typeof TRUSTED_PROMPT_MAX_SECRET_CODE_UNITS;
  }>;
}>;

export type TrustedCredentialPromptOutcome<Value> =
  | Readonly<{ outcome: 'accepted'; acceptedAt: AuthorityInstant; value: Value }>
  | Readonly<{ outcome: 'denied'; decidedAt: AuthorityInstant }>
  | Readonly<{ outcome: 'cancelled'; decidedAt: AuthorityInstant }>
  | Readonly<{ outcome: 'timed-out'; decidedAt: AuthorityInstant }>;

/**
 * Production implementations must own a distinct user-visible broker window,
 * mask input, forbid clipboard use, bound input before construction, and call
 * `use` exactly once only when returning the accepted branch. The entered text
 * must never be placed in argv, environment, IPC, logs, or a returned outcome.
 */
export type TrustedCredentialPromptPort = Readonly<{
  withCredentialInput: <Value>(
    prompt: TrustedCredentialPrompt,
    use: (
      input: SecretInput,
      acceptedAt: AuthorityInstant
    ) => TrustedPromptTaskResult<Value>
  ) => TrustedPromptTaskResult<TrustedCredentialPromptOutcome<Value>>;
}>;

type StoredCredentialConsent = Readonly<{
  acceptedAt: AuthorityInstant;
  store: SecretStoreWriteOutcome;
}>;

export type TrustedCredentialEnrollmentCompletion =
  | Readonly<{
      outcome: 'accepted';
      event: Extract<AuthorityRequestEvent, { type: 'credential-entry-accepted' }>;
      receipt: Readonly<{ credentialStored: true }>;
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

const sameValues = (
  left: readonly Readonly<{ value: string }>[],
  right: readonly Readonly<{ value: string }>[]
): boolean => left.length === right.length &&
  left.every(value => right.some(candidate => candidate.value === value.value));

const sameAccount = (left: ProviderAccount, right: ProviderAccount): boolean =>
  left.type === 'unspecified'
    ? right.type === 'unspecified'
    : right.type === 'named' && left.label.value === right.label.value;

const sameProviderAuthority = (left: ProviderAuthority, right: ProviderAuthority): boolean =>
  left.provider.value === right.provider.value &&
  sameAccount(left.account, right.account) &&
  left.environment.value === right.environment.value &&
  sameValues(left.requirements.operations, right.requirements.operations) &&
  sameValues(left.requirements.scopes, right.requirements.scopes);

const sameDisplay = (left: AuthorityConsentDisplay, right: AuthorityConsentDisplay): boolean =>
  left.repository === right.repository &&
  left.recipeRevision === right.recipeRevision &&
  left.recipeDisplayPath.value === right.recipeDisplayPath.value &&
  left.requestingExecutable.value === right.requestingExecutable.value &&
  sameProviderAuthority(left.providerAuthority, right.providerAuthority) &&
  sameValues(
    left.credentialSlotIds.map(value => ({ value })),
    right.credentialSlotIds.map(value => ({ value }))
  ) &&
  left.grantExpiresAt.value === right.grantExpiresAt.value;

const expectedDisplay = (state: AwaitingConsentAuthorityRequest): AuthorityConsentDisplay => ({
  repository: state.proposal.repository,
  recipeRevision: state.proposal.recipeRevision,
  recipeDisplayPath: state.proposal.recipeDisplayPath,
  requestingExecutable: state.proposal.requestingExecutable,
  providerAuthority: state.policy.providerAuthority,
  credentialSlotIds: state.policy.credentialSlotIds,
  deliveryMode: state.proposal.deliveryMode,
  grantExpiresAt: state.policy.grantExpiresAt
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
  startedAt: AuthorityInstant
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
  if (startedAt.value < state.consentWindow.issuedAt.value ||
      startedAt.value >= state.consentWindow.expiresAt.value) {
    return trustedPromptErr({ code: 'prompt-expired', message: 'Trusted credential prompt is expired.' });
  }
  return trustedPromptOk({
    version: TRUSTED_PROMPT_VERSION,
    kind: 'credential-entry',
    correlationId: state.operationId,
    consentId: state.consentId,
    deadline: state.consentWindow.expiresAt,
    display: expectedDisplay(state),
    hostRequirement: 'distinct-user-visible-broker-window',
    inputPolicy: {
      echo: 'masked',
      clipboard: 'forbidden',
      minimumCodeUnits: 1,
      maximumCodeUnits: TRUSTED_PROMPT_MAX_SECRET_CODE_UNITS
    }
  });
};

const validateDecisionTime = (
  state: AwaitingConsentAuthorityRequest,
  decidedAt: AuthorityInstant
): TrustedPromptResult<AuthorityInstant> =>
  decidedAt.value >= state.consentWindow.issuedAt.value &&
    decidedAt.value < state.consentWindow.expiresAt.value
    ? trustedPromptOk(decidedAt)
    : trustedPromptErr({ code: 'prompt-expired', message: 'Trusted prompt decision is outside its authority window.' });

const validateTimeout = (
  state: AwaitingConsentAuthorityRequest,
  decidedAt: AuthorityInstant
): TrustedPromptResult<AuthorityInstant> =>
  decidedAt.value >= state.consentWindow.expiresAt.value
    ? trustedPromptOk(decidedAt)
    : trustedPromptErr({ code: 'prompt-transition-invalid', message: 'Trusted prompt timed out before its deadline.' });

const storeIssues = (): TrustedPromptIssues => [{
  code: 'secret-store-failed',
  message: 'The entered credential could not be stored by the operating-system credential service.'
}];

const storeCredentialInput = (
  state: AwaitingConsentAuthorityRequest,
  input: SecretInput,
  acceptedAt: AuthorityInstant,
  store: SecretStoreAdminPort
): TrustedPromptTaskResult<StoredCredentialConsent> => {
  const timing = validateDecisionTime(state, acceptedAt);
  if (timing.isErr()) return trustedPromptTaskErr(timing.error[0], ...timing.error.slice(1));
  return store.store(state.proposal.credentialReference, input)
    .map(storeOutcome => ({ acceptedAt, store: storeOutcome }))
    .mapErr(storeIssues);
};

const acceptedCompletion = (
  consent: StoredCredentialConsent
): TrustedCredentialEnrollmentCompletion => ({
  outcome: 'accepted',
  event: { type: 'credential-entry-accepted', at: consent.acceptedAt },
  receipt: { credentialStored: true }
});

const nonacceptedCompletion = (
  state: AwaitingConsentAuthorityRequest,
  outcome: Exclude<TrustedCredentialPromptOutcome<StoredCredentialConsent>, { outcome: 'accepted' }>
): TrustedPromptResult<TrustedCredentialEnrollmentCompletion> => {
  if (outcome.outcome === 'timed-out') {
    return validateTimeout(state, outcome.decidedAt).map(at => ({
      outcome: 'timed-out',
      event: { type: 'expire', at }
    }));
  }
  return validateDecisionTime(state, outcome.decidedAt).map(at => outcome.outcome === 'denied'
    ? {
        outcome: 'denied',
        event: { type: 'denied', at, reason: 'user-denied' }
      }
    : {
        outcome: 'cancelled',
        event: { type: 'denied', at, reason: 'cancelled' }
      });
};

export const runTrustedCredentialEnrollment = (
  state: AwaitingConsentAuthorityRequest,
  effect: OpenAuthorityConsentEffect,
  startedAt: AuthorityInstant,
  prompt: TrustedCredentialPromptPort,
  store: SecretStoreAdminPort
): TrustedPromptTaskResult<TrustedCredentialEnrollmentCompletion> => {
  const planned = planTrustedCredentialPrompt(state, effect, startedAt);
  if (planned.isErr()) return trustedPromptTaskErr(planned.error[0], ...planned.error.slice(1));
  return prompt.withCredentialInput(
    planned.value,
    (input, acceptedAt) => storeCredentialInput(state, input, acceptedAt, store)
  ).andThen(outcome => outcome.outcome === 'accepted'
    ? trustedPromptOk(acceptedCompletion(outcome.value))
    : nonacceptedCompletion(state, outcome));
};
