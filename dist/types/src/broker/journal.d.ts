import type { CredentialReference, SecretExposureCleanupReceipt, SecretExposureCorrelation } from './lease.ts';
import type { CanonicalRepository, CredentialSlotId, GrantId, ProcessAttemptId, ReceiverId, RecipeRevision } from './primitives.ts';
export type JournalIssueCode = 'journal-busy' | 'journal-closed' | 'journal-conflict' | 'journal-authority-stale' | 'journal-corrupt' | 'journal-invalid' | 'journal-not-found' | 'journal-recovery-required' | 'journal-schema-newer' | 'journal-unavailable' | 'transfer-replayed';
export type JournalIssue = Readonly<{
    code: JournalIssueCode;
    message: string;
}>;
export type JournalIssues = readonly [JournalIssue, ...JournalIssue[]];
export type JournalResult<T> = Readonly<{
    type: 'ok';
    value: T;
}> | Readonly<{
    type: 'err';
    issues: JournalIssues;
}>;
export type JournalTaskResult<T> = Promise<JournalResult<T>>;
export declare const journalOk: <T>(value: T) => JournalResult<T>;
export declare const journalErr: <T = never>(issue: JournalIssue, ...rest: readonly JournalIssue[]) => JournalResult<T>;
export declare const mapJournalResult: <T, U>(result: JournalResult<T>, map: (value: T) => U) => JournalResult<U>;
export declare const andThenJournalResult: <T, U>(result: JournalResult<T>, next: (value: T) => JournalResult<U>) => JournalResult<U>;
type JournalReference<Kind extends string> = Readonly<{
    kind: Kind;
    value: string;
}>;
export type ConsentId = JournalReference<'consent-id'>;
export type LeaseJournalId = JournalReference<'lease-id'>;
export type TransferId = JournalReference<'transfer-id'>;
export type JournalOperationId = JournalReference<'journal-operation-id'>;
export type BootstrapExchangeJournalId = JournalReference<'bootstrap-exchange-id'>;
export type RedactedAuthorityDigest = JournalReference<'redacted-authority-digest'>;
export type RedactedPlanDigest = JournalReference<'redacted-plan-digest'>;
export type ReceiverCorrelation = JournalReference<'receiver-correlation'>;
export type CheckedInRecipeLocator = JournalReference<'checked-in-recipe-locator'>;
export type ReceiverEntryIdentity = JournalReference<'receiver-entry-identity'>;
export type ProcessIncarnation = JournalReference<'process-incarnation'>;
export type DurableWindowsNamedJobIdentity = JournalReference<'windows-named-job-identity'>;
export type TrustedProfileRoot = JournalReference<'trusted-profile-root'>;
export type AuthorityDatabasePath = JournalReference<'authority-database-path'>;
export declare const parseConsentId: (value: unknown) => JournalResult<ConsentId>;
export declare const parseLeaseJournalId: (value: unknown) => JournalResult<LeaseJournalId>;
export declare const parseTransferId: (value: unknown) => JournalResult<TransferId>;
export declare const parseJournalOperationId: (value: unknown) => JournalResult<JournalOperationId>;
export declare const parseBootstrapExchangeJournalId: (value: unknown) => JournalResult<BootstrapExchangeJournalId>;
export declare const parseRedactedAuthorityDigest: (value: unknown) => JournalResult<RedactedAuthorityDigest>;
export declare const parseRedactedPlanDigest: (value: unknown) => JournalResult<RedactedPlanDigest>;
export declare const parseReceiverCorrelation: (value: unknown) => JournalResult<ReceiverCorrelation>;
export declare const parseReceiverEntryIdentity: (value: unknown) => JournalResult<ReceiverEntryIdentity>;
export declare const parseProcessIncarnation: (value: unknown) => JournalResult<ProcessIncarnation>;
export declare const parseDurableWindowsNamedJobIdentity: (value: unknown) => JournalResult<DurableWindowsNamedJobIdentity>;
export declare const parseCheckedInRecipeLocator: (value: unknown) => JournalResult<CheckedInRecipeLocator>;
export type ConsentOutcome = 'approved' | 'denied';
export type GrantJournalState = 'active' | 'revoked';
export type LeaseJournalState = 'authorized' | 'delivering' | 'exposed' | 'closure-required' | 'closed' | 'revoked' | 'recovery-required';
export type AttemptJournalState = 'reserved' | 'materializing' | 'running' | 'stopping' | 'succeeded' | 'failed' | 'cancelled' | 'cleanup-required' | 'recovery-required' | 'cleaned';
export type LifecycleKind = 'one-shot' | 'service';
export type JournalOperationKind = 'commit-grant-with-consent' | 'reserve-attempt' | 'bind-bootstrap-attempt' | 'transition-attempt' | 'create-lease' | 'claim-bootstrap-lease' | 'transition-lease' | 'consume-transfer';
export type JournalOperationRecord = Readonly<{
    id: JournalOperationId;
    kind: JournalOperationKind;
    subjectIdentity: string;
    registeredAtMs: number;
}>;
export type ConsentEvidenceRecord = Readonly<{
    id: ConsentId;
    operationId: JournalOperationId;
    repository: CanonicalRepository;
    recipeRevision: RecipeRevision;
    authorityDigest: RedactedAuthorityDigest;
    promptVersion: string;
    credentialSlotIds: readonly CredentialSlotId[];
    deliveryMode: 'cooperative-bootstrap';
    grantExpiresAtMs: number;
    occurredAtMs: number;
    outcome: ConsentOutcome;
}>;
export type GrantCredentialBinding = Readonly<{
    slotId: CredentialSlotId;
    credentialReference: CredentialReference;
}>;
export type GrantCredentialBindingSet = readonly [
    GrantCredentialBinding,
    ...GrantCredentialBinding[]
];
export type GrantJournalRecord = Readonly<{
    id: GrantId;
    operationId: JournalOperationId;
    repository: CanonicalRepository;
    recipeRevision: RecipeRevision;
    credentialBindings: GrantCredentialBindingSet;
    consentId: ConsentId;
    generation: number;
    issuedAtMs: number;
    expiresAtMs: number;
    state: GrantJournalState;
}>;
export type CommitGrantWithConsent = Readonly<{
    operationId: JournalOperationId;
    consent: ConsentEvidenceRecord;
    grant: GrantJournalRecord;
}>;
export type LeaseJournalRecord = Readonly<{
    id: LeaseJournalId;
    operationId: JournalOperationId;
    grantId: GrantId;
    grantGeneration: number;
    processAttemptId: ProcessAttemptId;
    receiverId: ReceiverId;
    exposureCorrelation: SecretExposureCorrelation;
    issuedAtMs: number;
    expiresAtMs: number;
    updatedAtMs: number;
    cleanupReceipt: SecretExposureCleanupReceipt | null;
    state: LeaseJournalState;
}>;
export type CreateLease = Readonly<{
    operationId: JournalOperationId;
    lease: LeaseJournalRecord;
}>;
export type ClaimAuthorizedBootstrapLease = Readonly<{
    operationId: JournalOperationId;
    exchangeId: BootstrapExchangeJournalId;
    lease: LeaseJournalRecord;
    expectedAttempt: Readonly<{
        id: ProcessAttemptId;
        state: 'materializing' | 'running';
        stateVersion: number;
        binding: BootstrapAttemptBinding;
    }>;
}>;
type TransitionLeaseIdentity = Readonly<{
    operationId: JournalOperationId;
    leaseId: LeaseJournalId;
    exposureCorrelation: SecretExposureCorrelation;
    atMs: number;
}>;
export type TransitionLease = TransitionLeaseIdentity & (Readonly<{
    expectedState: 'authorized';
    nextState: 'delivering' | 'revoked' | 'recovery-required';
    cleanupReceipt: null;
}> | Readonly<{
    expectedState: 'delivering';
    nextState: 'exposed' | 'recovery-required';
    cleanupReceipt: null;
}> | Readonly<{
    expectedState: 'exposed';
    nextState: 'closure-required' | 'recovery-required';
    cleanupReceipt: null;
}> | Readonly<{
    expectedState: 'closure-required';
    nextState: 'recovery-required';
    cleanupReceipt: null;
}> | Readonly<{
    expectedState: 'recovery-required';
    nextState: 'closure-required';
    cleanupReceipt: null;
}> | Readonly<{
    expectedState: 'closure-required' | 'recovery-required';
    nextState: 'closed';
    cleanupReceipt: SecretExposureCleanupReceipt;
}>);
type AttemptJournalBase = Readonly<{
    id: ProcessAttemptId;
    reserveOperationId: JournalOperationId;
    repository: CanonicalRepository;
    recipeRevision: RecipeRevision;
    planDigest: RedactedPlanDigest;
    lifecycle: LifecycleKind;
    receiverCorrelation: ReceiverCorrelation | null;
    state: AttemptJournalState;
    stateVersion: number;
    createdAtMs: number;
    updatedAtMs: number;
}>;
export type BootstrapAttemptBinding = Readonly<{
    format: 'bootstrap-attempt-binding/v2';
    bindingGeneration: number;
    grantId: GrantId;
    grantGeneration: number;
    receiverId: ReceiverId;
    receiverEntryIdentity: ReceiverEntryIdentity;
    helperParentProcessId: number;
    helperParentProcessIncarnation: ProcessIncarnation;
    recipeLocator: CheckedInRecipeLocator;
}>;
export type LegacyAttemptJournalRecord = AttemptJournalBase & Readonly<{
    bootstrapBinding: null;
}>;
export type BootstrapAttemptJournalRecord = AttemptJournalBase & Readonly<{
    bootstrapBinding: BootstrapAttemptBinding;
}>;
export type AttemptJournalRecord = LegacyAttemptJournalRecord | BootstrapAttemptJournalRecord;
export type ReserveAttempt = Readonly<{
    operationId: JournalOperationId;
    attempt: LegacyAttemptJournalRecord;
}>;
/**
 * Redacted current grant facts which must still be exact when an execution
 * attempt first becomes eligible for materialization.
 */
export type GrantQualifiedAttemptAuthority = Readonly<{
    grantId: GrantId;
    grantGeneration: number;
    repository: CanonicalRepository;
    recipeRevision: RecipeRevision;
    credentialSlotIds: readonly CredentialSlotId[];
    grantExpiresAtMs: number;
}>;
export type GrantQualifiedOneShotLaunchAdmission = Readonly<{
    format: 'grant-qualified-launch-admission/v1';
    bindingGeneration: number;
    receiverId: ReceiverId;
    receiverSlotIdentity: string;
    receiverProcessName: string;
    receiverEntryIdentity: ReceiverEntryIdentity;
    recipeLocator: CheckedInRecipeLocator;
    slotIndependentPlanDigest: RedactedPlanDigest;
    launchMetadataDigest: string;
    deadlineAtMs: number;
}>;
/**
 * One SQLite transaction reserves an attempt and records its first
 * `reserved -> materializing` transition after re-reading exact grant facts.
 */
export type ReserveGrantQualifiedMaterializingAttempt = Readonly<{
    authorityCheckedAtMs: number;
    authority: GrantQualifiedAttemptAuthority;
    admission: GrantQualifiedOneShotLaunchAdmission;
    reservation: ReserveAttempt;
    materialization: TransitionAttempt & Readonly<{
        expectedState: 'reserved';
        nextState: 'materializing';
        receiverCorrelation: ReceiverCorrelation;
    }>;
}>;
export type GrantQualifiedMaterializingAttemptRecord = Readonly<{
    attempt: AttemptJournalRecord;
    authority: GrantQualifiedAttemptAuthority;
    admission: GrantQualifiedOneShotLaunchAdmission;
}>;
export type VerifiedWindowsJobPolicy = Readonly<{
    format: 'windows-job-policy/v1';
    extendedLimit: 'kill-on-job-close-only';
    uiRestrictions: 'none';
    breakaway: 'forbidden';
}>;
/**
 * Durable redacted evidence created only after the exact PM2 root incarnation
 * has passed the read-only Windows Job membership and policy proof. The record
 * repeats every authority-bearing launch fact deliberately: a later cleanup
 * process can establish one exact join without trusting a caller projection.
 */
export type VerifiedWindowsAttemptContainmentBinding = Readonly<{
    format: 'verified-windows-attempt-containment/v1';
    bindingGeneration: number;
    processAttemptId: ProcessAttemptId;
    repository: CanonicalRepository;
    recipeRevision: RecipeRevision;
    grantId: GrantId;
    grantGeneration: number;
    credentialSlotIds: readonly CredentialSlotId[];
    grantExpiresAtMs: number;
    receiverId: ReceiverId;
    receiverCorrelation: ReceiverCorrelation;
    receiverEntryIdentity: ReceiverEntryIdentity;
    receiverSlotIdentity: string;
    receiverProcessName: string;
    receiverPmId: number;
    recipeLocator: CheckedInRecipeLocator;
    slotIndependentPlanDigest: RedactedPlanDigest;
    launchMetadataDigest: string;
    deadlineAtMs: number;
    rootProcessId: number;
    rootProcessIncarnation: ProcessIncarnation;
    jobIdentity: DurableWindowsNamedJobIdentity;
    jobPolicy: VerifiedWindowsJobPolicy;
    membershipVerifiedAtMs: number;
}>;
export type BindVerifiedWindowsContainmentAndStart = Readonly<{
    operationId: JournalOperationId;
    expectedState: 'materializing';
    expectedStateVersion: number;
    binding: VerifiedWindowsAttemptContainmentBinding;
}>;
export type GrantQualifiedContainedAttemptRecord = GrantQualifiedMaterializingAttemptRecord & Readonly<{
    containmentBinding: VerifiedWindowsAttemptContainmentBinding;
}>;
export type VerifiedWindowsTreeCleanupProof = Readonly<{
    format: 'verified-windows-tree-cleanup/v1';
    proof: 'exact-tree-empty';
    basis: 'job-terminated-empty' | 'job-already-empty' | 'job-missing-root-exited';
    jobIdentity: DurableWindowsNamedJobIdentity;
    rootProcessId: number;
    rootProcessIncarnation: ProcessIncarnation;
    observedAtMs: number;
}>;
export type ExactPm2RecordDeletionReceipt = Readonly<{
    format: 'pm2-exact-record-deletion/v1';
    disposition: 'deleted' | 'already-absent';
    receiverId: ReceiverId;
    receiverCorrelation: ReceiverCorrelation;
    receiverSlotIdentity: string;
    receiverProcessName: string;
    receiverPmId: number;
    processAttemptId: ProcessAttemptId;
    launchMetadataDigest: string;
    deletedAtMs: number;
}>;
export type VerifiedWindowsTerminalCleanupRecord = Readonly<{
    format: 'verified-windows-terminal-cleanup/v1';
    operationId: JournalOperationId;
    processAttemptId: ProcessAttemptId;
    bindingGeneration: number;
    terminalDisposition: 'succeeded' | 'failed' | 'cancelled';
    treeCleanup: VerifiedWindowsTreeCleanupProof;
    pm2Deletion: ExactPm2RecordDeletionReceipt;
    closedExposureCount: number;
    cleanedAtMs: number;
}>;
export type FinalizeVerifiedWindowsTerminalCleanup = Readonly<{
    cleanup: VerifiedWindowsTerminalCleanupRecord;
    expectedAttemptState: Exclude<AttemptJournalState, 'cleaned'>;
    expectedAttemptStateVersion: number;
}>;
type BindBootstrapAttemptBase = Readonly<{
    operationId: JournalOperationId;
    attemptId: ProcessAttemptId;
    expectedStateVersion: number;
    atMs: number;
    receiverCorrelation: ReceiverCorrelation;
    binding: BootstrapAttemptBinding;
}>;
export type BindBootstrapAttempt = BindBootstrapAttemptBase & (Readonly<{
    mode: 'initial';
    expectedState: 'materializing';
    priorBindingGeneration: null;
}> | Readonly<{
    mode: 'rebind-after-recovery';
    expectedState: 'recovery-required';
    priorBindingGeneration: number;
}>);
export type TransitionAttempt = Readonly<{
    operationId: JournalOperationId;
    attemptId: ProcessAttemptId;
    expectedState: AttemptJournalState;
    nextState: AttemptJournalState;
    atMs: number;
    receiverCorrelation: ReceiverCorrelation | null;
}>;
export type TransferReplayRecord = Readonly<{
    id: TransferId;
    operationId: JournalOperationId;
    destinationGrantId: GrantId;
    issuedAtMs: number;
    expiresAtMs: number;
    consumedAtMs: number;
    state: 'consumed';
}>;
export type ConsumeTransfer = Readonly<{
    operationId: JournalOperationId;
    transfer: TransferReplayRecord;
}>;
export type JournalMutation<T> = Readonly<{
    status: 'committed' | 'already-committed';
    record: T;
}>;
export declare const validateGrantWithConsent: (command: CommitGrantWithConsent) => JournalResult<CommitGrantWithConsent>;
export declare const validateLeaseCreation: (command: CreateLease) => JournalResult<CreateLease>;
export declare const validateBootstrapAttemptBind: (command: BindBootstrapAttempt) => JournalResult<BindBootstrapAttempt>;
export declare const validateBootstrapLeaseClaim: (command: ClaimAuthorizedBootstrapLease) => JournalResult<ClaimAuthorizedBootstrapLease>;
export declare const validateLeaseTransition: (command: TransitionLease) => JournalResult<TransitionLease>;
export declare const isAttemptTransitionAllowed: (expected: AttemptJournalState, next: AttemptJournalState) => boolean;
export declare const validateAttemptReservation: (command: ReserveAttempt) => JournalResult<ReserveAttempt>;
export declare const validateGrantQualifiedMaterializingAttempt: (command: ReserveGrantQualifiedMaterializingAttempt) => JournalResult<ReserveGrantQualifiedMaterializingAttempt>;
export declare const validateVerifiedWindowsAttemptContainmentBinding: (binding: VerifiedWindowsAttemptContainmentBinding) => JournalResult<VerifiedWindowsAttemptContainmentBinding>;
export declare const validateVerifiedWindowsContainmentBind: (command: BindVerifiedWindowsContainmentAndStart) => JournalResult<BindVerifiedWindowsContainmentAndStart>;
export declare const validateVerifiedWindowsTerminalCleanupFinalization: (command: FinalizeVerifiedWindowsTerminalCleanup) => JournalResult<FinalizeVerifiedWindowsTerminalCleanup>;
export declare const validateAttemptTransition: (command: TransitionAttempt) => JournalResult<TransitionAttempt>;
export declare const validateTransferConsumption: (command: ConsumeTransfer) => JournalResult<ConsumeTransfer>;
export type GrantJournal = Readonly<{
    commitWithConsent: (command: CommitGrantWithConsent) => JournalTaskResult<JournalMutation<GrantJournalRecord>>;
    readGrant: (id: GrantId) => JournalTaskResult<GrantJournalRecord | null>;
    readConsent: (id: ConsentId) => JournalTaskResult<ConsentEvidenceRecord | null>;
}>;
export type LeaseJournal = Readonly<{
    create: (command: CreateLease) => JournalTaskResult<JournalMutation<LeaseJournalRecord>>;
    claimAuthorized: (command: ClaimAuthorizedBootstrapLease) => JournalTaskResult<JournalMutation<LeaseJournalRecord>>;
    transition: (command: TransitionLease) => JournalTaskResult<JournalMutation<LeaseJournalRecord>>;
    read: (id: LeaseJournalId) => JournalTaskResult<LeaseJournalRecord | null>;
    /** Bounded redacted exposure facts, ordered by durable lease identity. */
    readNonterminalForAttempt: (id: ProcessAttemptId) => JournalTaskResult<readonly LeaseJournalRecord[]>;
    /** Redacted durable count used to make terminal cleanup replay exact. */
    readClosedCountForAttempt: (id: ProcessAttemptId) => JournalTaskResult<number>;
}>;
export type AttemptJournal = Readonly<{
    reserve: (command: ReserveAttempt) => JournalTaskResult<JournalMutation<AttemptJournalRecord>>;
    reserveGrantQualifiedMaterializing: (command: ReserveGrantQualifiedMaterializingAttempt) => JournalTaskResult<JournalMutation<GrantQualifiedMaterializingAttemptRecord>>;
    readGrantQualifiedMaterializing: (id: ProcessAttemptId) => JournalTaskResult<GrantQualifiedMaterializingAttemptRecord | null>;
    /** Durable launch authority/admission joined to the current attempt in any lifecycle state. */
    readGrantQualifiedAttempt: (id: ProcessAttemptId) => JournalTaskResult<GrantQualifiedMaterializingAttemptRecord | null>;
    bindVerifiedWindowsContainmentAndStart: (command: BindVerifiedWindowsContainmentAndStart) => JournalTaskResult<JournalMutation<GrantQualifiedContainedAttemptRecord>>;
    readGrantQualifiedContainedAttempt: (id: ProcessAttemptId) => JournalTaskResult<GrantQualifiedContainedAttemptRecord | null>;
    finalizeVerifiedWindowsTerminalCleanup: (command: FinalizeVerifiedWindowsTerminalCleanup) => JournalTaskResult<JournalMutation<VerifiedWindowsTerminalCleanupRecord>>;
    readVerifiedWindowsTerminalCleanup: (id: ProcessAttemptId) => JournalTaskResult<VerifiedWindowsTerminalCleanupRecord | null>;
    bindBootstrap: (command: BindBootstrapAttempt) => JournalTaskResult<JournalMutation<BootstrapAttemptJournalRecord>>;
    transition: (command: TransitionAttempt) => JournalTaskResult<JournalMutation<AttemptJournalRecord>>;
    read: (id: ProcessAttemptId) => JournalTaskResult<AttemptJournalRecord | null>;
}>;
export type TransferReplayJournal = Readonly<{
    consume: (command: ConsumeTransfer) => JournalTaskResult<JournalMutation<TransferReplayRecord>>;
    read: (id: TransferId) => JournalTaskResult<TransferReplayRecord | null>;
}>;
export type AuthorityJournal = Readonly<{
    grants: GrantJournal;
    leases: LeaseJournal;
    attempts: AttemptJournal;
    transfers: TransferReplayJournal;
}>;
export type ProfilePathPort = Readonly<{
    resolveAuthorityDatabasePath: () => JournalTaskResult<AuthorityDatabasePath>;
}>;
export type TrustedLocalApplicationDataPort = Readonly<{
    resolveCurrentUserRoot: () => JournalTaskResult<TrustedProfileRoot>;
}>;
export {};
