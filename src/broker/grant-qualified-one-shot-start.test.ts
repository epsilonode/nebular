import { describe, expect, it, vi } from 'vitest';

import {
  journalOk,
  parseCheckedInRecipeLocator,
  parseJournalOperationId,
  parseReceiverCorrelation,
  parseReceiverEntryIdentity,
  parseRedactedPlanDigest,
  type GrantQualifiedMaterializingAttemptRecord
} from './journal.ts';
import {
  createSystemGrantQualifiedOneShotStartTiming,
  startGrantQualifiedOneShotReservation,
  type GrantQualifiedOneShotStartPorts,
  type GrantQualifiedOneShotStartTiming
} from './grant-qualified-one-shot-start.ts';
import {
  deriveGrantQualifiedOneShotReservationDigest,
  type GrantQualifiedOneShotReservation,
  type OneShotMaterializationReceiverIdentity
} from './one-shot-materialization-reservation.ts';
import {
  createOneShotSlotPool,
  type OneShotResult,
  type OneShotSlotObservation,
  type OneShotSlotPool
} from './one-shot-slots.ts';
import {
  parseCanonicalRepository,
  parseCredentialSlotId,
  parseGrantId,
  parseProcessAttemptId,
  parseReceiverId,
  parseRecipeRevision
} from './primitives.ts';

type Payload = Readonly<{ executablePath: string }>;

const success = <Value, Issue = never>(value: Value): OneShotResult<Value, Issue> => ({
  outcome: 'success',
  value
});

const unwrapBroker = <Value>(result: Readonly<{
  isErr: () => boolean;
  value?: Value;
}>): Value => {
  if (result.isErr() || result.value === undefined) throw new Error('invalid broker fixture');
  return result.value;
};

const unwrapJournal = <Value>(result: Readonly<{
  type: 'ok';
  value: Value;
}> | Readonly<{ type: 'err' }>): Value => {
  if (result.type === 'err') throw new Error('invalid journal fixture');
  return result.value;
};

const poolFixture = (): OneShotSlotPool => {
  const pool = createOneShotSlotPool('nebular-one-shot', 2);
  if (pool.outcome === 'failure') throw new Error('invalid pool fixture');
  return pool.value;
};

const reservationFixture = (
  pool: OneShotSlotPool = poolFixture()
): GrantQualifiedOneShotReservation<Payload> => {
  const slot = pool.slots[1];
  if (slot === undefined) throw new Error('invalid slot fixture');
  const attemptId = unwrapBroker(parseProcessAttemptId('one-shot-v1-attempt'));
  const reserveOperationId = unwrapJournal(parseJournalOperationId('one-shot-reserve-v1-operation'));
  const materializeOperationId = unwrapJournal(parseJournalOperationId('one-shot-materialize-v1-operation'));
  const repository = unwrapBroker(parseCanonicalRepository('R:\\Code\\repository'));
  const recipeRevision = unwrapBroker(parseRecipeRevision('revision-1'));
  const grantId = unwrapBroker(parseGrantId('grant-1'));
  const weather = unwrapBroker(parseCredentialSlotId('weather'));
  const receiverId = unwrapBroker(parseReceiverId('pm2'));
  const receiverEntryIdentity = unwrapJournal(parseReceiverEntryIdentity(`pm2-entry:${slot.processName.value}`));
  const receiverCorrelation = unwrapJournal(parseReceiverCorrelation('pm2-one-shot-v1-correlation'));
  const slotIndependentPlanDigest = unwrapJournal(parseRedactedPlanDigest(`sha256:${'a'.repeat(64)}`));
  const launchMetadataDigest = 'b'.repeat(64);
  const planDigest = unwrapJournal(parseRedactedPlanDigest(launchMetadataDigest));
  const recipeLocator = unwrapJournal(parseCheckedInRecipeLocator('.nebular/recipes/app.xml'));
  const receiver: OneShotMaterializationReceiverIdentity = {
    receiverId,
    receiverEntryIdentity,
    receiverCorrelation
  };
  const identity = {
    attemptId,
    reserveOperationId,
    materializeOperationId,
    slotIndependentPlanDigest
  };
  const launch = {
    attemptId,
    metadataDigest: launchMetadataDigest,
    startedAtMs: 1_000,
    deadlineAtMs: 10_000,
    payload: { executablePath: 'C:\\Tools\\bun.exe' }
  };
  const authority = {
    grantId,
    grantGeneration: 3,
    repository,
    recipeRevision,
    credentialSlotIds: [weather],
    grantExpiresAtMs: 10_000
  };
  const admission = {
    format: 'grant-qualified-launch-admission/v1' as const,
    bindingGeneration: 1,
    receiverId,
    receiverSlotIdentity: slot.slotId.value,
    receiverProcessName: slot.processName.value,
    receiverEntryIdentity,
    recipeLocator,
    slotIndependentPlanDigest,
    launchMetadataDigest,
    deadlineAtMs: launch.deadlineAtMs
  };
  const attempt = {
    id: attemptId,
    reserveOperationId,
    repository,
    recipeRevision,
    planDigest,
    lifecycle: 'one-shot' as const,
    receiverCorrelation,
    state: 'materializing' as const,
    stateVersion: 2,
    createdAtMs: launch.startedAtMs,
    updatedAtMs: launch.startedAtMs,
    bootstrapBinding: null
  };
  const digest = deriveGrantQualifiedOneShotReservationDigest(
    identity,
    pool.namespace,
    slot,
    receiver,
    launch
  );
  if (digest.outcome === 'failure') throw new Error('invalid reservation digest fixture');
  return {
    state: 'materializing-reserved',
    status: 'committed',
    allocationNamespace: pool.namespace,
    identity,
    slot,
    receiver,
    exactReservationDigest: digest.value,
    attempt,
    authority,
    admission,
    launch
  };
};

const emptyInventory = (pool: OneShotSlotPool): readonly OneShotSlotObservation[] => pool.slots.map(slot => ({
  ...slot,
  occupant: { kind: 'empty' as const }
}));

const exactOwned = (
  reservation: GrantQualifiedOneShotReservation<Payload>,
  pool: OneShotSlotPool,
  status: 'online' | 'launching' | 'stopping' | 'stopped' | 'errored' | 'unknown' = 'online',
  overrides: Readonly<Record<string, unknown>> = {}
): readonly OneShotSlotObservation[] => pool.slots.map(slot => sameSlot(slot.slotId.value, reservation.slot.slotId.value)
  ? {
      ...slot,
      occupant: {
        kind: 'owned' as const,
        pmId: 17,
        pid: status === 'online' || status === 'launching' ? 4_200 : 0,
        status,
        metadata: {
          slotId: reservation.slot.slotId,
          attemptId: reservation.launch.attemptId,
          metadataDigest: reservation.launch.metadataDigest,
          startedAtMs: reservation.launch.startedAtMs,
          deadlineAtMs: reservation.launch.deadlineAtMs
        },
        cleanupProof: 'unconfirmed' as const,
        ...overrides
      }
    }
  : { ...slot, occupant: { kind: 'empty' as const } });

const sameSlot = (left: string, right: string): boolean => left === right;

type Harness = Readonly<{
  events: string[];
  startExact: ReturnType<typeof vi.fn>;
  prepareExactStart: ReturnType<typeof vi.fn>;
  ports: GrantQualifiedOneShotStartPorts<Payload>;
}>;

const harness = (
  reservation: GrantQualifiedOneShotReservation<Payload>,
  observations: readonly (readonly OneShotSlotObservation[])[],
  current: GrantQualifiedMaterializingAttemptRecord | null = {
    attempt: reservation.attempt,
    authority: reservation.authority,
    admission: reservation.admission
  },
  prepareResult: OneShotResult<void, Readonly<{
    code: 'exact-start-preparation-failed';
    safeMessage: string;
  }>> = success(undefined),
  startResult: OneShotResult<void, Readonly<{
    code: 'pm2-operation-failed';
    operation: 'start-exact';
    safeMessage: string;
  }>> = success(undefined)
): Harness => {
  const events: string[] = [];
  let observationIndex = 0;
  const prepareExactStart = vi.fn(() => {
    events.push('prepare');
    return Promise.resolve(prepareResult);
  });
  const startExact = vi.fn(() => {
    events.push('start-exact');
    return Promise.resolve(startResult);
  });
  return {
    events,
    prepareExactStart,
    startExact,
    ports: {
      withAllocationLock: (namespace, work) => {
        events.push(`lock:${namespace}`);
        return work();
      },
      attempts: {
        readGrantQualifiedMaterializing: () => {
          events.push('read-admission');
          return Promise.resolve(journalOk(current));
        }
      },
      observe: () => {
        events.push('observe');
        const observed = observations[Math.min(observationIndex, observations.length - 1)];
        observationIndex += 1;
        return Promise.resolve(observed === undefined
          ? success<readonly OneShotSlotObservation[], never>([])
          : success(observed));
      },
      prepareExactStart,
      startExact
    }
  };
};

const timing = (
  events: string[] = [],
  now: () => number = () => 2_000
): GrantQualifiedOneShotStartTiming => ({
  confirmationAttempts: 3,
  confirmationIntervalMs: 0,
  now,
  wait: () => {
    events.push('wait');
    return Promise.resolve();
  }
});

describe('exact durable grant-qualified one-shot starter', () => {
  it('starts only its reserved empty slot and confirms the exact PM2 handle and PID', async () => {
    const pool = poolFixture();
    const reservation = reservationFixture(pool);
    const state = harness(reservation, [emptyInventory(pool), exactOwned(reservation, pool)]);
    const result = await startGrantQualifiedOneShotReservation(
      reservation,
      pool,
      state.ports,
      timing(state.events)
    );

    expect(result).toEqual({
      outcome: 'success',
      value: {
        state: 'exact-start-confirmed',
        disposition: 'started',
        handle: {
          slotId: reservation.slot.slotId,
          processName: reservation.slot.processName,
          attemptId: reservation.launch.attemptId,
          metadataDigest: reservation.launch.metadataDigest,
          pmId: 17
        },
        processId: 4_200,
        receiverStatus: 'online'
      }
    });
    expect(state.events).toEqual([
      `lock:${pool.namespace}`,
      'read-admission',
      'observe',
      'prepare',
      'start-exact',
      'observe'
    ]);
    expect(state.startExact).toHaveBeenCalledExactlyOnceWith({
      slot: reservation.slot,
      metadata: expect.objectContaining({
        attemptId: reservation.launch.attemptId,
        metadataDigest: reservation.launch.metadataDigest
      }),
      payload: reservation.launch.payload,
      autorestart: false
    });
  });

  it('returns an exact already-owned replay without preparation or another PM2 start', async () => {
    const pool = poolFixture();
    const reservation = reservationFixture(pool);
    const state = harness(reservation, [exactOwned(reservation, pool, 'launching')]);
    const result = await startGrantQualifiedOneShotReservation(reservation, pool, state.ports, timing());

    expect(result).toMatchObject({
      outcome: 'success',
      value: { state: 'exact-start-confirmed', disposition: 'already-started', processId: 4_200 }
    });
    expect(state.prepareExactStart).not.toHaveBeenCalled();
    expect(state.startExact).not.toHaveBeenCalled();
    expect(state.events).toEqual([`lock:${pool.namespace}`, 'read-admission', 'observe']);
  });

  it('accepts an exact terminal replay only with an objective exit code and unretired cleanup state', async () => {
    const pool = poolFixture();
    const reservation = reservationFixture(pool);
    const state = harness(reservation, [exactOwned(reservation, pool, 'stopped', { exitCode: 17 })]);
    const result = await startGrantQualifiedOneShotReservation(reservation, pool, state.ports, timing());

    expect(result).toMatchObject({
      outcome: 'success',
      value: {
        state: 'exact-terminal-confirmed',
        disposition: 'already-started',
        receiverStatus: 'stopped',
        exitCode: 17
      }
    });
    expect(state.prepareExactStart).not.toHaveBeenCalled();
    expect(state.startExact).not.toHaveBeenCalled();
  });

  it('prepares trusted launch artifacts inside the lock and prevents start when preparation fails', async () => {
    const pool = poolFixture();
    const reservation = reservationFixture(pool);
    const state = harness(
      reservation,
      [emptyInventory(pool)],
      undefined,
      {
        outcome: 'failure',
        issue: { code: 'exact-start-preparation-failed', safeMessage: 'private path canary' }
      }
    );
    const result = await startGrantQualifiedOneShotReservation(reservation, pool, state.ports, timing());

    expect(result).toMatchObject({
      outcome: 'failure',
      issue: {
        code: 'grant-qualified-one-shot-start-port-failed',
        operation: 'prepare-exact-start'
      }
    });
    expect(state.startExact).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain('private path canary');
  });

  it.each([
    ['missing admission', 'durable-admission-missing', null],
    ['drifted admission', 'durable-admission-drift', 'drift']
  ] as const)('fails typed recovery for %s before observation', async (_label, reason, currentKind) => {
    const pool = poolFixture();
    const reservation = reservationFixture(pool);
    const current = currentKind === null
      ? null
      : {
          attempt: reservation.attempt,
          authority: reservation.authority,
          admission: { ...reservation.admission, receiverProcessName: 'other-process' }
        };
    const state = harness(reservation, [emptyInventory(pool)], current);
    const result = await startGrantQualifiedOneShotReservation(reservation, pool, state.ports, timing());

    expect(result).toMatchObject({
      outcome: 'failure',
      issue: { code: 'grant-qualified-one-shot-start-recovery-required', reason }
    });
    expect(state.events).toEqual([`lock:${pool.namespace}`, 'read-admission']);
  });

  it.each([
    ['foreign slot', { kind: 'foreign', reason: 'configuration-drift' }, 'slot-foreign'],
    ['different owner', {
      kind: 'owned',
      pmId: 19,
      pid: 4_300,
      status: 'online',
      metadata: {
        slotId: { kind: 'one-shot-slot-id', value: 'nebular-one-shot:01' },
        attemptId: unwrapBroker(parseProcessAttemptId('other-attempt')),
        metadataDigest: 'c'.repeat(64),
        startedAtMs: 1_000,
        deadlineAtMs: 10_000
      },
      cleanupProof: 'unconfirmed'
    }, 'slot-ownership-drift'],
    ['retired terminal', null, 'terminal-retired']
  ] as const)('fails typed recovery for %s without preparing or starting', async (_label, occupant, reason) => {
    const pool = poolFixture();
    const reservation = reservationFixture(pool);
    const observations = occupant === null
      ? exactOwned(reservation, pool, 'stopped', { exitCode: 0, cleanupProof: 'confirmed' })
      : pool.slots.map(slot => sameSlot(slot.slotId.value, reservation.slot.slotId.value)
        ? { ...slot, occupant }
        : { ...slot, occupant: { kind: 'empty' as const } });
    const state = harness(reservation, [observations]);
    const result = await startGrantQualifiedOneShotReservation(reservation, pool, state.ports, timing());

    expect(result).toMatchObject({
      outcome: 'failure',
      issue: { code: 'grant-qualified-one-shot-start-recovery-required', reason }
    });
    expect(state.prepareExactStart).not.toHaveBeenCalled();
    expect(state.startExact).not.toHaveBeenCalled();
  });

  it('polls within a fixed bound and confirms a fast exact terminal result after start', async () => {
    const pool = poolFixture();
    const reservation = reservationFixture(pool);
    const waits: string[] = [];
    const state = harness(reservation, [
      emptyInventory(pool),
      emptyInventory(pool),
      exactOwned(reservation, pool, 'errored', { exitCode: 23 })
    ]);
    const result = await startGrantQualifiedOneShotReservation(
      reservation,
      pool,
      state.ports,
      timing(waits)
    );

    expect(result).toMatchObject({
      outcome: 'success',
      value: {
        state: 'exact-terminal-confirmed',
        disposition: 'started',
        receiverStatus: 'errored',
        exitCode: 23
      }
    });
    expect(waits).toEqual(['wait']);
    expect(state.startExact).toHaveBeenCalledOnce();
  });

  it('fails recovery after the exact bounded confirmation budget is exhausted', async () => {
    const pool = poolFixture();
    const reservation = reservationFixture(pool);
    const waits: string[] = [];
    const state = harness(reservation, [emptyInventory(pool)]);
    const result = await startGrantQualifiedOneShotReservation(
      reservation,
      pool,
      state.ports,
      timing(waits)
    );

    expect(result).toMatchObject({
      outcome: 'failure',
      issue: {
        code: 'grant-qualified-one-shot-start-recovery-required',
        reason: 'confirmation-exhausted'
      }
    });
    expect(state.startExact).toHaveBeenCalledOnce();
    expect(waits).toHaveLength(2);
    expect(state.events.filter(event => event === 'observe')).toHaveLength(4);
  });

  it('lets exact observation win when startExact reports failure after applying', async () => {
    const pool = poolFixture();
    const reservation = reservationFixture(pool);
    const state = harness(
      reservation,
      [emptyInventory(pool), exactOwned(reservation, pool)],
      undefined,
      success(undefined),
      {
        outcome: 'failure',
        issue: {
          code: 'pm2-operation-failed',
          operation: 'start-exact',
          safeMessage: 'private receiver canary'
        }
      }
    );
    const result = await startGrantQualifiedOneShotReservation(reservation, pool, state.ports, timing());

    expect(result).toMatchObject({ outcome: 'success', value: { disposition: 'started' } });
    expect(JSON.stringify(result)).not.toContain('private receiver canary');
  });

  it('fails stale before effects and rechecks the deadline after taking the lock', async () => {
    const pool = poolFixture();
    const reservation = reservationFixture(pool);
    const initial = harness(reservation, [emptyInventory(pool)]);
    const initialResult = await startGrantQualifiedOneShotReservation(
      reservation,
      pool,
      initial.ports,
      timing([], () => 10_000)
    );
    const instants = [2_000, 10_000];
    const locked = harness(reservation, [emptyInventory(pool)]);
    const lockedResult = await startGrantQualifiedOneShotReservation(
      reservation,
      pool,
      locked.ports,
      timing([], () => instants.shift() ?? 10_000)
    );

    expect(initialResult).toMatchObject({
      outcome: 'failure',
      issue: { code: 'grant-qualified-one-shot-start-authority-stale' }
    });
    expect(initial.events).toEqual([]);
    expect(lockedResult).toMatchObject({
      outcome: 'failure',
      issue: { code: 'grant-qualified-one-shot-start-authority-stale' }
    });
    expect(locked.events).toEqual([`lock:${pool.namespace}`, 'read-admission']);
  });

  it('rejects a malformed reservation digest before locking', async () => {
    const pool = poolFixture();
    const reservation = reservationFixture(pool);
    const state = harness(reservation, [emptyInventory(pool)]);
    const malformed = {
      ...reservation,
      exactReservationDigest: {
        ...reservation.exactReservationDigest,
        value: `sha256:${'f'.repeat(64)}`
      }
    };
    const result = await startGrantQualifiedOneShotReservation(malformed, pool, state.ports, timing());

    expect(result).toMatchObject({
      outcome: 'failure',
      issue: { code: 'grant-qualified-one-shot-start-invalid' }
    });
    expect(state.events).toEqual([]);
  });

  it('refuses to reacquire any namespace other than the one digest-bound at reservation', async () => {
    const pool = poolFixture();
    const reservation = reservationFixture(pool);
    const state = harness(reservation, [emptyInventory(pool)]);
    const result = await startGrantQualifiedOneShotReservation(
      reservation,
      { ...pool, namespace: 'different-pool' },
      state.ports,
      timing()
    );

    expect(result).toMatchObject({
      outcome: 'failure',
      issue: { code: 'grant-qualified-one-shot-start-invalid' }
    });
    expect(state.events).toEqual([]);
  });

  it('exposes bounded production timing without granting any launch effect', () => {
    const defaults = createSystemGrantQualifiedOneShotStartTiming();
    expect(defaults.confirmationAttempts).toBeGreaterThan(0);
    expect(defaults.confirmationIntervalMs).toBeGreaterThanOrEqual(0);
  });
});
