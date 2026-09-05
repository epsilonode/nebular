import type { CanonicalRepository, CleanupId, CredentialSlotId, OutputCursor, ProcessAttemptId, ReceiverHandle, ReceiverId, ReceiverPlanId, ReceiverVersion, RecipeRevision } from './primitives.ts';
import { type BrokerResult, type BrokerTaskResult } from './result.ts';
export type ProcessLifecycleClass = 'one-shot' | 'foreground' | 'long-lived' | 'service' | 'observe-only';
export type ReceiverCapability = 'exact-cancellation' | 'exact-tree-cleanup' | 'long-lived-reconciliation' | 'output-cursors' | 'readiness-probes' | 'restart-control';
export type ReadinessPolicy = Readonly<{
    mode: 'none';
}> | Readonly<{
    mode: 'receiver-fact';
    deadlineMs: number;
    stableSuccesses: number;
}>;
export type ProgressPolicy = Readonly<{
    mode: 'bounded-quiet';
    maximumQuietMs: number;
}> | Readonly<{
    mode: 'output-or-heartbeat';
    stallAfterMs: number;
}>;
export type RestartPolicy = Readonly<{
    mode: 'never';
}> | Readonly<{
    mode: 'bounded';
    maximumRestarts: number;
    windowMs: number;
}>;
export type ProcessPolicy = Readonly<{
    startupDeadlineMs: number;
    hardRuntimeDeadlineMs?: number;
    readiness: ReadinessPolicy;
    progress: ProgressPolicy;
    outputRetentionBytes: number;
    cancellationGraceMs: number;
    forcedCleanupDeadlineMs: number;
    restart: RestartPolicy;
}>;
export type ProcessPlan = Readonly<{
    id: ReceiverPlanId;
    attemptId: ProcessAttemptId;
    repository: CanonicalRepository;
    recipeRevision: RecipeRevision;
    plannedAtMs: number;
    lifecycle: ProcessLifecycleClass;
    cwd: string;
    argv: readonly [string, ...string[]];
    nonsecretEnvironmentNames: readonly string[];
    credentialSlotIds: readonly CredentialSlotId[];
    requiredCapabilities: readonly ReceiverCapability[];
    policy: ProcessPolicy;
}>;
export type ReceiverDescriptor = Readonly<{
    id: ReceiverId;
    version: ReceiverVersion;
    capabilities: readonly ReceiverCapability[];
}>;
export type AdmittedProcessPlan = Readonly<{
    plan: ProcessPlan;
    receiver: ReceiverDescriptor;
}>;
export type MaterializedProcess = Readonly<{
    admitted: AdmittedProcessPlan;
    handle: ReceiverHandle;
}>;
export type ReceiverPreflightOutcome = Readonly<{
    outcome: 'ready';
    receiver: ReceiverDescriptor;
}> | Readonly<{
    outcome: 'unavailable';
    remediation: string;
}> | Readonly<{
    outcome: 'incompatible';
    missingCapabilities: readonly ReceiverCapability[];
    remediation: string;
}> | Readonly<{
    outcome: 'namespace-conflict';
    conflictingName: string;
    remediation: string;
}>;
export type ReceiverStartOutcome = Readonly<{
    outcome: 'started';
    handle: ReceiverHandle;
    startedAtMs: number;
}> | Readonly<{
    outcome: 'already-started';
    handle: ReceiverHandle;
    startedAtMs: number;
}>;
export type ReceiverBackendState = 'materialized' | 'starting' | 'online' | 'stopping' | 'stopped' | 'errored' | 'missing';
export type ReceiverSnapshot = Readonly<{
    attemptId: ProcessAttemptId;
    handle: ReceiverHandle;
    backendState: ReceiverBackendState;
    sequence: number;
    observedAtMs: number;
    startedAtMs?: number;
    readyAtMs?: number;
    lastProgressAtMs?: number;
    restartCount: number;
    stdoutCursor?: OutputCursor;
    stderrCursor?: OutputCursor;
    exitCode?: number;
    cleanup: 'not-required' | 'pending' | 'complete' | 'partial';
}>;
export type UniversalProcessState = 'planned' | 'admitted' | 'materializing' | 'starting' | 'running' | 'ready' | 'quiet-allowed' | 'degraded' | 'stalled' | 'cancellation-requested' | 'stopping' | 'stopped' | 'succeeded' | 'failed' | 'timed-out' | 'orphaned' | 'recovery-required';
export type ProcessNextAction = Readonly<{
    action: 'poll';
    afterSequence: number;
}> | Readonly<{
    action: 'cancel';
    attemptId: ProcessAttemptId;
}> | Readonly<{
    action: 'inspect-output';
    stdoutCursor?: OutputCursor;
    stderrCursor?: OutputCursor;
}> | Readonly<{
    action: 'reconcile';
    attemptId: ProcessAttemptId;
}> | Readonly<{
    action: 'repair-receiver';
}> | Readonly<{
    action: 'none';
}>;
export type ProcessObservation = Readonly<{
    attemptId: ProcessAttemptId;
    receiverId: ReceiverId;
    state: UniversalProcessState;
    sequence: number;
    healthy: boolean;
    progressing: boolean;
    cleanup: ReceiverSnapshot['cleanup'];
    nextActions: readonly ProcessNextAction[];
}>;
export type ReceiverPreflight = Readonly<{
    preflight: (plan: ProcessPlan) => BrokerTaskResult<ReceiverPreflightOutcome>;
}>;
export type ReceiverMaterialize = Readonly<{
    materialize: (plan: AdmittedProcessPlan) => BrokerTaskResult<MaterializedProcess>;
}>;
export type ReceiverStart = Readonly<{
    start: (process: MaterializedProcess) => BrokerTaskResult<ReceiverStartOutcome>;
}>;
export type ReceiverInspect = Readonly<{
    inspect: (process: MaterializedProcess) => BrokerTaskResult<ReceiverSnapshot>;
}>;
export type ReceiverCancel = Readonly<{
    cancel: (process: MaterializedProcess, expectedSequence: number) => BrokerTaskResult<ReceiverSnapshot>;
}>;
export type ReceiverDelete = Readonly<{
    delete: (process: MaterializedProcess, cleanupId: CleanupId) => BrokerTaskResult<ReceiverSnapshot>;
}>;
export type ReceiverSession = ReceiverPreflight & ReceiverMaterialize & ReceiverStart & ReceiverInspect & ReceiverCancel & ReceiverDelete;
export declare const validateProcessPlan: (plan: ProcessPlan) => BrokerResult<ProcessPlan>;
export declare const admitProcessPlan: (plan: ProcessPlan, receiver: ReceiverDescriptor) => BrokerResult<AdmittedProcessPlan>;
export declare const observeProcess: (admitted: AdmittedProcessPlan, snapshot: ReceiverSnapshot, nowMs: number) => BrokerResult<ProcessObservation>;
