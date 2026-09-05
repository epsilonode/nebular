import { type Result, type ResultAsync } from 'neverthrow';
import type { CanonicalRepository, CredentialSlotId, GrantId, ProcessAttemptId, ReceiverId, RecipeRevision } from './primitives.ts';
export type SecretLeaseIssueCode = 'attempt-not-ready' | 'bootstrap-rejected' | 'grant-expired' | 'grant-revoked' | 'lease-expired' | 'lease-invalid' | 'lease-transition-invalid' | 'recipe-drift' | 'secret-input-invalid' | 'secret-store-failed' | 'secret-unavailable' | 'slot-not-authorized';
export type SecretLeaseIssue = Readonly<{
    code: SecretLeaseIssueCode;
    message: string;
}>;
export type SecretLeaseIssues = readonly [SecretLeaseIssue, ...SecretLeaseIssue[]];
export type SecretLeaseResult<T> = Result<T, SecretLeaseIssues>;
export type SecretLeaseTaskResult<T> = ResultAsync<T, SecretLeaseIssues>;
export declare const secretLeaseOk: <T>(value: T) => SecretLeaseResult<T>;
export declare const secretLeaseErr: <T = never>(issue: SecretLeaseIssue, ...rest: readonly SecretLeaseIssue[]) => SecretLeaseResult<T>;
export declare const secretLeaseTaskOk: <T>(value: T) => SecretLeaseTaskResult<T>;
export declare const secretLeaseTaskErr: <T = never>(issue: SecretLeaseIssue, ...rest: readonly SecretLeaseIssue[]) => SecretLeaseTaskResult<T>;
type OpaqueReference<Kind extends string> = Readonly<{
    kind: Kind;
    value: string;
}>;
export type CredentialReference = OpaqueReference<'credential-reference'>;
export type SecretLeaseId = OpaqueReference<'secret-lease-id'>;
export type SecretExposureCorrelation = OpaqueReference<'secret-exposure-correlation'>;
export type SecretExposureCleanupReceiptId = OpaqueReference<'secret-exposure-cleanup-receipt-id'>;
export declare const parseCredentialReference: (value: unknown) => SecretLeaseResult<CredentialReference>;
export declare const parseSecretLeaseId: (value: unknown) => SecretLeaseResult<SecretLeaseId>;
export declare const parseSecretExposureCorrelation: (value: unknown) => SecretLeaseResult<SecretExposureCorrelation>;
export declare const parseSecretExposureCleanupReceiptId: (value: unknown) => SecretLeaseResult<SecretExposureCleanupReceiptId>;
export type SecretSlotBinding = Readonly<{
    slotId: CredentialSlotId;
    credentialReference: CredentialReference;
    environmentName: string;
}>;
export type SecretDeliveryGrant = Readonly<{
    id: GrantId;
    generation: number;
    repository: CanonicalRepository;
    recipeRevision: RecipeRevision;
    bindings: readonly SecretSlotBinding[];
    expiresAtMs: number;
    revoked: boolean;
    exposureMode: 'cooperative-bootstrap';
}>;
export type SecretLeaseRequest = Readonly<{
    id: SecretLeaseId;
    grantId: GrantId;
    grantGeneration: number;
    repository: CanonicalRepository;
    recipeRevision: RecipeRevision;
    receiverId: ReceiverId;
    processAttemptId: ProcessAttemptId;
    exposureCorrelation: SecretExposureCorrelation;
    bindings: readonly SecretSlotBinding[];
    requestedAtMs: number;
    expiresAtMs: number;
    exposureMode: 'cooperative-bootstrap';
}>;
export type SecretLeaseFacts = Readonly<{
    id: SecretLeaseId;
    grantId: GrantId;
    grantGeneration: number;
    repository: CanonicalRepository;
    recipeRevision: RecipeRevision;
    receiverId: ReceiverId;
    processAttemptId: ProcessAttemptId;
    exposureCorrelation: SecretExposureCorrelation;
    bindings: readonly SecretSlotBinding[];
    authorizedAtMs: number;
    expiresAtMs: number;
    exposureMode: 'cooperative-bootstrap';
}>;
export type AuthorizedSecretLease = Readonly<{
    state: 'authorized';
    facts: SecretLeaseFacts;
}>;
export type DeliveringSecretLease = Readonly<{
    state: 'delivering';
    facts: SecretLeaseFacts;
    deliveryStartedAtMs: number;
}>;
export type ExposedSecretLease = Readonly<{
    state: 'exposed';
    facts: SecretLeaseFacts;
    deliveryStartedAtMs: number;
    acknowledgedAtMs: number;
}>;
export type SecretLeaseRevocationReason = 'bootstrap-rejected' | 'cancelled' | 'grant-revoked' | 'lease-expired' | 'secret-unavailable' | 'target-terminal';
export type SecretExposureClosureReason = 'cancelled' | 'grant-revoked' | 'lease-expired' | 'target-terminal';
export type SecretExposureRecoveryReason = 'acknowledgement-ambiguous' | 'cleanup-ambiguous' | 'delivery-failed' | 'journal-ambiguous';
export type SecretExposureRecoveryPhase = 'authorization' | 'delivery' | 'exposure' | 'closure';
export type SecretExposureCleanupReceipt = Readonly<{
    format: 'secret-exposure-cleanup-receipt/v1';
    id: SecretExposureCleanupReceiptId;
    exposureCorrelation: SecretExposureCorrelation;
    receiverId: ReceiverId;
    processAttemptId: ProcessAttemptId;
    proof: 'exact-tree-empty';
    observedAtMs: number;
}>;
export type RevokedSecretLease = Readonly<{
    state: 'revoked';
    facts: SecretLeaseFacts;
    revokedAtMs: number;
    reason: SecretLeaseRevocationReason;
}>;
export type ClosureRequiredSecretLease = Readonly<{
    state: 'closure-required';
    facts: SecretLeaseFacts;
    deliveryStartedAtMs: number;
    acknowledgedAtMs: number;
    closureRequiredAtMs: number;
    reason: SecretExposureClosureReason;
}>;
export type ClosedSecretLease = Readonly<{
    state: 'closed';
    facts: SecretLeaseFacts;
    closedAtMs: number;
    cleanupReceipt: SecretExposureCleanupReceipt;
}>;
export type RecoveryRequiredSecretLease = Readonly<{
    state: 'recovery-required';
    facts: SecretLeaseFacts;
    deliveryStartedAtMs: number | null;
    acknowledgedAtMs: number | null;
    recoveryRequiredAtMs: number;
    phase: SecretExposureRecoveryPhase;
    reason: SecretExposureRecoveryReason;
}>;
export type SecretLease = AuthorizedSecretLease | DeliveringSecretLease | ExposedSecretLease | ClosureRequiredSecretLease | ClosedSecretLease | RevokedSecretLease | RecoveryRequiredSecretLease;
export type SecretLeaseEvent = Readonly<{
    type: 'begin-delivery';
    atMs: number;
}> | Readonly<{
    type: 'acknowledge-exposure';
    atMs: number;
}> | Readonly<{
    type: 'revoke-unexposed';
    atMs: number;
    reason: SecretLeaseRevocationReason;
}> | Readonly<{
    type: 'request-closure';
    atMs: number;
    reason: SecretExposureClosureReason;
}> | Readonly<{
    type: 'require-recovery';
    atMs: number;
    reason: SecretExposureRecoveryReason;
}> | Readonly<{
    type: 'close';
    atMs: number;
    receipt: SecretExposureCleanupReceipt;
}>;
export declare const authorizeSecretLease: (grant: SecretDeliveryGrant, request: SecretLeaseRequest, nowMs: number) => SecretLeaseResult<AuthorizedSecretLease>;
export declare const reduceSecretLease: (lease: SecretLease, event: SecretLeaseEvent) => SecretLeaseResult<SecretLease>;
export {};
