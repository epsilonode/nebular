import type { BootstrapRequestMessage } from '../broker-client/public.ts';
import type { AttemptJournal, BootstrapAttemptJournalRecord, CheckedInRecipeLocator, ClaimAuthorizedBootstrapLease, GrantJournal, JournalMutation, JournalTaskResult, LeaseJournalRecord, ProcessIncarnation, ReceiverEntryIdentity, TransitionLease } from './journal.ts';
import { type AuthorizedSecretLease, type SecretExposureCleanupReceipt, type SecretExposureCorrelation, type SecretLeaseId, type SecretLeaseResult, type SecretLeaseTaskResult } from './lease.ts';
import { type CanonicalRepository, type CredentialSlotId, type GrantId, type ProcessAttemptId, type ReceiverId, type RecipeRevision } from './primitives.ts';
import type { BrokerResult } from './result.ts';
export type BootstrapLeaseAuthorityPort = Readonly<{
    /** Independently resolve Git, recipe, grant, receiver, and attempt authority. */
    resolveAuthorizedLease: (request: BootstrapRequestMessage) => SecretLeaseTaskResult<AuthorizedSecretLease>;
    /** Persist the same legal transition performed by the in-memory lease reducer. */
    transitionLease: (transition: BootstrapLeaseAuthorityTransition) => SecretLeaseTaskResult<void>;
}>;
export type CurrentBootstrapRecipeAuthority = Readonly<{
    state: 'current-checked-in-recipe';
    repository: CanonicalRepository;
    recipeRevision: RecipeRevision;
    relativePath: CheckedInRecipeLocator;
    slots: readonly Readonly<{
        slotId: CredentialSlotId;
        environmentName: string;
    }>[];
}>;
export type VerifiedBootstrapReceiverAttempt = Readonly<{
    state: 'verified-current-attempt';
    processAttemptId: ProcessAttemptId;
    repository: CanonicalRepository;
    recipeRevision: RecipeRevision;
    grantId: GrantId;
    grantGeneration: number;
    receiverId: ReceiverId;
    bindingGeneration: number;
    receiverEntryIdentity: ReceiverEntryIdentity;
    helperParentProcessId: number;
    helperParentProcessIncarnation: ProcessIncarnation;
    recipeLocator: CheckedInRecipeLocator;
}>;
/**
 * This port must re-read the checked-in recipe selected by broker-owned
 * attempt metadata. It must not resolve a recipe path supplied by the
 * bootstrap request.
 */
export type BootstrapCurrentRecipePort = Readonly<{
    resolveCurrentRecipe: (attempt: VerifiedBootstrapReceiverAttempt) => SecretLeaseTaskResult<CurrentBootstrapRecipeAuthority>;
}>;
/**
 * This port joins the broker's durable attempt binding with the receiver's
 * current process facts. The request's receiver id and grant id are not input
 * authority. Implementations fail unless the helper's parent is the exact
 * live process represented by the journal record.
 */
export type BootstrapCurrentReceiverAttemptPort = Readonly<{
    verifyCurrentAttempt: (journaledAttempt: BootstrapAttemptJournalRecord) => SecretLeaseTaskResult<VerifiedBootstrapReceiverAttempt>;
}>;
/** Plain-result task boundary used by strict Git/recipe adapters before the privileged lift. */
export type BootstrapCurrentRecipeTaskPort = Readonly<{
    resolveCurrentRecipe: (attempt: VerifiedBootstrapReceiverAttempt) => Promise<BrokerResult<CurrentBootstrapRecipeAuthority>>;
}>;
/** Plain-result task boundary used by strict receiver/OS adapters before the privileged lift. */
export type BootstrapCurrentReceiverAttemptTaskPort = Readonly<{
    verifyCurrentAttempt: (journaledAttempt: BootstrapAttemptJournalRecord) => Promise<SecretLeaseResult<VerifiedBootstrapReceiverAttempt>>;
}>;
export type BootstrapAuthorityClock = Readonly<{
    nowMs: () => number;
}>;
/**
 * `claimAuthorized` is deliberately stronger than the generic journal
 * `create`: it atomically rejects a second nonterminal bootstrap lease for the
 * same grant generation and process attempt.
 */
export type BootstrapLeaseClaimJournal = Readonly<{
    claimAuthorized: (command: ClaimAuthorizedBootstrapLease) => JournalTaskResult<JournalMutation<LeaseJournalRecord>>;
    transition: (command: TransitionLease) => JournalTaskResult<JournalMutation<LeaseJournalRecord>>;
}>;
export type DurableBootstrapLeaseAuthorityPorts = Readonly<{
    attempts: Pick<AttemptJournal, 'read'>;
    clock: BootstrapAuthorityClock;
    grants: Pick<GrantJournal, 'readGrant'>;
    leaseLifetimeMs: number;
    leases: BootstrapLeaseClaimJournal;
    recipes: BootstrapCurrentRecipePort;
    receiverAttempts: BootstrapCurrentReceiverAttemptPort;
}>;
type BootstrapLeaseTransitionIdentity = Readonly<{
    leaseId: SecretLeaseId;
    exposureCorrelation: SecretExposureCorrelation;
    atMs: number;
}>;
export type BootstrapLeaseAuthorityTransition = BootstrapLeaseTransitionIdentity & (Readonly<{
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
export type DurableBootstrapLeaseAuthorityPort = BootstrapLeaseAuthorityPort;
export declare const BOOTSTRAP_AUTHORITY_MAX_LEASE_LIFETIME_MS = 60000;
export declare const liftBootstrapCurrentRecipeTaskPort: (port: BootstrapCurrentRecipeTaskPort) => BootstrapCurrentRecipePort;
export declare const liftBootstrapCurrentReceiverAttemptTaskPort: (port: BootstrapCurrentReceiverAttemptTaskPort) => BootstrapCurrentReceiverAttemptPort;
export declare const createDurableBootstrapLeaseAuthorityPort: (ports: DurableBootstrapLeaseAuthorityPorts) => DurableBootstrapLeaseAuthorityPort;
export declare const validateBootstrapLeaseAuthority: (request: BootstrapRequestMessage, lease: AuthorizedSecretLease) => SecretLeaseResult<AuthorizedSecretLease>;
export {};
