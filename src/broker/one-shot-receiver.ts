import { setTimeout as delay } from 'node:timers/promises';

import type { ProcessAttemptId } from './primitives.ts';
import {
  oneShotAttemptHandle,
  planOneShotReconciliation,
  planOneShotSlotAllocation,
  planOneShotSlotSelection,
  sameOneShotProcessName,
  sameOneShotSlotId,
  validateOneShotAttempt,
  type OneShotAllocationIssue,
  type OneShotAttemptHandle,
  type OneShotAttemptIssue,
  type OneShotOwnershipMetadata,
  type OneShotResult,
  type OneShotSlotDefinition,
  type OneShotSlotObservation,
  type OneShotSlotPool,
  type OneShotSlotSelectionPlan
} from './one-shot-slots.ts';

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
  finalizeForSlot: (
    slot: OneShotSlotDefinition
  ) => OneShotResult<AdmittedOneShotLaunch<Payload>, OneShotLaunchFactoryIssue>;
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
  detail?:
    | 'bootstrap-artifact-plan'
    | 'bootstrap-job-pending'
    | 'bootstrap-job-name-missing'
    | 'bootstrap-job-empty'
    | 'bootstrap-job-unavailable'
    | 'bootstrap-job-multiple'
    | 'bootstrap-job-policy'
    | 'bootstrap-process-incarnation'
    | 'bootstrap-job-membership'
    | 'bootstrap-journal-bind';
}>;

export type OneShotReceiverIssue =
  | OneShotReceiverPortIssue
  | OneShotLaunchAllocationIssue
  | OneShotLaunchFactoryIssue
  | OneShotAllocationIssue
  | OneShotAttemptIssue
  | Readonly<{ code: 'one-shot-launch-invalid' }>
  | Readonly<{ code: 'slot-precondition-changed'; slot: OneShotSlotDefinition }>
  | Readonly<{
      code: 'one-shot-start-unconfirmed';
      slot: OneShotSlotDefinition;
      attemptId: ProcessAttemptId;
    }>
  | Readonly<{ code: 'one-shot-stop-precondition-changed'; handle: OneShotAttemptHandle }>;

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
  binding:
    | Readonly<{ status: 'finalization-required'; processId: number }>
    | Readonly<{ status: 'cooperative-bootstrap-not-ready' }>;
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
  allocateLaunch: (
    reservation: OneShotLaunchReservation
  ) => Promise<OneShotResult<void, OneShotLaunchAllocationIssue>>;
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
  withAllocationLock: <Value>(
    namespace: string,
    work: () => Promise<OneShotResult<Value, OneShotReceiverIssue>>
  ) => Promise<OneShotResult<Value, OneShotReceiverIssue>>;
  observe: (
    pool: OneShotSlotPool
  ) => Promise<OneShotResult<readonly OneShotSlotObservation[], OneShotReceiverPortIssue>>;
  startExact: (
    request: ExactOneShotStart<Payload>
  ) => Promise<OneShotResult<void, OneShotReceiverPortIssue>>;
  stopExact: (
    handle: OneShotAttemptHandle
  ) => Promise<OneShotResult<void, OneShotReceiverPortIssue>>;
  deleteExact: (
    handle: OneShotAttemptHandle,
    receipt: OneShotCleanupReceipt
  ) => Promise<OneShotResult<void, OneShotReceiverPortIssue>>;
}>;

export const ONE_SHOT_START_CONFIRMATION_ATTEMPTS = 5;
export const ONE_SHOT_START_CONFIRMATION_INTERVAL_MS = 50;

const success = <Value, Issue = never>(value: Value): OneShotResult<Value, Issue> => ({ outcome: 'success', value });
const failure = <Value = never, Issue = never>(issue: Issue): OneShotResult<Value, Issue> => ({
  outcome: 'failure',
  issue
});

const rejectedPort = (
  operation: OneShotReceiverPortIssue['operation'],
  code: OneShotReceiverPortIssue['code'] = 'pm2-operation-failed'
): OneShotReceiverPortIssue => ({
  code,
  operation,
  safeMessage: 'The exact-name receiver capability failed closed.'
});

const probeReceiver = <Payload>(
  ports: ExactNameOneShotPorts<Payload>
): Promise<OneShotResult<void, OneShotReceiverPortIssue>> => Promise.resolve().then(() => ports.probe()).then(
  result => result,
  () => failure(rejectedPort('probe', 'pm2-receiver-unavailable'))
);

const underAllocationLock = <Payload, Value>(
  pool: OneShotSlotPool,
  ports: ExactNameOneShotPorts<Payload>,
  work: () => Promise<OneShotResult<Value, OneShotReceiverIssue>>
): Promise<OneShotResult<Value, OneShotReceiverIssue>> => Promise.resolve()
  .then(() => ports.withAllocationLock(pool.namespace, work)).then(
    result => result,
    () => failure(rejectedPort('lock', 'allocation-lock-unavailable'))
  );

const launchAllocationFailed = (): OneShotLaunchAllocationIssue => ({
  code: 'launch-allocation-failed',
  safeMessage: 'The durable launch reservation failed closed.'
});

const launchFactoryFailed = (): OneShotLaunchFactoryIssue => ({
  code: 'one-shot-launch-factory-failed',
  safeMessage: 'The slot-aware launch finalizer failed closed.'
});

const validAttemptId = (attemptId: ProcessAttemptId): boolean =>
  /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(attemptId);

const validLaunch = <Payload>(launch: AdmittedOneShotLaunch<Payload>): boolean =>
  validAttemptId(launch.attemptId) && /^[a-f0-9]{64}$/u.test(launch.metadataDigest) &&
  Number.isSafeInteger(launch.startedAtMs) &&
  launch.startedAtMs >= 0 && Number.isSafeInteger(launch.deadlineAtMs) && launch.deadlineAtMs > launch.startedAtMs;

const validSlotAwareRequest = (request: SlotAwareOneShotLaunchRequest): boolean =>
  validAttemptId(request.attemptId) && Number.isSafeInteger(request.observedAtMs) && request.observedAtMs >= 0;

const metadataFor = <Payload>(
  slot: OneShotSlotDefinition,
  launch: AdmittedOneShotLaunch<Payload>
): OneShotOwnershipMetadata => ({
  slotId: slot.slotId,
  attemptId: launch.attemptId,
  metadataDigest: launch.metadataDigest,
  startedAtMs: launch.startedAtMs,
  deadlineAtMs: launch.deadlineAtMs
});

const bindingFromObservation = (
  observation: OneShotSlotObservation | undefined
): OneShotStartOutcome['binding'] => observation?.occupant.kind === 'owned' &&
  observation.occupant.pid !== null && observation.occupant.pid > 0
  ? { status: 'finalization-required', processId: observation.occupant.pid }
  : { status: 'cooperative-bootstrap-not-ready' };

const confirmStarted = (
  pool: OneShotSlotPool,
  slot: OneShotSlotDefinition,
  launch: AdmittedOneShotLaunch<unknown>,
  observations: readonly OneShotSlotObservation[]
): OneShotResult<Readonly<{ handle: OneShotAttemptHandle; processId: number | null }>, OneShotReceiverIssue> => {
  const observation = observations.find(candidate => sameOneShotSlotId(candidate.slotId, slot.slotId));
  if (observation?.occupant.kind !== 'owned' || !sameOneShotProcessName(observation.processName, slot.processName) ||
      observation.occupant.metadata.attemptId !== launch.attemptId ||
      observation.occupant.metadata.metadataDigest !== launch.metadataDigest ||
      (observation.occupant.status !== 'online' && observation.occupant.status !== 'launching')) {
    return failure({ code: 'one-shot-start-unconfirmed', slot, attemptId: launch.attemptId });
  }
  const handle = oneShotAttemptHandle(observation);
  return handle === undefined || validateOneShotAttempt(pool, observations, handle).outcome === 'failure'
    ? failure({ code: 'one-shot-start-unconfirmed', slot, attemptId: launch.attemptId })
    : success({ handle, processId: observation.occupant.pid });
};

const observeAfterStart = <Payload>(
  pool: OneShotSlotPool,
  slot: OneShotSlotDefinition,
  launch: AdmittedOneShotLaunch<Payload>,
  ports: ExactNameOneShotPorts<Payload>,
  startResult: OneShotResult<void, OneShotReceiverPortIssue>
): Promise<OneShotResult<OneShotStartOutcome, OneShotReceiverIssue>> => {
  const observeConfirmation = (
    attemptsRemaining: number
  ): Promise<ReturnType<typeof confirmStarted>> => ports.observe(pool).then(observed => {
    const confirmed = observed.outcome === 'failure'
      ? observed
      : confirmStarted(pool, slot, launch, observed.value);
    return confirmed.outcome === 'failure' && attemptsRemaining > 1
      ? delay(ONE_SHOT_START_CONFIRMATION_INTERVAL_MS).then(() => observeConfirmation(attemptsRemaining - 1))
      : confirmed;
  });
  return observeConfirmation(ONE_SHOT_START_CONFIRMATION_ATTEMPTS).then(confirmed => {
    if (confirmed.outcome === 'failure') return startResult.outcome === 'failure' ? startResult : confirmed;
  return success({
    outcome: startResult.outcome === 'success' ? 'started' : 'already-started',
    handle: confirmed.value.handle,
    startedAtMs: launch.startedAtMs,
    binding: confirmed.value.processId !== null && confirmed.value.processId > 0
      ? { status: 'finalization-required', processId: confirmed.value.processId }
      : { status: 'cooperative-bootstrap-not-ready' }
  });
  });
};

const startAndConfirm = <Payload>(
  pool: OneShotSlotPool,
  slot: OneShotSlotDefinition,
  launch: AdmittedOneShotLaunch<Payload>,
  ports: ExactNameOneShotPorts<Payload>,
  allocation: OneShotLaunchAllocationPort
): Promise<OneShotResult<OneShotStartOutcome, OneShotReceiverIssue>> => {
  const request: ExactOneShotStart<Payload> = {
    slot,
    metadata: metadataFor(slot, launch),
    payload: launch.payload,
    autorestart: false
  };
  return Promise.resolve().then(() => allocation.allocateLaunch({
    state: 'launch-reserved',
    slot,
    metadata: request.metadata
  })).then(
    result => result,
    () => failure(launchAllocationFailed())
  )
    .then(allocated => allocated.outcome === 'failure'
      ? allocated
      : ports.startExact(request).then(result => observeAfterStart(pool, slot, launch, ports, result)));
};

const confirmEmpty = (
  pool: OneShotSlotPool,
  slot: OneShotSlotDefinition,
  observations: readonly OneShotSlotObservation[]
): OneShotResult<void, OneShotReceiverIssue> => {
  const observed = observations.find(candidate => sameOneShotSlotId(candidate.slotId, slot.slotId));
  return observed !== undefined && sameOneShotProcessName(observed.processName, slot.processName) &&
    observed.occupant.kind === 'empty'
    ? success(undefined)
    : failure({ code: 'slot-precondition-changed', slot });
};

const cleanupReceipt = (handle: OneShotAttemptHandle): OneShotCleanupReceipt => ({
  format: 'one-shot-tree-cleanup/v1',
  handle,
  proof: 'confirmed'
});

const terminalCleanupOutcome = (
  handle: OneShotAttemptHandle,
  occupant: Extract<OneShotSlotObservation['occupant'], { kind: 'owned' }>
): OneShotStopOutcome | undefined => {
  if (occupant.status !== 'stopped' && occupant.status !== 'errored') return undefined;
  return occupant.cleanupProof === 'confirmed'
    ? {
        handle,
        state: 'terminal-cleanup-confirmed',
        cleanupReceipt: cleanupReceipt(handle)
      }
    : { handle, state: 'terminal-cleanup-unconfirmed' };
};

const deleteRetired = <Payload>(
  pool: OneShotSlotPool,
  slot: OneShotSlotDefinition,
  retired: OneShotAttemptHandle,
  ports: ExactNameOneShotPorts<Payload>
): Promise<OneShotResult<void, OneShotReceiverIssue>> => ports.deleteExact(retired, cleanupReceipt(retired))
  .then(deleted => deleted.outcome === 'failure'
    ? deleted
    : ports.observe(pool).then(observed => observed.outcome === 'failure'
      ? observed
      : confirmEmpty(pool, slot, observed.value)));

const allocateUnderLock = <Payload>(
  pool: OneShotSlotPool,
  launch: AdmittedOneShotLaunch<Payload>,
  ports: ExactNameOneShotPorts<Payload>,
  allocation: OneShotLaunchAllocationPort
): Promise<OneShotResult<OneShotStartOutcome, OneShotReceiverIssue>> =>
  ports.observe(pool).then(observed => {
  if (observed.outcome === 'failure') return observed;
  const plan = planOneShotSlotAllocation(pool, observed.value, launch, launch.startedAtMs);
  if (plan.outcome === 'failure') return plan;
  if (plan.value.kind === 'confirm-existing') {
    const existing = plan.value;
    return success({
      outcome: 'already-started',
      handle: existing.handle,
      startedAtMs: existing.startedAtMs,
      binding: bindingFromObservation(observed.value.find(candidate =>
        sameOneShotSlotId(candidate.slotId, existing.handle.slotId)))
    });
  }
  if (plan.value.kind === 'claim-empty') return startAndConfirm(pool, plan.value.slot, launch, ports, allocation);
  const replacement = plan.value;
  return deleteRetired(pool, replacement.slot, replacement.retired, ports).then(deleted =>
    deleted.outcome === 'failure'
      ? deleted
      : startAndConfirm(pool, replacement.slot, launch, ports, allocation));
});

const slotForSelection = (selection: OneShotSlotSelectionPlan): OneShotSlotDefinition =>
  selection.kind === 'confirm-existing'
    ? { slotId: selection.handle.slotId, processName: selection.handle.processName }
    : selection.slot;

const finalizeSlotAwareLaunch = <Payload>(
  request: SlotAwareOneShotLaunchRequest,
  factory: SlotAwareOneShotLaunchFactory<Payload>,
  slot: OneShotSlotDefinition
): Promise<OneShotResult<AdmittedOneShotLaunch<Payload>, OneShotReceiverIssue>> => Promise.resolve()
  .then(() => factory.finalizeForSlot(slot))
  .then(
    finalized => finalized.outcome === 'failure'
      ? failure(launchFactoryFailed())
      : finalized.value.attemptId === request.attemptId && validLaunch(finalized.value)
        ? finalized
        : failure({ code: 'one-shot-launch-invalid' as const }),
    () => failure(launchFactoryFailed())
  );

const allocateSelectedLaunch = <Payload>(
  pool: OneShotSlotPool,
  selection: OneShotSlotSelectionPlan,
  observations: readonly OneShotSlotObservation[],
  launch: AdmittedOneShotLaunch<Payload>,
  ports: ExactNameOneShotPorts<Payload>,
  allocation: OneShotLaunchAllocationPort
): Promise<OneShotResult<OneShotStartOutcome, OneShotReceiverIssue>> => {
  if (selection.kind === 'confirm-existing') {
    return Promise.resolve(selection.handle.metadataDigest === launch.metadataDigest
      ? success({
          outcome: 'already-started' as const,
          handle: selection.handle,
          startedAtMs: selection.startedAtMs,
          binding: bindingFromObservation(observations.find(candidate =>
            sameOneShotSlotId(candidate.slotId, selection.handle.slotId)))
        })
      : failure({ code: 'attempt-metadata-conflict' as const, attemptId: launch.attemptId }));
  }
  if (selection.kind === 'claim-empty') {
    return startAndConfirm(pool, selection.slot, launch, ports, allocation);
  }
  return deleteRetired(pool, selection.slot, selection.retired, ports).then(deleted =>
    deleted.outcome === 'failure'
      ? deleted
      : startAndConfirm(pool, selection.slot, launch, ports, allocation));
};

const allocateSlotAwareUnderLock = <Payload>(
  pool: OneShotSlotPool,
  request: SlotAwareOneShotLaunchRequest,
  factory: SlotAwareOneShotLaunchFactory<Payload>,
  ports: ExactNameOneShotPorts<Payload>,
  allocation: OneShotLaunchAllocationPort
): Promise<OneShotResult<OneShotStartOutcome, OneShotReceiverIssue>> => ports.observe(pool).then(observed => {
  if (observed.outcome === 'failure') return observed;
  const selection = planOneShotSlotSelection(
    pool,
    observed.value,
    { attemptId: request.attemptId },
    request.observedAtMs
  );
  if (selection.outcome === 'failure') return selection;
  return finalizeSlotAwareLaunch(request, factory, slotForSelection(selection.value)).then(finalized =>
    finalized.outcome === 'failure'
      ? finalized
      : allocateSelectedLaunch(pool, selection.value, observed.value, finalized.value, ports, allocation));
});

export const allocateSlotAwareOneShotAttempt = <Payload>(
  pool: OneShotSlotPool,
  request: SlotAwareOneShotLaunchRequest,
  factory: SlotAwareOneShotLaunchFactory<Payload>,
  ports: ExactNameOneShotPorts<Payload>,
  allocation: OneShotLaunchAllocationPort
): Promise<OneShotResult<OneShotStartOutcome, OneShotReceiverIssue>> => validSlotAwareRequest(request)
  ? probeReceiver(ports).then(probed => probed.outcome === 'failure'
    ? probed
    : underAllocationLock(pool, ports, () => allocateSlotAwareUnderLock(pool, request, factory, ports, allocation)))
  : Promise.resolve(failure({ code: 'one-shot-launch-invalid' }));

export const allocateOneShotAttempt = <Payload>(
  pool: OneShotSlotPool,
  launch: AdmittedOneShotLaunch<Payload>,
  ports: ExactNameOneShotPorts<Payload>,
  allocation: OneShotLaunchAllocationPort
): Promise<OneShotResult<OneShotStartOutcome, OneShotReceiverIssue>> => validLaunch(launch)
  ? probeReceiver(ports).then(probed => probed.outcome === 'failure'
    ? probed
    : underAllocationLock(pool, ports, () => allocateUnderLock(pool, launch, ports, allocation)))
  : Promise.resolve(failure({ code: 'one-shot-launch-invalid' }));

const stopUnderLock = <Payload>(
  pool: OneShotSlotPool,
  handle: OneShotAttemptHandle,
  ports: ExactNameOneShotPorts<Payload>
): Promise<OneShotResult<OneShotStopOutcome, OneShotReceiverIssue>> => ports.observe(pool).then(before => {
  if (before.outcome === 'failure') return before;
  const validated = validateOneShotAttempt(pool, before.value, handle);
  if (validated.outcome === 'failure') return validated;
  const alreadyTerminal = terminalCleanupOutcome(handle, validated.value);
  if (alreadyTerminal !== undefined) return success(alreadyTerminal);
  if (validated.value.status !== 'online') {
    return failure({ code: 'one-shot-stop-precondition-changed', handle });
  }
  return ports.stopExact(handle).then(stopped => stopped.outcome === 'failure'
    ? stopped
    : ports.observe(pool).then(after => {
      if (after.outcome === 'failure') return after;
      const terminal = validateOneShotAttempt(pool, after.value, handle);
      if (terminal.outcome === 'failure') return terminal;
      if (terminal.value.status === 'online' || terminal.value.status === 'launching' ||
          terminal.value.status === 'stopping') {
        return success({ handle, state: 'stop-requested' });
      }
      return success(terminalCleanupOutcome(handle, terminal.value) ?? {
        handle,
        state: 'terminal-cleanup-unconfirmed'
      });
    }));
});

export const requestOneShotCancellation = <Payload>(
  pool: OneShotSlotPool,
  handle: OneShotAttemptHandle,
  ports: ExactNameOneShotPorts<Payload>
): Promise<OneShotResult<OneShotStopOutcome, OneShotReceiverIssue>> => probeReceiver(ports).then(probed =>
  probed.outcome === 'failure'
    ? probed
    : underAllocationLock(pool, ports, () => stopUnderLock(pool, handle, ports)));

const reconcileActions = <Payload>(
  pool: OneShotSlotPool,
  handles: readonly OneShotAttemptHandle[],
  ports: ExactNameOneShotPorts<Payload>
): Promise<OneShotResult<readonly OneShotStopOutcome[], OneShotReceiverIssue>> => handles.reduce(
  (pending: Promise<OneShotResult<readonly OneShotStopOutcome[], OneShotReceiverIssue>>, handle) => pending
    .then(completed => completed.outcome === 'failure'
      ? completed
      : stopUnderLock(pool, handle, ports).then(stopped => stopped.outcome === 'failure'
        ? stopped
        : success([...completed.value, stopped.value]))),
  Promise.resolve(success<readonly OneShotStopOutcome[], OneShotReceiverIssue>([]))
);

const reconcileUnderLock = <Payload>(
  pool: OneShotSlotPool,
  nowMs: number,
  ports: ExactNameOneShotPorts<Payload>
): Promise<OneShotResult<readonly OneShotStopOutcome[], OneShotReceiverIssue>> => ports.observe(pool).then(observed => {
  if (observed.outcome === 'failure') return observed;
  const plan = planOneShotReconciliation(pool, observed.value, nowMs);
  return plan.outcome === 'failure'
    ? plan
    : reconcileActions(pool, plan.value.map(action => action.handle), ports);
});

export const reconcileOneShotAttempts = <Payload>(
  pool: OneShotSlotPool,
  nowMs: number,
  ports: ExactNameOneShotPorts<Payload>
): Promise<OneShotResult<readonly OneShotStopOutcome[], OneShotReceiverIssue>> => probeReceiver(ports).then(probed =>
  probed.outcome === 'failure'
    ? probed
    : underAllocationLock(pool, ports, () => reconcileUnderLock(pool, nowMs, ports)));
