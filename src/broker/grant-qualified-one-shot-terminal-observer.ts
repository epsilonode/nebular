import { setTimeout as delay } from 'node:timers/promises';

import {
  validateGrantQualifiedOneShotReservation,
  type GrantQualifiedOneShotReservation
} from './one-shot-materialization-reservation.ts';
import type {
  GrantQualifiedOneShotStartOutcome
} from './grant-qualified-one-shot-start.ts';
import type { OneShotReceiverPortIssue } from './one-shot-receiver.ts';
import {
  sameOneShotProcessName,
  sameOneShotSlotId,
  validateOneShotAttempt,
  validateOneShotSlotInventory,
  type OneShotAttemptHandle,
  type OneShotResult,
  type OneShotSlotObservation,
  type OneShotSlotPool
} from './one-shot-slots.ts';

export const GRANT_QUALIFIED_ONE_SHOT_DEFAULT_TERMINAL_POLL_INTERVAL_MS = 25;
export const GRANT_QUALIFIED_ONE_SHOT_MAX_TERMINAL_POLL_INTERVAL_MS = 1_000;
export const GRANT_QUALIFIED_ONE_SHOT_DEFAULT_CONSECUTIVE_OBSERVE_FAILURES = 3;
export const GRANT_QUALIFIED_ONE_SHOT_MAX_CONSECUTIVE_OBSERVE_FAILURES = 10;

export type GrantQualifiedOneShotTerminalObservation = Readonly<{
  state: 'exact-terminal-observed';
  handle: OneShotAttemptHandle;
  receiverStatus: 'stopped' | 'errored';
  exitCode: number;
}>;

export type GrantQualifiedOneShotCancellationRequirement = Readonly<{
  state: 'exact-cancellation-required';
  reason: 'control-cancelled' | 'deadline-expired';
  handle: OneShotAttemptHandle;
}>;

export type GrantQualifiedOneShotTerminalWaitOutcome =
  | GrantQualifiedOneShotTerminalObservation
  | GrantQualifiedOneShotCancellationRequirement;

export type GrantQualifiedOneShotTerminalWaitIssue =
  | Readonly<{
      code: 'grant-qualified-one-shot-terminal-wait-invalid';
      safeMessage: string;
    }>
  | Readonly<{
      code: 'grant-qualified-one-shot-terminal-recovery-required';
      reason:
        | 'clock-unavailable'
        | 'receiver-observation-unavailable'
        | 'slot-inventory-drift'
        | 'slot-ownership-drift'
        | 'terminal-projection-incomplete'
        | 'wait-unavailable';
      safeMessage: string;
    }>;

export type GrantQualifiedOneShotTerminalWaitPorts = Readonly<{
  observe: (
    pool: OneShotSlotPool
  ) => Promise<OneShotResult<readonly OneShotSlotObservation[], OneShotReceiverPortIssue>>;
  now: () => number;
  wait: (milliseconds: number) => Promise<void>;
}>;

export type GrantQualifiedOneShotTerminalWaitPolicy = Readonly<{
  pollIntervalMs: number;
  maximumConsecutiveObserveFailures: number;
}>;

type ClassifiedObservation =
  | Readonly<{ kind: 'active' }>
  | Readonly<{
      kind: 'terminal';
      receiverStatus: GrantQualifiedOneShotTerminalObservation['receiverStatus'];
      exitCode: number;
    }>
  | Readonly<{
      kind: 'recovery';
      reason: Extract<GrantQualifiedOneShotTerminalWaitIssue, {
        code: 'grant-qualified-one-shot-terminal-recovery-required';
      }>['reason'];
    }>;

const success = <Value, Issue = never>(value: Value): OneShotResult<Value, Issue> => ({
  outcome: 'success',
  value
});

const failure = <Value = never, Issue = never>(issue: Issue): OneShotResult<Value, Issue> => ({
  outcome: 'failure',
  issue
});

const invalid = (): GrantQualifiedOneShotTerminalWaitIssue => ({
  code: 'grant-qualified-one-shot-terminal-wait-invalid',
  safeMessage: 'The exact one-shot terminal wait request is invalid.'
});

const recovery = (
  reason: Extract<GrantQualifiedOneShotTerminalWaitIssue, {
    code: 'grant-qualified-one-shot-terminal-recovery-required';
  }>['reason']
): GrantQualifiedOneShotTerminalWaitIssue => ({
  code: 'grant-qualified-one-shot-terminal-recovery-required',
  reason,
  safeMessage: 'The exact one-shot terminal observation requires reconciliation.'
});

const validPolicy = (policy: GrantQualifiedOneShotTerminalWaitPolicy): boolean =>
  Number.isSafeInteger(policy.pollIntervalMs) && policy.pollIntervalMs > 0 &&
  policy.pollIntervalMs <= GRANT_QUALIFIED_ONE_SHOT_MAX_TERMINAL_POLL_INTERVAL_MS &&
  Number.isSafeInteger(policy.maximumConsecutiveObserveFailures) &&
  policy.maximumConsecutiveObserveFailures > 0 &&
  policy.maximumConsecutiveObserveFailures <= GRANT_QUALIFIED_ONE_SHOT_MAX_CONSECUTIVE_OBSERVE_FAILURES;

const poolContainsReservation = <Payload>(
  reservation: GrantQualifiedOneShotReservation<Payload>,
  pool: OneShotSlotPool
): boolean => reservation.allocationNamespace === pool.namespace &&
  pool.slots.filter(slot => sameOneShotSlotId(slot.slotId, reservation.slot.slotId) &&
    sameOneShotProcessName(slot.processName, reservation.slot.processName)).length === 1;

const exactStartHandle = <Payload>(
  reservation: GrantQualifiedOneShotReservation<Payload>,
  start: GrantQualifiedOneShotStartOutcome
): boolean => sameOneShotSlotId(start.handle.slotId, reservation.slot.slotId) &&
  sameOneShotProcessName(start.handle.processName, reservation.slot.processName) &&
  start.handle.attemptId === reservation.identity.attemptId &&
  start.handle.metadataDigest === reservation.launch.metadataDigest &&
  Number.isSafeInteger(start.handle.pmId) && start.handle.pmId >= 0;

const classifyObservation = (
  pool: OneShotSlotPool,
  handle: OneShotAttemptHandle,
  observations: readonly OneShotSlotObservation[]
): ClassifiedObservation => {
  const inventory = validateOneShotSlotInventory(pool, observations);
  if (inventory.outcome === 'failure') return { kind: 'recovery', reason: 'slot-inventory-drift' };
  const validated = validateOneShotAttempt(pool, inventory.value, handle);
  if (validated.outcome === 'failure') return { kind: 'recovery', reason: 'slot-ownership-drift' };
  const status = validated.value.status;
  if (status === 'online' || status === 'launching' || status === 'stopping') return { kind: 'active' };
  if (status === 'stopped' || status === 'errored') {
    return validated.value.exitCode !== undefined && Number.isSafeInteger(validated.value.exitCode)
      ? { kind: 'terminal', receiverStatus: status, exitCode: validated.value.exitCode }
      : { kind: 'recovery', reason: 'terminal-projection-incomplete' };
  }
  return { kind: 'recovery', reason: 'slot-ownership-drift' };
};

const readNow = (
  ports: GrantQualifiedOneShotTerminalWaitPorts
): Promise<OneShotResult<number, GrantQualifiedOneShotTerminalWaitIssue>> => Promise.resolve()
  .then(() => ports.now())
  .then(
    nowMs => Number.isSafeInteger(nowMs) && nowMs >= 0
      ? success(nowMs)
      : failure(recovery('clock-unavailable')),
    () => failure(recovery('clock-unavailable'))
  );

const waitOnce = (
  ports: GrantQualifiedOneShotTerminalWaitPorts,
  policy: GrantQualifiedOneShotTerminalWaitPolicy
): Promise<OneShotResult<void, GrantQualifiedOneShotTerminalWaitIssue>> => Promise.resolve()
  .then(() => ports.wait(policy.pollIntervalMs))
  .then(
    () => success(undefined),
    () => failure(recovery('wait-unavailable'))
  );

const poll = <Payload>(
  reservation: GrantQualifiedOneShotReservation<Payload>,
  pool: OneShotSlotPool,
  handle: OneShotAttemptHandle,
  signal: Readonly<AbortSignal>,
  ports: GrantQualifiedOneShotTerminalWaitPorts,
  policy: GrantQualifiedOneShotTerminalWaitPolicy,
  consecutiveObserveFailures: number = 0
): Promise<OneShotResult<GrantQualifiedOneShotTerminalWaitOutcome, GrantQualifiedOneShotTerminalWaitIssue>> =>
  readNow(ports).then(now => {
    if (now.outcome === 'failure') return Promise.resolve(now);
    if (signal.aborted) {
      return Promise.resolve(success({
        state: 'exact-cancellation-required',
        reason: 'control-cancelled',
        handle
      }));
    }
    if (now.value >= reservation.launch.deadlineAtMs ||
        now.value >= reservation.authority.grantExpiresAtMs) {
      return Promise.resolve(success({
        state: 'exact-cancellation-required',
        reason: 'deadline-expired',
        handle
      }));
    }
    return Promise.resolve().then(() => ports.observe(pool)).then(
    observed => {
      if (observed.outcome === 'failure') {
        const failures = consecutiveObserveFailures + 1;
        return failures >= policy.maximumConsecutiveObserveFailures
          ? Promise.resolve(failure(recovery('receiver-observation-unavailable')))
          : waitOnce(ports, policy).then(waited => waited.outcome === 'failure'
            ? waited
            : poll(reservation, pool, handle, signal, ports, policy, failures));
      }
      const classified = classifyObservation(pool, handle, observed.value);
      if (classified.kind === 'recovery') return Promise.resolve(failure(recovery(classified.reason)));
      if (classified.kind === 'terminal') {
        return Promise.resolve(success({
          state: 'exact-terminal-observed',
          handle,
          receiverStatus: classified.receiverStatus,
          exitCode: classified.exitCode
        }));
      }
      return waitOnce(ports, policy).then(waited => waited.outcome === 'failure'
        ? waited
        : poll(reservation, pool, handle, signal, ports, policy, 0));
    },
    () => consecutiveObserveFailures + 1 >= policy.maximumConsecutiveObserveFailures
      ? failure(recovery('receiver-observation-unavailable'))
      : waitOnce(ports, policy).then(waited => waited.outcome === 'failure'
        ? waited
        : poll(reservation, pool, handle, signal, ports, policy, consecutiveObserveFailures + 1))
    );
  });

export const createSystemGrantQualifiedOneShotTerminalWaitPorts = (
  observe: GrantQualifiedOneShotTerminalWaitPorts['observe']
): GrantQualifiedOneShotTerminalWaitPorts => ({
  observe,
  now: Date.now,
  wait: milliseconds => delay(milliseconds, undefined, { ref: false }).then(() => undefined)
});

export const waitForGrantQualifiedOneShotTerminal = <Payload>(
  reservation: GrantQualifiedOneShotReservation<Payload>,
  pool: OneShotSlotPool,
  start: GrantQualifiedOneShotStartOutcome,
  signal: Readonly<AbortSignal>,
  ports: GrantQualifiedOneShotTerminalWaitPorts,
  policy: GrantQualifiedOneShotTerminalWaitPolicy = {
    pollIntervalMs: GRANT_QUALIFIED_ONE_SHOT_DEFAULT_TERMINAL_POLL_INTERVAL_MS,
    maximumConsecutiveObserveFailures:
      GRANT_QUALIFIED_ONE_SHOT_DEFAULT_CONSECUTIVE_OBSERVE_FAILURES
  }
): Promise<OneShotResult<GrantQualifiedOneShotTerminalWaitOutcome, GrantQualifiedOneShotTerminalWaitIssue>> => {
  if (!validateGrantQualifiedOneShotReservation(reservation) || !poolContainsReservation(reservation, pool) ||
      !exactStartHandle(reservation, start) || !validPolicy(policy)) {
    return Promise.resolve(failure(invalid()));
  }
  if (start.state === 'exact-terminal-confirmed') {
    return Promise.resolve(success({
      state: 'exact-terminal-observed',
      handle: start.handle,
      receiverStatus: start.receiverStatus,
      exitCode: start.exitCode
    }));
  }
  return poll(reservation, pool, start.handle, signal, ports, policy);
};
