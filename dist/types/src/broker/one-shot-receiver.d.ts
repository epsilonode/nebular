import type { ProcessAttemptId } from './primitives.ts';
import { type OneShotAllocationIssue, type OneShotAttemptHandle, type OneShotAttemptIssue, type OneShotOwnershipMetadata, type OneShotResult, type OneShotSlotDefinition, type OneShotSlotObservation, type OneShotSlotPool } from './one-shot-slots.ts';
export type AdmittedOneShotLaunch<Payload> = Readonly<{
    attemptId: ProcessAttemptId;
    metadataDigest: string;
    startedAtMs: number;
    deadlineAtMs: number;
    payload: Payload;
}>;
export type OneShotLaunchFactoryIssue = Readonly<{
    code: 'one-shot-launch-factory-failed';
    safeMessage: string;
}>;
/**
 * Pure slot-dependent finalization seam. Authority and other effects must be
 * resolved before allocation; this callback only closes the already-admitted
 * launch over the selected stable slot and computes its exact digest.
 */
export type SlotAwareOneShotLaunchRequest = Readonly<{
    attemptId: ProcessAttemptId;
    observedAtMs: number;
}>;
export type SlotAwareOneShotLaunchFactory<Payload> = Readonly<{
    finalizeForSlot: (slot: OneShotSlotDefinition) => OneShotResult<AdmittedOneShotLaunch<Payload>, OneShotLaunchFactoryIssue>;
}>;
export type ExactOneShotStart<Payload> = Readonly<{
    slot: OneShotSlotDefinition;
    metadata: OneShotOwnershipMetadata;
    payload: Payload;
    autorestart: false;
}>;
export type OneShotReceiverPortIssue = Readonly<{
    code: 'allocation-lock-unavailable' | 'pm2-receiver-unavailable' | 'pm2-operation-failed';
    operation: 'probe' | 'lock' | 'observe' | 'start-exact' | 'stop-exact' | 'delete-exact';
    safeMessage: string;
    detail?: 'bootstrap-artifact-plan' | 'bootstrap-job-pending' | 'bootstrap-job-name-missing' | 'bootstrap-job-empty' | 'bootstrap-job-unavailable' | 'bootstrap-job-multiple' | 'bootstrap-job-policy' | 'bootstrap-process-incarnation' | 'bootstrap-job-membership' | 'bootstrap-journal-bind';
}>;
export type OneShotReceiverIssue = OneShotReceiverPortIssue | OneShotLaunchAllocationIssue | OneShotLaunchFactoryIssue | OneShotAllocationIssue | OneShotAttemptIssue | Readonly<{
    code: 'one-shot-launch-invalid';
}> | Readonly<{
    code: 'slot-precondition-changed';
    slot: OneShotSlotDefinition;
}> | Readonly<{
    code: 'one-shot-start-unconfirmed';
    slot: OneShotSlotDefinition;
    attemptId: ProcessAttemptId;
}> | Readonly<{
    code: 'one-shot-stop-precondition-changed';
    handle: OneShotAttemptHandle;
}>;
export type OneShotStartOutcome = Readonly<{
    outcome: 'started' | 'already-started';
    handle: OneShotAttemptHandle;
    startedAtMs: number;
    /**
     * PM2 5.4.3 has no working stopped-prepare/start transition: autostart=false
     * remains stopped when startProcessId re-enters God.executeApp. The launch is
     * therefore atomic and this fact makes the residual post-launch binding
     * window explicit for immediate finalization or cooperative not-ready retry.
     */
    binding: Readonly<{
        status: 'finalization-required';
        processId: number;
    }> | Readonly<{
        status: 'cooperative-bootstrap-not-ready';
    }>;
}>;
export type OneShotLaunchReservation = Readonly<{
    state: 'launch-reserved';
    slot: OneShotSlotDefinition;
    metadata: OneShotOwnershipMetadata;
}>;
export type OneShotLaunchAllocationIssue = Readonly<{
    code: 'launch-allocation-failed';
    safeMessage: string;
}>;
export type OneShotLaunchAllocationPort = Readonly<{
    /** Durable launch reservation; called before atomic PM2 start while the cross-process lock is held. */
    allocateLaunch: (reservation: OneShotLaunchReservation) => Promise<OneShotResult<void, OneShotLaunchAllocationIssue>>;
}>;
export type OneShotCleanupReceipt = Readonly<{
    format: 'one-shot-tree-cleanup/v1';
    handle: OneShotAttemptHandle;
    proof: 'confirmed';
}>;
export type OneShotStopOutcome = Readonly<{
    handle: OneShotAttemptHandle;
    state: 'stop-requested' | 'terminal-cleanup-confirmed' | 'terminal-cleanup-unconfirmed';
    cleanupReceipt?: OneShotCleanupReceipt;
}>;
export type ExactNameOneShotPorts<Payload> = Readonly<{
    probe: () => Promise<OneShotResult<void, OneShotReceiverPortIssue>>;
    /** Must serialize across broker processes and enforce its own bounded acquisition deadline. */
    withAllocationLock: <Value>(namespace: string, work: () => Promise<OneShotResult<Value, OneShotReceiverIssue>>) => Promise<OneShotResult<Value, OneShotReceiverIssue>>;
    observe: (pool: OneShotSlotPool) => Promise<OneShotResult<readonly OneShotSlotObservation[], OneShotReceiverPortIssue>>;
    startExact: (request: ExactOneShotStart<Payload>) => Promise<OneShotResult<void, OneShotReceiverPortIssue>>;
    stopExact: (handle: OneShotAttemptHandle) => Promise<OneShotResult<void, OneShotReceiverPortIssue>>;
    deleteExact: (handle: OneShotAttemptHandle, receipt: OneShotCleanupReceipt) => Promise<OneShotResult<void, OneShotReceiverPortIssue>>;
}>;
export declare const ONE_SHOT_START_CONFIRMATION_ATTEMPTS = 5;
export declare const ONE_SHOT_START_CONFIRMATION_INTERVAL_MS = 50;
export declare const allocateSlotAwareOneShotAttempt: <Payload>(pool: OneShotSlotPool, request: SlotAwareOneShotLaunchRequest, factory: SlotAwareOneShotLaunchFactory<Payload>, ports: ExactNameOneShotPorts<Payload>, allocation: OneShotLaunchAllocationPort) => Promise<OneShotResult<OneShotStartOutcome, OneShotReceiverIssue>>;
export declare const allocateOneShotAttempt: <Payload>(pool: OneShotSlotPool, launch: AdmittedOneShotLaunch<Payload>, ports: ExactNameOneShotPorts<Payload>, allocation: OneShotLaunchAllocationPort) => Promise<OneShotResult<OneShotStartOutcome, OneShotReceiverIssue>>;
export declare const requestOneShotCancellation: <Payload>(pool: OneShotSlotPool, handle: OneShotAttemptHandle, ports: ExactNameOneShotPorts<Payload>) => Promise<OneShotResult<OneShotStopOutcome, OneShotReceiverIssue>>;
export declare const reconcileOneShotAttempts: <Payload>(pool: OneShotSlotPool, nowMs: number, ports: ExactNameOneShotPorts<Payload>) => Promise<OneShotResult<readonly OneShotStopOutcome[], OneShotReceiverIssue>>;
