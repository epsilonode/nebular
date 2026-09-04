import { describe, expect, it } from 'vitest';

import { parseProcessAttemptId, type ProcessAttemptId } from './primitives.ts';
import type { BrokerResult } from './result.ts';
import {
  createOneShotSlotPool,
  oneShotAttemptHandle,
  planOneShotReconciliation,
  planOneShotSlotAllocation,
  planOneShotSlotSelection,
  summarizeOneShotSlot,
  validateOneShotAttempt,
  validateOneShotSlotInventory,
  type OneShotCleanupProof,
  type OneShotObservedStatus,
  type OneShotOwnershipMetadata,
  type OneShotSlotDefinition,
  type OneShotSlotObservation,
  type OneShotSlotPool
} from './one-shot-slots.ts';

const unwrapBroker = <Value>(result: BrokerResult<Value>): Value => {
  if (result.isErr()) throw new Error('invalid primitive fixture');
  return result.value;
};

const attempt = (value: string): ProcessAttemptId => unwrapBroker(parseProcessAttemptId(value));

const pool = (capacity = 2): OneShotSlotPool => {
  const result = createOneShotSlotPool('nebular-one-shot', capacity);
  if (result.outcome === 'failure') throw new Error(result.issue.code);
  return result.value;
};

const slotAt = (target: OneShotSlotPool, index: number): OneShotSlotDefinition => {
  const found = target.slots.at(index);
  if (found === undefined) throw new Error('slot fixture missing');
  return found;
};

const metadata = (
  slot: OneShotSlotDefinition,
  attemptId: string,
  digest = 'a'.repeat(64),
  deadlineAtMs = 2_000
): OneShotOwnershipMetadata => ({
  slotId: slot.slotId,
  attemptId: attempt(attemptId),
  metadataDigest: digest,
  startedAtMs: 1_000,
  deadlineAtMs
});

const empty = (slot: OneShotSlotDefinition): OneShotSlotObservation => ({
  ...slot,
  occupant: { kind: 'empty' }
});

const owned = (
  slot: OneShotSlotDefinition,
  attemptId: string,
  status: OneShotObservedStatus,
  cleanupProof: OneShotCleanupProof,
  digest = 'a'.repeat(64),
  deadlineAtMs = 2_000,
  pmId = 7
): OneShotSlotObservation => ({
  ...slot,
  occupant: {
    kind: 'owned',
    pmId,
    pid: status === 'online' ? 51 : null,
    status,
    metadata: metadata(slot, attemptId, digest, deadlineAtMs),
    cleanupProof
  }
});

const withMetadata = (
  observation: OneShotSlotObservation,
  replacement: OneShotOwnershipMetadata
): OneShotSlotObservation => {
  if (observation.occupant.kind !== 'owned') throw new Error('owned fixture required');
  return { ...observation, occupant: { ...observation.occupant, metadata: replacement } };
};

describe('reusable one-shot slot algebra', () => {
  it('constructs only bounded stable slot identities', () => {
    const result = createOneShotSlotPool('nebular-one-shot', 3);
    expect(result).toEqual({
      outcome: 'success',
      value: {
        namespace: 'nebular-one-shot',
        slots: [
          {
            slotId: { kind: 'one-shot-slot-id', value: 'nebular-one-shot:00' },
            processName: { kind: 'one-shot-process-name', value: 'nebular-one-shot-00' }
          },
          {
            slotId: { kind: 'one-shot-slot-id', value: 'nebular-one-shot:01' },
            processName: { kind: 'one-shot-process-name', value: 'nebular-one-shot-01' }
          },
          {
            slotId: { kind: 'one-shot-slot-id', value: 'nebular-one-shot:02' },
            processName: { kind: 'one-shot-process-name', value: 'nebular-one-shot-02' }
          }
        ]
      }
    });
    expect(createOneShotSlotPool('Bad Namespace', 1)).toEqual({
      outcome: 'failure', issue: { code: 'slot-namespace-invalid', namespace: 'Bad Namespace' }
    });
    expect(createOneShotSlotPool('nebular-one-shot', 0)).toEqual({
      outcome: 'failure', issue: { code: 'slot-capacity-invalid', capacity: 0 }
    });
  });

  it('rejects missing, duplicate, unexpected, identity-drifted, and metadata-drifted inventory', () => {
    const target = pool();
    const first = slotAt(target, 0);
    const second = slotAt(target, 1);
    expect(validateOneShotSlotInventory(target, [empty(first)])).toMatchObject({
      outcome: 'failure', issue: { code: 'slot-inventory-missing', slotId: second.slotId }
    });
    expect(validateOneShotSlotInventory(target, [empty(first), empty(first), empty(second)])).toMatchObject({
      outcome: 'failure', issue: { code: 'slot-inventory-duplicate', slotId: first.slotId }
    });
    const otherPool = createOneShotSlotPool('other-one-shot', 1);
    if (otherPool.outcome === 'failure') throw new Error('other slot fixture missing');
    const other = slotAt(otherPool.value, 0);
    expect(validateOneShotSlotInventory(target, [empty(first), empty(other)])).toMatchObject({
      outcome: 'failure', issue: { code: 'slot-inventory-unexpected' }
    });
    expect(validateOneShotSlotInventory(target, [
      { ...empty(first), processName: second.processName }, empty(second)
    ])).toMatchObject({ outcome: 'failure', issue: { code: 'slot-identity-mismatch' } });
    expect(validateOneShotSlotInventory(target, [
      withMetadata(owned(first, 'attempt-1', 'online', 'unconfirmed'), metadata(second, 'attempt-1')),
      empty(second)
    ])).toMatchObject({ outcome: 'failure', issue: { code: 'slot-metadata-mismatch' } });
  });

  it('rejects the same attempt observed in more than one slot', () => {
    const target = pool();
    const first = slotAt(target, 0);
    const second = slotAt(target, 1);
    expect(validateOneShotSlotInventory(target, [
      owned(first, 'attempt-1', 'online', 'unconfirmed'),
      owned(second, 'attempt-1', 'online', 'unconfirmed')
    ])).toMatchObject({ outcome: 'failure', issue: { code: 'attempt-observed-more-than-once' } });
  });

  it('makes exact same-attempt retries idempotent only while active and metadata-identical', () => {
    const target = pool(1);
    const slot = slotAt(target, 0);
    const observation = owned(slot, 'attempt-1', 'online', 'unconfirmed');
    expect(planOneShotSlotAllocation(target, [observation], {
      attemptId: attempt('attempt-1'), metadataDigest: 'a'.repeat(64)
    }, 1_500)).toEqual({
      outcome: 'success',
      value: {
        kind: 'confirm-existing',
        handle: oneShotAttemptHandle(observation),
        startedAtMs: 1_000
      }
    });
    expect(planOneShotSlotAllocation(target, [observation], {
      attemptId: attempt('attempt-1'), metadataDigest: 'b'.repeat(64)
    }, 1_500)).toMatchObject({ outcome: 'failure', issue: { code: 'attempt-metadata-conflict' } });
    expect(planOneShotSlotAllocation(target, [owned(slot, 'attempt-1', 'stopped', 'confirmed')], {
      attemptId: attempt('attempt-1'), metadataDigest: 'a'.repeat(64)
    }, 1_500)).toMatchObject({ outcome: 'failure', issue: { code: 'attempt-retired' } });
  });

  it('selects a stable slot before slot-dependent metadata is finalized', () => {
    const target = pool();
    const first = slotAt(target, 0);
    const second = slotAt(target, 1);
    expect(planOneShotSlotSelection(target, [
      owned(first, 'attempt-live', 'online', 'unconfirmed'), empty(second)
    ], { attemptId: attempt('attempt-new') }, 1_500)).toEqual({
      outcome: 'success',
      value: { kind: 'claim-empty', slot: second }
    });

    const existing = owned(second, 'attempt-retry', 'launching', 'unconfirmed', 'b'.repeat(64), 2_500, 8);
    expect(planOneShotSlotSelection(target, [empty(first), existing], {
      attemptId: attempt('attempt-retry')
    }, 1_500)).toEqual({
      outcome: 'success',
      value: {
        kind: 'confirm-existing',
        handle: oneShotAttemptHandle(existing),
        startedAtMs: 1_000
      }
    });
  });

  it('prefers an empty slot, then only a terminal slot with confirmed cleanup', () => {
    const target = pool();
    const first = slotAt(target, 0);
    const second = slotAt(target, 1);
    const request = { attemptId: attempt('attempt-new'), metadataDigest: 'b'.repeat(64) };
    expect(planOneShotSlotAllocation(target, [
      owned(first, 'attempt-old', 'stopped', 'confirmed'), empty(second)
    ], request, 1_500)).toMatchObject({ outcome: 'success', value: { kind: 'claim-empty', slot: second } });
    expect(planOneShotSlotAllocation(target, [
      owned(first, 'attempt-old', 'stopped', 'confirmed'),
      owned(second, 'attempt-live', 'online', 'unconfirmed')
    ], request, 1_500)).toMatchObject({
      outcome: 'success', value: { kind: 'replace-terminal', slot: first }
    });
  });

  it('does not infer cleanup from expiration, terminal status, or unknown status', () => {
    const target = pool(3);
    const first = slotAt(target, 0);
    const second = slotAt(target, 1);
    const third = slotAt(target, 2);
    const result = planOneShotSlotAllocation(target, [
      owned(first, 'attempt-expired', 'online', 'unconfirmed', 'a'.repeat(64), 1_200),
      owned(second, 'attempt-terminal', 'stopped', 'unconfirmed'),
      owned(third, 'attempt-unknown', 'unknown', 'confirmed')
    ], { attemptId: attempt('attempt-new'), metadataDigest: 'b'.repeat(64) }, 1_500);
    expect(result).toMatchObject({
      outcome: 'failure',
      issue: {
        code: 'slot-capacity-busy',
        slots: [
          { state: 'expired-unreconciled' },
          { state: 'terminal-cleanup-unconfirmed' },
          { state: 'indeterminate' }
        ]
      }
    });
  });

  it('rejects namespace conflicts before considering capacity', () => {
    const target = pool(1);
    const slot = slotAt(target, 0);
    expect(planOneShotSlotAllocation(target, [{
      ...slot,
      occupant: { kind: 'foreign', reason: 'missing-ownership-metadata' }
    }], { attemptId: attempt('attempt-new'), metadataDigest: 'b'.repeat(64) }, 1_500)).toMatchObject({
      outcome: 'failure', issue: { code: 'slot-namespace-conflict', slotId: slot.slotId }
    });
  });

  it('rejects stale handles when attempt, digest, or PM2 identity changes', () => {
    const target = pool(1);
    const slot = slotAt(target, 0);
    const original = owned(slot, 'attempt-old', 'online', 'unconfirmed');
    const handle = oneShotAttemptHandle(original);
    if (handle === undefined) throw new Error('fixture handle missing');
    [
      owned(slot, 'attempt-new', 'online', 'unconfirmed'),
      owned(slot, 'attempt-old', 'online', 'unconfirmed', 'b'.repeat(64)),
      owned(slot, 'attempt-old', 'online', 'unconfirmed', 'a'.repeat(64), 2_000, 8)
    ].forEach(observation => expect(validateOneShotAttempt(target, [observation], handle)).toMatchObject({
      outcome: 'failure', issue: { code: 'attempt-retired', handle }
    }));
  });

  it('plans exact reconciliation only for online attempts past their deadline', () => {
    const target = pool();
    const first = slotAt(target, 0);
    const second = slotAt(target, 1);
    const result = planOneShotReconciliation(target, [
      owned(first, 'attempt-expired', 'online', 'unconfirmed', 'a'.repeat(64), 1_200),
      owned(second, 'attempt-live', 'online', 'unconfirmed', 'b'.repeat(64), 3_000)
    ], 1_500);
    expect(result).toMatchObject({
      outcome: 'success',
      value: [{ kind: 'request-expired-stop', deadlineAtMs: 1_200 }]
    });
    expect(summarizeOneShotSlot(owned(
      first, 'attempt-expired', 'online', 'unconfirmed', 'a'.repeat(64), 1_200
    ), 1_500).state).toBe('expired-unreconciled');
  });
});
