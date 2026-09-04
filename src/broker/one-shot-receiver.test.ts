import { describe, expect, it } from 'vitest';

import { parseProcessAttemptId, type ProcessAttemptId } from './primitives.ts';
import type { BrokerResult } from './result.ts';
import {
  allocateSlotAwareOneShotAttempt,
  type AdmittedOneShotLaunch,
  type ExactNameOneShotPorts,
  type OneShotLaunchAllocationPort,
  type SlotAwareOneShotLaunchFactory,
  type SlotAwareOneShotLaunchRequest
} from './one-shot-receiver.ts';
import {
  createOneShotSlotPool,
  type OneShotOwnershipMetadata,
  type OneShotResult,
  type OneShotSlotDefinition,
  type OneShotSlotObservation,
  type OneShotSlotPool
} from './one-shot-slots.ts';

type TestPayload = Readonly<{ selectedSlot: string }>;

const success = <Value, Issue = never>(value: Value): OneShotResult<Value, Issue> => ({ outcome: 'success', value });
const failure = <Value = never, Issue = never>(issue: Issue): OneShotResult<Value, Issue> => ({
  outcome: 'failure',
  issue
});

const unwrapBroker = <Value>(result: BrokerResult<Value>): Value => {
  if (result.isErr()) throw new Error('invalid primitive fixture');
  return result.value;
};

const attempt = (value: string): ProcessAttemptId => unwrapBroker(parseProcessAttemptId(value));

const pool = (): OneShotSlotPool => {
  const created = createOneShotSlotPool('nebular-one-shot', 2);
  if (created.outcome === 'failure') throw new Error(created.issue.code);
  return created.value;
};

const slotAt = (target: OneShotSlotPool, index: number): OneShotSlotDefinition => {
  const slot = target.slots.at(index);
  if (slot === undefined) throw new Error('slot fixture missing');
  return slot;
};

const metadata = (
  slot: OneShotSlotDefinition,
  attemptId: ProcessAttemptId,
  metadataDigest: string
): OneShotOwnershipMetadata => ({
  slotId: slot.slotId,
  attemptId,
  metadataDigest,
  startedAtMs: 1_000,
  deadlineAtMs: 2_000
});

const empty = (slot: OneShotSlotDefinition): OneShotSlotObservation => ({
  ...slot,
  occupant: { kind: 'empty' }
});

const owned = (
  slot: OneShotSlotDefinition,
  attemptId: ProcessAttemptId,
  metadataDigest: string,
  status: 'online' | 'launching' | 'stopped' = 'online',
  pmId = 41
): OneShotSlotObservation => ({
  ...slot,
  occupant: {
    kind: 'owned',
    pmId,
    pid: status === 'stopped' ? null : 71,
    status,
    metadata: metadata(slot, attemptId, metadataDigest),
    cleanupProof: status === 'stopped' ? 'confirmed' : 'unconfirmed'
  }
});

const launchFor = (
  attemptId: ProcessAttemptId,
  slot: OneShotSlotDefinition,
  metadataDigest: string
): AdmittedOneShotLaunch<TestPayload> => ({
  attemptId,
  metadataDigest,
  startedAtMs: 1_000,
  deadlineAtMs: 2_000,
  payload: { selectedSlot: slot.slotId.value }
});

const requestFor = (attemptId: ProcessAttemptId): SlotAwareOneShotLaunchRequest => ({
  attemptId,
  observedAtMs: 1_000
});

describe('slot-aware one-shot receiver allocation', () => {
  it('finalizes a multi-slot payload only after selecting the exact empty slot', async () => {
    const target = pool();
    const first = slotAt(target, 0);
    const second = slotAt(target, 1);
    const requestedAttempt = attempt('attempt-new');
    const digest = 'b'.repeat(64);
    const events: string[] = [];
    let observations: readonly OneShotSlotObservation[] = [
      owned(first, attempt('attempt-live'), 'a'.repeat(64)),
      empty(second)
    ];
    const ports: ExactNameOneShotPorts<TestPayload> = {
      probe: async () => success(undefined),
      withAllocationLock: async (_namespace, work) => {
        events.push('lock');
        const result = await work();
        events.push('unlock');
        return result;
      },
      observe: async () => success(observations),
      startExact: async start => {
        events.push(`start:${start.slot.slotId.value}`);
        observations = observations.map(observation => observation.slotId.value === start.slot.slotId.value
          ? {
              ...start.slot,
              occupant: {
                kind: 'owned' as const,
                pmId: 42,
                pid: 72,
                status: 'online' as const,
                metadata: start.metadata,
                cleanupProof: 'unconfirmed' as const
              }
            }
          : observation);
        return success(undefined);
      },
      stopExact: async () => success(undefined),
      deleteExact: async () => success(undefined)
    };
    const allocation: OneShotLaunchAllocationPort = {
      allocateLaunch: async reservation => {
        events.push(`reserve:${reservation.slot.slotId.value}`);
        return success(undefined);
      }
    };
    const factory: SlotAwareOneShotLaunchFactory<TestPayload> = {
      finalizeForSlot: slot => {
        events.push(`finalize:${slot.slotId.value}`);
        return success(launchFor(requestedAttempt, slot, digest));
      }
    };

    const result = await allocateSlotAwareOneShotAttempt(
      target,
      requestFor(requestedAttempt),
      factory,
      ports,
      allocation
    );

    expect(result).toMatchObject({
      outcome: 'success',
      value: {
        outcome: 'started',
        handle: { slotId: second.slotId, attemptId: requestedAttempt, metadataDigest: digest }
      }
    });
    expect(events).toEqual([
      'lock',
      `finalize:${second.slotId.value}`,
      `reserve:${second.slotId.value}`,
      `start:${second.slotId.value}`,
      'unlock'
    ]);
  });

  it('retries against the existing slot and requires its exact finalized digest', async () => {
    const target = pool();
    const first = slotAt(target, 0);
    const second = slotAt(target, 1);
    const requestedAttempt = attempt('attempt-retry');
    const digest = 'b'.repeat(64);
    const finalizedSlots: string[] = [];
    const observations: readonly OneShotSlotObservation[] = [
      owned(first, attempt('attempt-other'), 'a'.repeat(64)),
      owned(second, requestedAttempt, digest, 'launching', 42)
    ];
    const ports: ExactNameOneShotPorts<TestPayload> = {
      probe: async () => success(undefined),
      withAllocationLock: async (_namespace, work) => work(),
      observe: async () => success(observations),
      startExact: async () => failure({
        code: 'pm2-operation-failed',
        operation: 'start-exact',
        safeMessage: 'unexpected start'
      }),
      stopExact: async () => success(undefined),
      deleteExact: async () => success(undefined)
    };
    const allocation: OneShotLaunchAllocationPort = {
      allocateLaunch: async () => failure({
        code: 'launch-allocation-failed',
        safeMessage: 'unexpected reservation'
      })
    };
    const finalize = (metadataDigest: string): SlotAwareOneShotLaunchFactory<TestPayload> => ({
      finalizeForSlot: slot => {
        finalizedSlots.push(slot.slotId.value);
        return success(launchFor(requestedAttempt, slot, metadataDigest));
      }
    });

    const retried = await allocateSlotAwareOneShotAttempt(
      target,
      requestFor(requestedAttempt),
      finalize(digest),
      ports,
      allocation
    );
    const drifted = await allocateSlotAwareOneShotAttempt(
      target,
      requestFor(requestedAttempt),
      finalize('c'.repeat(64)),
      ports,
      allocation
    );

    expect(retried).toMatchObject({
      outcome: 'success',
      value: {
        outcome: 'already-started',
        handle: { slotId: second.slotId, metadataDigest: digest }
      }
    });
    expect(drifted).toEqual({
      outcome: 'failure',
      issue: { code: 'attempt-metadata-conflict', attemptId: requestedAttempt }
    });
    expect(finalizedSlots).toEqual([second.slotId.value, second.slotId.value]);
  });

  it('fails a typed finalizer before deleting, reserving, or starting a reusable slot', async () => {
    const target = pool();
    const first = slotAt(target, 0);
    const second = slotAt(target, 1);
    const requestedAttempt = attempt('attempt-new');
    const mutations: string[] = [];
    const ports: ExactNameOneShotPorts<TestPayload> = {
      probe: async () => success(undefined),
      withAllocationLock: async (_namespace, work) => work(),
      observe: async () => success([
        owned(first, attempt('attempt-retired'), 'a'.repeat(64), 'stopped'),
        owned(second, attempt('attempt-live'), 'b'.repeat(64))
      ]),
      startExact: async () => {
        mutations.push('start');
        return success(undefined);
      },
      stopExact: async () => success(undefined),
      deleteExact: async () => {
        mutations.push('delete');
        return success(undefined);
      }
    };
    const allocation: OneShotLaunchAllocationPort = {
      allocateLaunch: async () => {
        mutations.push('reserve');
        return success(undefined);
      }
    };
    const factory: SlotAwareOneShotLaunchFactory<TestPayload> = {
      finalizeForSlot: () => failure({
        code: 'one-shot-launch-factory-failed',
        safeMessage: 'fixture detail is discarded'
      })
    };

    const result = await allocateSlotAwareOneShotAttempt(
      target,
      requestFor(requestedAttempt),
      factory,
      ports,
      allocation
    );

    expect(result).toEqual({
      outcome: 'failure',
      issue: {
        code: 'one-shot-launch-factory-failed',
        safeMessage: 'The slot-aware launch finalizer failed closed.'
      }
    });
    expect(mutations).toEqual([]);
  });

  it('maps a thrown finalizer to the same redacted typed failure', async () => {
    const target = pool();
    const requestedAttempt = attempt('attempt-new');
    const ports: ExactNameOneShotPorts<TestPayload> = {
      probe: async () => success(undefined),
      withAllocationLock: async (_namespace, work) => work(),
      observe: async () => success(target.slots.map(empty)),
      startExact: async () => success(undefined),
      stopExact: async () => success(undefined),
      deleteExact: async () => success(undefined)
    };
    const allocation: OneShotLaunchAllocationPort = { allocateLaunch: async () => success(undefined) };
    const factory: SlotAwareOneShotLaunchFactory<TestPayload> = {
      finalizeForSlot: () => {
        throw new Error('sensitive adapter detail');
      }
    };

    const result = await allocateSlotAwareOneShotAttempt(
      target,
      requestFor(requestedAttempt),
      factory,
      ports,
      allocation
    );

    expect(result).toEqual({
      outcome: 'failure',
      issue: {
        code: 'one-shot-launch-factory-failed',
        safeMessage: 'The slot-aware launch finalizer failed closed.'
      }
    });
  });
});
