import type {
  CanonicalRepository,
  CleanupId,
  CredentialSlotId,
  OutputCursor,
  ProcessAttemptId,
  ReceiverHandle,
  ReceiverId,
  ReceiverPlanId,
  ReceiverVersion,
  RecipeRevision
} from './primitives.ts';
import { brokerErr, brokerOk, type BrokerResult, type BrokerTaskResult } from './result.ts';

export type ProcessLifecycleClass = 'one-shot' | 'foreground' | 'long-lived' | 'service' | 'observe-only';

export type ReceiverCapability =
  | 'exact-cancellation'
  | 'exact-tree-cleanup'
  | 'long-lived-reconciliation'
  | 'output-cursors'
  | 'readiness-probes'
  | 'restart-control';

export type ReadinessPolicy =
  | Readonly<{ mode: 'none' }>
  | Readonly<{ mode: 'receiver-fact'; deadlineMs: number; stableSuccesses: number }>;

export type ProgressPolicy =
  | Readonly<{ mode: 'bounded-quiet'; maximumQuietMs: number }>
  | Readonly<{ mode: 'output-or-heartbeat'; stallAfterMs: number }>;

export type RestartPolicy =
  | Readonly<{ mode: 'never' }>
  | Readonly<{ mode: 'bounded'; maximumRestarts: number; windowMs: number }>;

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

export type ReceiverPreflightOutcome =
  | Readonly<{ outcome: 'ready'; receiver: ReceiverDescriptor }>
  | Readonly<{ outcome: 'unavailable'; remediation: string }>
  | Readonly<{ outcome: 'incompatible'; missingCapabilities: readonly ReceiverCapability[]; remediation: string }>
  | Readonly<{ outcome: 'namespace-conflict'; conflictingName: string; remediation: string }>;

export type ReceiverStartOutcome =
  | Readonly<{ outcome: 'started'; handle: ReceiverHandle; startedAtMs: number }>
  | Readonly<{ outcome: 'already-started'; handle: ReceiverHandle; startedAtMs: number }>;

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

export type UniversalProcessState =
  | 'planned'
  | 'admitted'
  | 'materializing'
  | 'starting'
  | 'running'
  | 'ready'
  | 'quiet-allowed'
  | 'degraded'
  | 'stalled'
  | 'cancellation-requested'
  | 'stopping'
  | 'stopped'
  | 'succeeded'
  | 'failed'
  | 'timed-out'
  | 'orphaned'
  | 'recovery-required';

export type ProcessNextAction =
  | Readonly<{ action: 'poll'; afterSequence: number }>
  | Readonly<{ action: 'cancel'; attemptId: ProcessAttemptId }>
  | Readonly<{ action: 'inspect-output'; stdoutCursor?: OutputCursor; stderrCursor?: OutputCursor }>
  | Readonly<{ action: 'reconcile'; attemptId: ProcessAttemptId }>
  | Readonly<{ action: 'repair-receiver' }>
  | Readonly<{ action: 'none' }>;

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

const positiveInteger = (value: number): boolean => Number.isSafeInteger(value) && value > 0;

const unique = <T>(values: readonly T[]): boolean => new Set(values).size === values.length;

const validatePolicy = (plan: ProcessPlan): BrokerResult<ProcessPlan> => {
  const hardDeadlineRequired = plan.lifecycle === 'one-shot' || plan.lifecycle === 'foreground';
  const hardDeadlineValid = plan.policy.hardRuntimeDeadlineMs === undefined
    ? !hardDeadlineRequired
    : positiveInteger(plan.policy.hardRuntimeDeadlineMs);
  const readinessValid = plan.policy.readiness.mode === 'none' ||
    (positiveInteger(plan.policy.readiness.deadlineMs) && positiveInteger(plan.policy.readiness.stableSuccesses));
  const progressValid = plan.policy.progress.mode === 'bounded-quiet'
    ? positiveInteger(plan.policy.progress.maximumQuietMs)
    : positiveInteger(plan.policy.progress.stallAfterMs);
  const restartValid = plan.policy.restart.mode === 'never' ||
    (positiveInteger(plan.policy.restart.maximumRestarts) && positiveInteger(plan.policy.restart.windowMs));
  return positiveInteger(plan.policy.startupDeadlineMs) && hardDeadlineValid && readinessValid && progressValid &&
    positiveInteger(plan.policy.outputRetentionBytes) && positiveInteger(plan.policy.cancellationGraceMs) &&
    positiveInteger(plan.policy.forcedCleanupDeadlineMs) && restartValid
    ? brokerOk(plan)
    : brokerErr({ code: 'process-plan-invalid', message: 'Process policy is incomplete or unbounded.' });
};

export const validateProcessPlan = (plan: ProcessPlan): BrokerResult<ProcessPlan> => {
  const environmentNamesValid = unique(plan.nonsecretEnvironmentNames) &&
    plan.nonsecretEnvironmentNames.every(name => /^[A-Za-z_][A-Za-z0-9_]*$/.test(name));
  const planShapeValid = Number.isSafeInteger(plan.plannedAtMs) && plan.plannedAtMs >= 0 &&
    plan.argv.length > 0 && plan.argv.every(atom => atom.length > 0 && !atom.includes('\0')) &&
    plan.cwd.length > 0 && !plan.cwd.includes('\0') && unique(plan.credentialSlotIds) && unique(plan.requiredCapabilities);
  return planShapeValid && environmentNamesValid
    ? validatePolicy(plan)
    : brokerErr({ code: 'process-plan-invalid', message: 'Process plan contains invalid or ambiguous execution data.' });
};

export const admitProcessPlan = (
  plan: ProcessPlan,
  receiver: ReceiverDescriptor
): BrokerResult<AdmittedProcessPlan> =>
  validateProcessPlan(plan).andThen(validPlan => {
    const missing: readonly ReceiverCapability[] = validPlan.requiredCapabilities
      .filter(capability => !receiver.capabilities.includes(capability));
    return missing.length === 0
      ? brokerOk({ plan: validPlan, receiver })
      : brokerErr({ code: 'receiver-incompatible', message: `Receiver lacks ${missing.join(', ')}.` });
  });

const terminalObservation = (
  admitted: AdmittedProcessPlan,
  snapshot: ReceiverSnapshot,
  state: UniversalProcessState
): ProcessObservation => ({
  attemptId: snapshot.attemptId,
  receiverId: admitted.receiver.id,
  state,
  sequence: snapshot.sequence,
  healthy: state === 'succeeded' || state === 'stopped',
  progressing: false,
  cleanup: snapshot.cleanup,
  nextActions: snapshot.cleanup === 'partial'
    ? [{ action: 'reconcile', attemptId: snapshot.attemptId }]
    : [{ action: 'none' }]
});

const activeObservation = (
  admitted: AdmittedProcessPlan,
  snapshot: ReceiverSnapshot,
  state: UniversalProcessState,
  progressing: boolean
): ProcessObservation => ({
  attemptId: snapshot.attemptId,
  receiverId: admitted.receiver.id,
  state,
  sequence: snapshot.sequence,
  healthy: state === 'running' || state === 'ready' || state === 'quiet-allowed',
  progressing,
  cleanup: snapshot.cleanup,
  nextActions: [
    { action: 'poll', afterSequence: snapshot.sequence },
    {
      action: 'inspect-output',
      ...(snapshot.stdoutCursor === undefined ? {} : { stdoutCursor: snapshot.stdoutCursor }),
      ...(snapshot.stderrCursor === undefined ? {} : { stderrCursor: snapshot.stderrCursor })
    },
    { action: 'cancel', attemptId: snapshot.attemptId }
  ]
});

const progressState = (
  admitted: AdmittedProcessPlan,
  snapshot: ReceiverSnapshot,
  nowMs: number
): ProcessObservation => {
  const lastProgressAtMs = snapshot.lastProgressAtMs ?? snapshot.startedAtMs ?? nowMs;
  const quietForMs = Math.max(0, nowMs - lastProgressAtMs);
  if (admitted.plan.policy.progress.mode === 'bounded-quiet') {
    return quietForMs <= admitted.plan.policy.progress.maximumQuietMs
      ? activeObservation(admitted, snapshot, snapshot.readyAtMs === undefined ? 'quiet-allowed' : 'ready', false)
      : activeObservation(admitted, snapshot, 'stalled', false);
  }
  return quietForMs < admitted.plan.policy.progress.stallAfterMs
    ? activeObservation(admitted, snapshot, snapshot.readyAtMs === undefined ? 'running' : 'ready', true)
    : activeObservation(admitted, snapshot, 'stalled', false);
};

export const observeProcess = (
  admitted: AdmittedProcessPlan,
  snapshot: ReceiverSnapshot,
  nowMs: number
): BrokerResult<ProcessObservation> => {
  if (snapshot.attemptId !== admitted.plan.attemptId || snapshot.sequence < 0 || snapshot.observedAtMs > nowMs) {
    return brokerErr({ code: 'process-state-invalid', message: 'Receiver snapshot identity or time is invalid.' });
  }
  if (snapshot.cleanup === 'partial') return brokerOk(terminalObservation(admitted, snapshot, 'recovery-required'));
  if (snapshot.backendState === 'missing') return brokerOk(terminalObservation(admitted, snapshot, 'orphaned'));
  if (snapshot.backendState === 'errored') return brokerOk(terminalObservation(admitted, snapshot, 'failed'));
  if (snapshot.backendState === 'stopped') {
    return brokerOk(terminalObservation(admitted, snapshot, snapshot.exitCode === 0 ? 'succeeded' : 'stopped'));
  }
  if (snapshot.backendState === 'stopping') return brokerOk(activeObservation(admitted, snapshot, 'stopping', false));
  const startedAtMs = snapshot.startedAtMs;
  if (startedAtMs === undefined) {
    return nowMs >= admitted.plan.plannedAtMs + admitted.plan.policy.startupDeadlineMs
      ? brokerOk(terminalObservation(admitted, snapshot, 'timed-out'))
      : brokerOk(activeObservation(admitted, snapshot, snapshot.backendState === 'materialized' ? 'materializing' : 'starting', true));
  }
  const hardDeadline = admitted.plan.policy.hardRuntimeDeadlineMs;
  if (hardDeadline !== undefined && nowMs >= startedAtMs + hardDeadline) {
    return brokerOk(terminalObservation(admitted, snapshot, 'timed-out'));
  }
  const readiness = admitted.plan.policy.readiness;
  if (readiness.mode === 'receiver-fact' && snapshot.readyAtMs === undefined && nowMs >= startedAtMs + readiness.deadlineMs) {
    return brokerOk(terminalObservation(admitted, snapshot, 'timed-out'));
  }
  return brokerOk(progressState(admitted, snapshot, nowMs));
};
