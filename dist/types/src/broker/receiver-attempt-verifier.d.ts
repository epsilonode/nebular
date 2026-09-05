import type { VerifiedBootstrapReceiverAttempt } from './bootstrap-authority.ts';
import { type BootstrapAttemptJournalRecord, type ProcessIncarnation, type ReceiverCorrelation, type ReceiverEntryIdentity } from './journal.ts';
import { type SecretLeaseResult } from './lease.ts';
import { type CanonicalRepository, type GrantId, type ProcessAttemptId, type ReceiverId, type RecipeRevision } from './primitives.ts';
export declare const RECEIVER_ATTEMPT_VERIFICATION_MAX_TIMEOUT_MS = 10000;
export type CurrentBrokerProcessObservation = Readonly<{
    status: 'resolved';
    processId: number;
    parentProcessId: number;
}> | Readonly<{
    status: 'unavailable';
}>;
export type CurrentBrokerProcessPort = Readonly<{
    readCurrentProcess: () => Promise<unknown>;
}>;
export type ReceiverAttemptProjectionQuery = Readonly<{
    format: 'bootstrap-receiver-attempt-query/v1';
    receiverId: ReceiverId;
    receiverEntryIdentity: ReceiverEntryIdentity;
}>;
export type StrictReceiverAttemptOwnership = Readonly<{
    processAttemptId: ProcessAttemptId;
    repository: CanonicalRepository;
    recipeRevision: RecipeRevision;
    grantId: GrantId;
    grantGeneration: number;
    bindingGeneration: number;
}>;
export type StrictReceiverAttemptFact = Readonly<{
    format: 'bootstrap-receiver-attempt-projection/v1';
    receiverId: ReceiverId;
    receiverEntryIdentity: ReceiverEntryIdentity;
    receiverCorrelation: ReceiverCorrelation;
    processId: number;
    lifecycleState: 'launching' | 'online' | 'stopping' | 'stopped' | 'errored';
    ownership: StrictReceiverAttemptOwnership;
}>;
export type ReceiverAttemptProjectionObservation = Readonly<{
    status: 'resolved';
    fact: StrictReceiverAttemptFact;
}> | Readonly<{
    status: 'missing';
}> | Readonly<{
    status: 'ambiguous';
}> | Readonly<{
    status: 'unavailable';
}>;
/**
 * Implementations must project only the fields in
 * `ReceiverAttemptProjectionObservation`. Raw PM2 process records, environment
 * objects, command arguments, or logs are never admissible values here.
 */
export type StrictReceiverAttemptProjectionPort = Readonly<{
    readStrictProjection: (query: ReceiverAttemptProjectionQuery) => Promise<unknown>;
}>;
export type ProcessIncarnationQuery = Readonly<{
    processId: number;
}>;
export type ProcessIncarnationObservation = Readonly<{
    status: 'running';
    processId: number;
    incarnation: ProcessIncarnation;
}> | Readonly<{
    status: 'missing';
    processId: number;
}> | Readonly<{
    status: 'stopped';
    processId: number;
}> | Readonly<{
    status: 'inaccessible';
    processId: number;
}> | Readonly<{
    status: 'unavailable';
    processId: number;
}>;
export type CurrentProcessIncarnationPort = Readonly<{
    readCurrentIncarnation: (query: ProcessIncarnationQuery) => Promise<unknown>;
}>;
export type BootstrapReceiverAttemptVerifierPorts = Readonly<{
    brokerProcess: CurrentBrokerProcessPort;
    processIncarnations: CurrentProcessIncarnationPort;
    receiverAttempts: StrictReceiverAttemptProjectionPort;
}>;
/**
 * Lift-ready strict verifier contract. The privileged bootstrap-authority
 * boundary performs the one-line conversion to its class-backed ResultAsync
 * port so this OS/receiver seam remains under the default hard-FP rules.
 */
export type CurrentReceiverAttemptVerificationPort = Readonly<{
    verifyCurrentAttempt: (attempt: BootstrapAttemptJournalRecord) => Promise<SecretLeaseResult<VerifiedBootstrapReceiverAttempt>>;
}>;
export type ReceiverAttemptVerificationDenialReason = 'durable-attempt-invalid' | 'broker-process-unavailable' | 'broker-process-invalid' | 'broker-parent-mismatch' | 'receiver-observation-unavailable' | 'receiver-fact-invalid' | 'receiver-fact-mismatch' | 'incarnation-observation-unavailable' | 'incarnation-fact-invalid' | 'incarnation-mismatch';
export declare const verifyCurrentReceiverAttempt: (attempt: BootstrapAttemptJournalRecord, ports: BootstrapReceiverAttemptVerifierPorts, timeoutMs: number) => Promise<SecretLeaseResult<VerifiedBootstrapReceiverAttempt>>;
export declare const createCurrentReceiverAttemptVerifier: (ports: BootstrapReceiverAttemptVerifierPorts, timeoutMs?: number) => {
    verifyCurrentAttempt: (attempt: BootstrapAttemptJournalRecord) => Promise<SecretLeaseResult<Readonly<{
        state: "verified-current-attempt";
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
        recipeLocator: import("./journal.ts").CheckedInRecipeLocator;
    }>>>;
};
export declare const createCurrentBrokerProcessPort: () => CurrentBrokerProcessPort;
