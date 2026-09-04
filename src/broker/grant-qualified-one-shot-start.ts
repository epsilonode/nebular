import { setTimeout as delay } from 'node:timers/promises';

import type { AttemptJournal, JournalIssueCode } from './journal.ts';
import {
  sameGrantQualifiedOneShotDurableRecord,
  validateGrantQualifiedOneShotReservation,
  type GrantQualifiedOneShotReservation
} from './one-shot-materialization-reservation.ts';
import {
  ONE_SHOT_START_CONFIRMATION_ATTEMPTS,
  ONE_SHOT_START_CONFIRMATION_INTERVAL_MS,
  type ExactOneShotStart,
  type OneShotReceiverPortIssue
} from './one-shot-receiver.ts';
import {
  oneShotAttemptHandle,
  sameOneShotProcessName,
  sameOneShotSlotId,
  validateOneShotSlotInventory,
  type OneShotAttemptHandle,
  type OneShotOwnershipMetadata,
  type OneShotResult,
  type OneShotSlotObservation,
  type OneShotSlotPool
} from './one-shot-slots.ts';

export type GrantQualifiedOneShotStartRecoveryReason =
  | 'durable-admission-missing'
  | 'durable-admission-drift'
  | 'slot-inventory-drift'
  | 'slot-foreign'
  | 'slot-ownership-drift'
  | 'terminal-retired'
  | 'confirmation-exhausted';

export type GrantQualifiedOneShotStartIssue =
  | Readonly<{
      code: 'grant-qualified-one-shot-start-invalid';
      safeMessage: string;
    }>
  | Readonly<{
      code: 'grant-qualified-one-shot-start-recovery-required';
      reason: GrantQualifiedOneShotStartRecoveryReason;
      safeMessage: string;
    }>
  | Readonly<{
      code: 'grant-qualified-one-shot-start-authority-stale';
      reason: 'deadline-expired';
      safeMessage: string;
    }>
  | Readonly<{
      code: 'grant-qualified-one-shot-start-journal-failed';
      journalCode: JournalIssueCode;
      safeMessage: string;
    }>
  | Readonly<{
      code: 'grant-qualified-one-shot-start-port-failed';
      operation: 'lock' | 'observe' | 'prepare-exact-start' | 'start-exact' | 'wait' | 'clock';
      receiverDetail?: OneShotReceiverPortIssue['detail'];
      safeMessage: string;
    }>;

export type GrantQualifiedOneShotActiveStart = Readonly<{
  state: 'exact-start-confirmed';
  disposition: 'started' | 'already-started';
  handle: OneShotAttemptHandle;
  processId: number;
  receiverStatus: 'online' | 'launching';
}>;

export type GrantQualifiedOneShotTerminalStart = Readonly<{
  state: 'exact-terminal-confirmed';
  disposition: 'started' | 'already-started';
  handle: OneShotAttemptHandle;
  receiverStatus: 'stopped' | 'errored';
  exitCode: number;
}>;

export type GrantQualifiedOneShotStartOutcome =
  | GrantQualifiedOneShotActiveStart
  | GrantQualifiedOneShotTerminalStart;

export type GrantQualifiedOneShotStartPorts<Payload> = Readonly<{
  attempts: Pick<AttemptJournal, 'readGrantQualifiedMaterializing'>;
}> & Readonly<{
  /** The same namespace lock used by reservation and ordinary one-shot allocation. */
  withAllocationLock: <Value>(
    namespace: string,
    work: () => Promise<OneShotResult<Value, GrantQualifiedOneShotStartIssue>>
  ) => Promise<OneShotResult<Value, GrantQualifiedOneShotStartIssue>>;
  observe: (
    pool: OneShotSlotPool
  ) => Promise<OneShotResult<readonly OneShotSlotObservation[], OneShotReceiverPortIssue>>;
  prepareExactStart: (
    reservation: GrantQualifiedOneShotReservation<Payload>
  ) => Promise<OneShotResult<void, Readonly<{
    code: 'exact-start-preparation-failed';
    safeMessage: string;
  }>>>;
  startExact: (
    request: ExactOneShotStart<Payload>
  ) => Promise<OneShotResult<void, OneShotReceiverPortIssue>>;
}>;

export type GrantQualifiedOneShotStartTiming = Readonly<{
  confirmationAttempts: number;
  confirmationIntervalMs: number;
}> & Readonly<{
  now: () => number;
  wait: (milliseconds: number) => Promise<void>;
}>;

type ExactObservedStart =
  | Readonly<{ kind: 'empty' | 'pending' }>
  | Readonly<{
      kind: 'active';
      handle: OneShotAttemptHandle;
      processId: number;
      receiverStatus: 'online' | 'launching';
    }>
  | Readonly<{
      kind: 'terminal';
      handle: OneShotAttemptHandle;
      receiverStatus: 'stopped' | 'errored';
      exitCode: number;
    }>
  | Readonly<{
      kind: 'recovery';
      reason: Exclude<GrantQualifiedOneShotStartRecoveryReason, 'durable-admission-missing' |
        'durable-admission-drift' | 'confirmation-exhausted'>;
    }>;

const success = <Value, Issue = never>(value: Value): OneShotResult<Value, Issue> => ({
  outcome: 'success',
  value
});

const failure = <Value = never, Issue = never>(issue: Issue): OneShotResult<Value, Issue> => ({
  outcome: 'failure',
  issue
});

const invalid = (): GrantQualifiedOneShotStartIssue => ({
  code: 'grant-qualified-one-shot-start-invalid',
  safeMessage: 'The exact durable one-shot start request is invalid.'
});

const recovery = (
  reason: GrantQualifiedOneShotStartRecoveryReason
): GrantQualifiedOneShotStartIssue => ({
  code: 'grant-qualified-one-shot-start-recovery-required',
  reason,
  safeMessage: 'The exact durable one-shot start requires reconciliation.'
});

const stale = (): GrantQualifiedOneShotStartIssue => ({
  code: 'grant-qualified-one-shot-start-authority-stale',
  reason: 'deadline-expired',
  safeMessage: 'The durable one-shot start deadline has expired.'
});

const portFailed = (
  operation: Extract<GrantQualifiedOneShotStartIssue, {
    code: 'grant-qualified-one-shot-start-port-failed';
  }>['operation'],
  receiverDetail?: OneShotReceiverPortIssue['detail']
): GrantQualifiedOneShotStartIssue => ({
  code: 'grant-qualified-one-shot-start-port-failed',
  operation,
  ...(receiverDetail === undefined ? {} : { receiverDetail }),
  safeMessage: 'The exact durable one-shot start capability failed closed.'
});

const journalFailed = (journalCode: JournalIssueCode): GrantQualifiedOneShotStartIssue =>
  journalCode === 'journal-authority-stale'
    ? stale()
    : {
        code: 'grant-qualified-one-shot-start-journal-failed',
        journalCode,
        safeMessage: 'The durable one-shot start admission could not be reread.'
      };

const timingIsValid = (timing: GrantQualifiedOneShotStartTiming): boolean =>
  Number.isSafeInteger(timing.confirmationAttempts) && timing.confirmationAttempts > 0 &&
  timing.confirmationAttempts <= 20 && Number.isSafeInteger(timing.confirmationIntervalMs) &&
  timing.confirmationIntervalMs >= 0 && timing.confirmationIntervalMs <= 1_000;

const poolContainsExactSlot = <Payload>(
  reservation: GrantQualifiedOneShotReservation<Payload>,
  pool: OneShotSlotPool
): boolean => /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/u.test(pool.namespace) &&
  reservation.allocationNamespace === pool.namespace &&
  pool.slots.filter(slot => sameOneShotSlotId(slot.slotId, reservation.slot.slotId) &&
    sameOneShotProcessName(slot.processName, reservation.slot.processName)).length === 1;

const metadataFor = <Payload>(
  reservation: GrantQualifiedOneShotReservation<Payload>
): OneShotOwnershipMetadata => ({
  slotId: reservation.slot.slotId,
  attemptId: reservation.launch.attemptId,
  metadataDigest: reservation.launch.metadataDigest,
  startedAtMs: reservation.launch.startedAtMs,
  deadlineAtMs: reservation.launch.deadlineAtMs
});

const exactMetadata = (
  expected: OneShotOwnershipMetadata,
  observed: OneShotOwnershipMetadata
): boolean => sameOneShotSlotId(expected.slotId, observed.slotId) &&
  expected.attemptId === observed.attemptId && expected.metadataDigest === observed.metadataDigest &&
  expected.startedAtMs === observed.startedAtMs && expected.deadlineAtMs === observed.deadlineAtMs;

const exactOwnedObservation = (
  expected: OneShotOwnershipMetadata,
  observation: OneShotSlotObservation
): ExactObservedStart => {
  if (observation.occupant.kind === 'empty') return { kind: 'empty' };
  if (observation.occupant.kind === 'foreign') return { kind: 'recovery', reason: 'slot-foreign' };
  if (!exactMetadata(expected, observation.occupant.metadata)) {
    return {
      kind: 'recovery',
      reason: observation.occupant.status === 'stopped' || observation.occupant.status === 'errored'
        ? 'terminal-retired'
        : 'slot-ownership-drift'
    };
  }
  const handle = oneShotAttemptHandle(observation);
  if (handle === undefined || !Number.isSafeInteger(handle.pmId) || handle.pmId < 0) {
    return { kind: 'recovery', reason: 'slot-ownership-drift' };
  }
  if ((observation.occupant.status === 'online' || observation.occupant.status === 'launching') &&
      observation.occupant.pid !== null && Number.isSafeInteger(observation.occupant.pid) &&
      observation.occupant.pid > 0) {
    return {
      kind: 'active',
      handle,
      processId: observation.occupant.pid,
      receiverStatus: observation.occupant.status
    };
  }
  if (observation.occupant.status === 'stopped' || observation.occupant.status === 'errored') {
    if (observation.occupant.cleanupProof === 'confirmed') {
      return { kind: 'recovery', reason: 'terminal-retired' };
    }
    return observation.occupant.exitCode !== undefined && Number.isSafeInteger(observation.occupant.exitCode)
      ? {
          kind: 'terminal',
          handle,
          receiverStatus: observation.occupant.status,
          exitCode: observation.occupant.exitCode
        }
      : { kind: 'pending' };
  }
  return { kind: 'pending' };
};

const classifyObservation = <Payload>(
  reservation: GrantQualifiedOneShotReservation<Payload>,
  pool: OneShotSlotPool,
  observations: readonly OneShotSlotObservation[]
): ExactObservedStart => {
  const inventory = validateOneShotSlotInventory(pool, observations);
  if (inventory.outcome === 'failure') return { kind: 'recovery', reason: 'slot-inventory-drift' };
  if (inventory.value.some(observation => observation.occupant.kind === 'foreign')) {
    return { kind: 'recovery', reason: 'slot-foreign' };
  }
  const target = inventory.value.find(observation =>
    sameOneShotSlotId(observation.slotId, reservation.slot.slotId));
  return target === undefined || !sameOneShotProcessName(target.processName, reservation.slot.processName)
    ? { kind: 'recovery', reason: 'slot-inventory-drift' }
    : exactOwnedObservation(metadataFor(reservation), target);
};

const projectConfirmed = (
  observation: Extract<ExactObservedStart, { kind: 'active' | 'terminal' }>,
  disposition: GrantQualifiedOneShotStartOutcome['disposition']
): GrantQualifiedOneShotStartOutcome => observation.kind === 'active'
  ? {
      state: 'exact-start-confirmed',
      disposition,
      handle: observation.handle,
      processId: observation.processId,
      receiverStatus: observation.receiverStatus
    }
  : {
      state: 'exact-terminal-confirmed',
      disposition,
      handle: observation.handle,
      receiverStatus: observation.receiverStatus,
      exitCode: observation.exitCode
    };

const readNow = (timing: GrantQualifiedOneShotStartTiming): Promise<number | null> => Promise.resolve()
  .then(() => timing.now()).then(
    value => Number.isSafeInteger(value) && value >= 0 ? value : null,
    () => null
  );

const waitOnce = (
  timing: GrantQualifiedOneShotStartTiming
): Promise<OneShotResult<void, GrantQualifiedOneShotStartIssue>> => Promise.resolve()
  .then(() => timing.wait(timing.confirmationIntervalMs)).then(
    () => success(undefined),
    () => failure(portFailed('wait'))
  );

const pollExactConfirmation = <Payload>(
  reservation: GrantQualifiedOneShotReservation<Payload>,
  pool: OneShotSlotPool,
  disposition: GrantQualifiedOneShotStartOutcome['disposition'],
  attemptsRemaining: number,
  ports: GrantQualifiedOneShotStartPorts<Payload>,
  timing: GrantQualifiedOneShotStartTiming,
  lastObserveIssue: OneShotReceiverPortIssue | null = null
): Promise<OneShotResult<GrantQualifiedOneShotStartOutcome, GrantQualifiedOneShotStartIssue>> => readNow(timing)
  .then(nowMs => {
    if (nowMs === null) return failure(portFailed('clock'));
    if (nowMs >= reservation.launch.deadlineAtMs || nowMs >= reservation.authority.grantExpiresAtMs) {
      return failure(stale());
    }
    return Promise.resolve().then(() => ports.observe(pool)).then(
      observed => {
        if (observed.outcome === 'failure') {
          if (attemptsRemaining <= 1) return failure(portFailed('observe'));
          return waitOnce(timing).then(waited => waited.outcome === 'failure'
            ? waited
            : pollExactConfirmation(
                reservation,
                pool,
                disposition,
                attemptsRemaining - 1,
                ports,
                timing,
                observed.issue
              ));
        }
        const exact = classifyObservation(reservation, pool, observed.value);
        if (exact.kind === 'active' || exact.kind === 'terminal') {
          return success(projectConfirmed(exact, disposition));
        }
        if (exact.kind === 'recovery') return failure(recovery(exact.reason));
        if (attemptsRemaining <= 1) {
          return failure(lastObserveIssue === null
            ? recovery('confirmation-exhausted')
            : portFailed('observe'));
        }
        return waitOnce(timing).then(waited => waited.outcome === 'failure'
          ? waited
          : pollExactConfirmation(
              reservation,
              pool,
              disposition,
              attemptsRemaining - 1,
              ports,
              timing,
              lastObserveIssue
            ));
      },
      () => attemptsRemaining <= 1
        ? failure(portFailed('observe'))
        : waitOnce(timing).then(waited => waited.outcome === 'failure'
          ? waited
          : pollExactConfirmation(
              reservation,
              pool,
              disposition,
              attemptsRemaining - 1,
              ports,
              timing,
              { code: 'pm2-receiver-unavailable', operation: 'observe', safeMessage: '' }
            ))
    );
  });

const startEmptyAndConfirm = <Payload>(
  reservation: GrantQualifiedOneShotReservation<Payload>,
  pool: OneShotSlotPool,
  ports: GrantQualifiedOneShotStartPorts<Payload>,
  timing: GrantQualifiedOneShotStartTiming
): Promise<OneShotResult<GrantQualifiedOneShotStartOutcome, GrantQualifiedOneShotStartIssue>> => {
  const request: ExactOneShotStart<Payload> = {
    slot: reservation.slot,
    metadata: metadataFor(reservation),
    payload: reservation.launch.payload,
    autorestart: false
  };
  const confirm = (startIssue: OneShotReceiverPortIssue | null): Promise<OneShotResult<
    GrantQualifiedOneShotStartOutcome,
    GrantQualifiedOneShotStartIssue
  >> => pollExactConfirmation(
    reservation,
    pool,
    'started',
    timing.confirmationAttempts,
    ports,
    timing
  ).then(confirmed => confirmed.outcome === 'failure' && startIssue?.detail !== undefined
    ? failure(portFailed('start-exact', startIssue.detail))
    : confirmed.outcome === 'failure' && startIssue !== null &&
    confirmed.issue.code === 'grant-qualified-one-shot-start-recovery-required' &&
    confirmed.issue.reason === 'confirmation-exhausted'
    ? failure(portFailed('start-exact'))
    : confirmed);
  return Promise.resolve().then(() => ports.prepareExactStart(reservation)).then(
    prepared => prepared.outcome === 'failure'
      ? failure(portFailed('prepare-exact-start'))
      : Promise.resolve().then(() => ports.startExact(request)).then(
          started => confirm(started.outcome === 'failure' ? started.issue : null),
          () => confirm({
            code: 'pm2-operation-failed',
            operation: 'start-exact',
            safeMessage: 'The exact one-shot receiver start failed closed.'
          })
        ),
    () => failure(portFailed('prepare-exact-start'))
  );
};

const observeBeforeStart = <Payload>(
  reservation: GrantQualifiedOneShotReservation<Payload>,
  pool: OneShotSlotPool,
  ports: GrantQualifiedOneShotStartPorts<Payload>,
  timing: GrantQualifiedOneShotStartTiming,
  bootstrapAlreadyBound: boolean
): Promise<OneShotResult<GrantQualifiedOneShotStartOutcome, GrantQualifiedOneShotStartIssue>> => Promise.resolve()
  .then(() => ports.observe(pool)).then(
    observed => {
      if (observed.outcome === 'failure') return failure(portFailed('observe'));
      const exact = classifyObservation(reservation, pool, observed.value);
      if (exact.kind === 'active' || exact.kind === 'terminal') {
        return success(projectConfirmed(exact, 'already-started'));
      }
      if (exact.kind === 'recovery') return failure(recovery(exact.reason));
      return exact.kind === 'empty' && bootstrapAlreadyBound
        ? failure(recovery('slot-ownership-drift'))
        : exact.kind === 'empty'
        ? startEmptyAndConfirm(reservation, pool, ports, timing)
        : pollExactConfirmation(
            reservation,
            pool,
            'already-started',
            timing.confirmationAttempts,
            ports,
            timing
          );
    },
    () => failure(portFailed('observe'))
  );

const readExactAdmission = <Payload>(
  reservation: GrantQualifiedOneShotReservation<Payload>,
  pool: OneShotSlotPool,
  ports: GrantQualifiedOneShotStartPorts<Payload>,
  timing: GrantQualifiedOneShotStartTiming
): Promise<OneShotResult<GrantQualifiedOneShotStartOutcome, GrantQualifiedOneShotStartIssue>> => Promise.resolve()
  .then(() => ports.attempts.readGrantQualifiedMaterializing(reservation.identity.attemptId)).then(
    current => {
      if (current.type === 'err') return failure(journalFailed(current.issues[0].code));
      if (current.value === null) return failure(recovery('durable-admission-missing'));
      if (!sameGrantQualifiedOneShotDurableRecord(reservation, current.value)) {
        return failure(recovery('durable-admission-drift'));
      }
      const bootstrapAlreadyBound = current.value.attempt.bootstrapBinding !== null;
      return readNow(timing).then(nowMs => nowMs === null
        ? failure(portFailed('clock'))
        : nowMs >= reservation.launch.deadlineAtMs ||
            nowMs >= reservation.authority.grantExpiresAtMs
          ? failure(stale())
          : observeBeforeStart(
              reservation,
              pool,
              ports,
              timing,
              bootstrapAlreadyBound
            ));
    },
    () => failure(journalFailed('journal-unavailable'))
  );

export const createSystemGrantQualifiedOneShotStartTiming = (): GrantQualifiedOneShotStartTiming => ({
  confirmationAttempts: ONE_SHOT_START_CONFIRMATION_ATTEMPTS,
  confirmationIntervalMs: ONE_SHOT_START_CONFIRMATION_INTERVAL_MS,
  now: Date.now,
  wait: milliseconds => delay(milliseconds, undefined, { ref: false }).then(() => undefined)
});

export const startGrantQualifiedOneShotReservation = <Payload>(
  reservation: GrantQualifiedOneShotReservation<Payload>,
  pool: OneShotSlotPool,
  ports: GrantQualifiedOneShotStartPorts<Payload>,
  timing: GrantQualifiedOneShotStartTiming = createSystemGrantQualifiedOneShotStartTiming()
): Promise<OneShotResult<GrantQualifiedOneShotStartOutcome, GrantQualifiedOneShotStartIssue>> => {
  if (!validateGrantQualifiedOneShotReservation(reservation) || !poolContainsExactSlot(reservation, pool) ||
      !timingIsValid(timing)) return Promise.resolve(failure(invalid()));
  return readNow(timing).then(nowMs => {
    if (nowMs === null) return failure(portFailed('clock'));
    if (nowMs >= reservation.launch.deadlineAtMs || nowMs >= reservation.authority.grantExpiresAtMs) {
      return failure(stale());
    }
    return Promise.resolve().then(() => ports.withAllocationLock(
      pool.namespace,
      () => readExactAdmission(reservation, pool, ports, timing)
    )).then(
      result => result,
      () => failure(portFailed('lock'))
    );
  });
};
