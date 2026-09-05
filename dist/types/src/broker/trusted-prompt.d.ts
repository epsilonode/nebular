import { type Result as NeverthrowResult, type ResultAsync as NeverthrowResultAsync } from 'neverthrow';
import { type AuthorityCredentialBinding, type AuthorityConsentDisplay, type AuthorityInstant, type AuthorityRequestEvent, type AwaitingConsentAuthorityRequest, type OpenAuthorityConsentEffect } from './authority-lifecycle.ts';
import { type SecretInput, type SecretStoreAdminPort } from './bun-secret-store.ts';
export declare const TRUSTED_PROMPT_VERSION: "nebular.trusted-prompt/v1";
export declare const TRUSTED_PROMPT_CLAIM_VERSION: "nebular.trusted-prompt-claim/v2";
export declare const TRUSTED_PROMPT_MAX_SECRET_CODE_UNITS: number;
export type TrustedPromptIssueCode = 'prompt-expired' | 'prompt-identity-mismatch' | 'prompt-idempotency-failed' | 'prompt-input-invalid' | 'prompt-transition-invalid' | 'prompt-unavailable' | 'secret-store-failed';
export type TrustedPromptIssue = Readonly<{
    code: TrustedPromptIssueCode;
    message: string;
}>;
export type TrustedPromptIssues = readonly [TrustedPromptIssue, ...TrustedPromptIssue[]];
export type TrustedPromptResult<Value> = NeverthrowResult<Value, TrustedPromptIssues>;
export type TrustedPromptTaskResult<Value> = NeverthrowResultAsync<Value, TrustedPromptIssues>;
export declare const trustedPromptOk: <Value>(value: Value) => TrustedPromptResult<Value>;
export declare const trustedPromptErr: <Value = never>(issue: TrustedPromptIssue, ...rest: readonly TrustedPromptIssue[]) => TrustedPromptResult<Value>;
export declare const trustedPromptTaskOk: <Value>(value: Value) => TrustedPromptTaskResult<Value>;
export declare const trustedPromptTaskErr: <Value = never>(issue: TrustedPromptIssue, ...rest: readonly TrustedPromptIssue[]) => TrustedPromptTaskResult<Value>;
export type TrustedCredentialPrompt = Readonly<{
    version: typeof TRUSTED_PROMPT_VERSION;
    kind: 'credential-entry';
    correlationId: OpenAuthorityConsentEffect['correlationId'];
    consentId: OpenAuthorityConsentEffect['idempotencyKey'];
    deadline: AuthorityInstant;
    display: AuthorityConsentDisplay;
    credentialBinding: AuthorityCredentialBinding;
    bindingPosition: Readonly<{
        ordinal: number;
        count: number;
    }>;
    hostRequirement: 'distinct-user-visible-broker-window';
    inputPolicy: Readonly<{
        echo: 'masked';
        clipboard: 'forbidden';
        minimumCodeUnits: 1;
        maximumCodeUnits: typeof TRUSTED_PROMPT_MAX_SECRET_CODE_UNITS;
    }>;
}>;
export type TrustedCredentialPromptOutcome<Value> = Readonly<{
    outcome: 'accepted';
    value: Value;
}> | Readonly<{
    outcome: 'denied';
}> | Readonly<{
    outcome: 'cancelled';
}>;
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
    withCredentialInput: <Value>(prompt: TrustedCredentialPrompt, input: TrustedPromptSecretInputPort, use: (input: SecretInput) => TrustedPromptTaskResult<Value>) => TrustedPromptTaskResult<TrustedCredentialPromptOutcome<Value>>;
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
export type TrustedCredentialEnrollmentCompletion = Readonly<{
    outcome: 'accepted';
    event: Extract<AuthorityRequestEvent, {
        type: 'credential-entry-accepted';
    }>;
    receipt: Readonly<{
        credentialsStored: number;
    }>;
}> | Readonly<{
    outcome: 'denied';
    event: Extract<AuthorityRequestEvent, {
        type: 'denied';
    }>;
}> | Readonly<{
    outcome: 'cancelled';
    event: Extract<AuthorityRequestEvent, {
        type: 'denied';
    }>;
}> | Readonly<{
    outcome: 'timed-out';
    event: Extract<AuthorityRequestEvent, {
        type: 'expire';
    }>;
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
export type TrustedCredentialEnrollmentIdempotencyOutcome = Readonly<{
    outcome: 'executed';
    completion: TrustedCredentialEnrollmentCompletion;
}> | Readonly<{
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
    runOnce: (claim: TrustedCredentialEnrollmentClaim, execute: () => TrustedPromptTaskResult<TrustedCredentialEnrollmentCompletion>) => TrustedPromptTaskResult<TrustedCredentialEnrollmentIdempotencyOutcome>;
}>;
export type TrustedCredentialEnrollmentPorts = Readonly<{
    runtime: TrustedPromptRuntimePort;
    prompt: TrustedCredentialPromptPort;
    store: SecretStoreAdminPort;
    idempotency: TrustedCredentialEnrollmentIdempotencyPort;
}>;
export declare const planTrustedCredentialPrompt: (state: AwaitingConsentAuthorityRequest, effect: OpenAuthorityConsentEffect, startedAt: AuthorityInstant, credentialBinding: AuthorityCredentialBinding, bindingOrdinal: number) => TrustedPromptResult<TrustedCredentialPrompt>;
/**
 * Each credential binding is claimed and prompted independently under the one
 * broker-owned consent window. A partially completed sequence never emits the
 * lifecycle approval event; durable idempotency can resume already stored
 * bindings without exposing their values or asking for them again.
 */
export declare const runTrustedCredentialEnrollment: (state: AwaitingConsentAuthorityRequest, effect: OpenAuthorityConsentEffect, ports: TrustedCredentialEnrollmentPorts) => TrustedPromptTaskResult<TrustedCredentialEnrollmentCompletion>;
