import type { ProcessAttemptId } from './primitives.ts';
export type OneShotSlotId = Readonly<{
    kind: 'one-shot-slot-id';
    value: string;
}>;
export type OneShotProcessName = Readonly<{
    kind: 'one-shot-process-name';
    value: string;
}>;
export type OneShotResult<Value, Issue> = Readonly<{
    outcome: 'success';
    value: Value;
}> | Readonly<{
    outcome: 'failure';
    issue: Issue;
}>;
export type OneShotSlotDefinition = Readonly<{
    slotId: OneShotSlotId;
    processName: OneShotProcessName;
}>;
export type OneShotSlotPool = Readonly<{
    namespace: string;
    slots: readonly OneShotSlotDefinition[];
}>;
export type OneShotObservedStatus = 'online' | 'launching' | 'stopping' | 'stopped' | 'errored' | 'unknown';
export type OneShotCleanupProof = 'confirmed' | 'unconfirmed';
/** Safe, non-secret ownership facts persisted in PM2's environment. */
export type OneShotOwnershipMetadata = Readonly<{
    slotId: OneShotSlotId;
    attemptId: ProcessAttemptId;
    metadataDigest: string;
    startedAtMs: number;
    deadlineAtMs: number;
}>;
export type OneShotAttemptHandle = Readonly<{
    slotId: OneShotSlotId;
    processName: OneShotProcessName;
    attemptId: ProcessAttemptId;
    metadataDigest: string;
    pmId: number;
}>;
export type OneShotSlotOccupant = Readonly<{
    kind: 'empty';
}> | Readonly<{
    kind: 'foreign';
    reason: 'missing-ownership-metadata' | 'invalid-ownership-metadata' | 'configuration-drift';
}> | Readonly<{
    kind: 'owned';
    pmId: number;
    pid: number | null;
    status: OneShotObservedStatus;
    /** Present only for a terminal observation of this exact PM2 incarnation. */
    exitCode?: number;
    metadata: OneShotOwnershipMetadata;
    cleanupProof: OneShotCleanupProof;
}>;
export type OneShotSlotObservation = OneShotSlotDefinition & Readonly<{
    occupant: OneShotSlotOccupant;
}>;
export type OneShotSlotConfigurationIssue = Readonly<{
    code: 'slot-namespace-invalid';
    namespace: string;
}> | Readonly<{
    code: 'slot-capacity-invalid';
    capacity: number;
}>;
export type OneShotSlotInventoryIssue = Readonly<{
    code: 'slot-inventory-missing';
    slotId: OneShotSlotId;
}> | Readonly<{
    code: 'slot-inventory-duplicate';
    slotId: OneShotSlotId;
}> | Readonly<{
    code: 'slot-inventory-unexpected';
    slotId: OneShotSlotId;
}> | Readonly<{
    code: 'slot-identity-mismatch';
    slotId: OneShotSlotId;
    expectedName: OneShotProcessName;
    observedName: OneShotProcessName;
}> | Readonly<{
    code: 'slot-metadata-mismatch';
    slotId: OneShotSlotId;
    metadataSlotId: OneShotSlotId;
}> | Readonly<{
    code: 'attempt-observed-more-than-once';
    attemptId: ProcessAttemptId;
}>;
export type OneShotSlotSummary = OneShotSlotDefinition & Readonly<{
    state: 'empty' | 'active' | 'expired-unreconciled' | 'terminal-reclaimable' | 'terminal-cleanup-unconfirmed' | 'indeterminate' | 'namespace-conflict';
    attemptId?: ProcessAttemptId;
    deadlineAtMs?: number;
}>;
export type OneShotAllocationIssue = OneShotSlotInventoryIssue | Readonly<{
    code: 'slot-namespace-conflict';
    slotId: OneShotSlotId;
    processName: OneShotProcessName;
    reason: Extract<OneShotSlotOccupant, {
        kind: 'foreign';
    }>['reason'];
}> | Readonly<{
    code: 'attempt-metadata-conflict';
    attemptId: ProcessAttemptId;
}> | Readonly<{
    code: 'attempt-retired';
    attemptId: ProcessAttemptId;
}> | Readonly<{
    code: 'slot-capacity-busy';
    slots: readonly OneShotSlotSummary[];
}>;
export type OneShotAllocationPlan = Readonly<{
    kind: 'confirm-existing';
    handle: OneShotAttemptHandle;
    startedAtMs: number;
}> | Readonly<{
    kind: 'claim-empty';
    slot: OneShotSlotDefinition;
}> | Readonly<{
    kind: 'replace-terminal';
    slot: OneShotSlotDefinition;
    retired: OneShotAttemptHandle;
}>;
export type OneShotSlotSelectionPlan = OneShotAllocationPlan;
export type OneShotAttemptIssue = OneShotSlotInventoryIssue | Readonly<{
    code: 'slot-namespace-conflict';
    slotId: OneShotSlotId;
    processName: OneShotProcessName;
    reason: Extract<OneShotSlotOccupant, {
        kind: 'foreign';
    }>['reason'];
}> | Readonly<{
    code: 'attempt-retired';
    handle: OneShotAttemptHandle;
}>;
export type OneShotReconciliationAction = Readonly<{
    kind: 'request-expired-stop';
    handle: OneShotAttemptHandle;
    deadlineAtMs: number;
}>;
export declare const sameOneShotSlotId: (left: OneShotSlotId, right: OneShotSlotId) => boolean;
export declare const sameOneShotProcessName: (left: OneShotProcessName, right: OneShotProcessName) => boolean;
export declare const createOneShotSlotPool: (namespace: string, capacity: number) => OneShotResult<OneShotSlotPool, OneShotSlotConfigurationIssue>;
export declare const validateOneShotSlotInventory: (pool: OneShotSlotPool, observations: readonly OneShotSlotObservation[]) => OneShotResult<readonly OneShotSlotObservation[], OneShotSlotInventoryIssue>;
export declare const oneShotAttemptHandle: (observation: OneShotSlotObservation) => OneShotAttemptHandle | undefined;
export declare const summarizeOneShotSlot: (observation: OneShotSlotObservation, nowMs: number) => OneShotSlotSummary;
/**
 * Selects the stable slot for an attempt without requiring slot-dependent
 * launch metadata to exist yet. The caller must finalize that metadata while
 * the same allocation lock is still held, then compare an existing handle's
 * exact digest before treating a retry as idempotent.
 */
export declare const planOneShotSlotSelection: (pool: OneShotSlotPool, observations: readonly OneShotSlotObservation[], requested: Readonly<{
    attemptId: ProcessAttemptId;
}>, nowMs: number) => OneShotResult<OneShotSlotSelectionPlan, OneShotAllocationIssue>;
export declare const planOneShotSlotAllocation: (pool: OneShotSlotPool, observations: readonly OneShotSlotObservation[], requested: Readonly<{
    attemptId: ProcessAttemptId;
    metadataDigest: string;
}>, nowMs: number) => OneShotResult<OneShotAllocationPlan, OneShotAllocationIssue>;
export declare const validateOneShotAttempt: (pool: OneShotSlotPool, observations: readonly OneShotSlotObservation[], handle: OneShotAttemptHandle) => OneShotResult<Extract<OneShotSlotOccupant, {
    kind: "owned";
}>, OneShotAttemptIssue>;
export declare const planOneShotReconciliation: (pool: OneShotSlotPool, observations: readonly OneShotSlotObservation[], nowMs: number) => OneShotResult<readonly OneShotReconciliationAction[], OneShotAllocationIssue>;
