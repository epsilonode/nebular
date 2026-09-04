import { describe, expect, it, vi } from 'vitest';

import {
  deriveGrantQualifiedOneShotReservationDigest,
  type GrantQualifiedOneShotReservation,
  type OneShotMaterializationReceiverIdentity
} from './one-shot-materialization-reservation.ts';
import {
  parseCheckedInRecipeLocator,
  parseJournalOperationId,
  parseReceiverCorrelation,
  parseReceiverEntryIdentity,
  parseRedactedPlanDigest
} from './journal.ts';
import type { Pm2OneShotLaunchPayload } from './pm2-exact-name-receiver.ts';
import {
  parseCanonicalRepository,
  parseCredentialSlotId,
  parseGrantId,
  parseProcessAttemptId,
  parseReceiverId,
  parseRecipeRevision
} from './primitives.ts';
import type { GrantQualifiedOneShotStartOutcome } from './grant-qualified-one-shot-start.ts';
import {
  waitForGrantQualifiedOneShotTerminal,
  type GrantQualifiedOneShotTerminalWaitPorts
} from './grant-qualified-one-shot-terminal-observer.ts';
import { createOneShotSlotPool, type OneShotSlotObservation } from './one-shot-slots.ts';

const poolResult = createOneShotSlotPool('nebular-one-shot', 1);
if (poolResult.outcome === 'failure') throw new Error('invalid terminal observer pool fixture');
const pool = poolResult.value;
const slot = pool.slots[0];
if (slot === undefined) throw new Error('missing terminal observer slot fixture');

const unwrapBroker = <Value>(result: Readonly<{
  isErr: () => boolean;
  value?: Value;
}>): Value => {
  if (result.isErr() || result.value === undefined) throw new Error('invalid terminal observer fixture');
  return result.value;
};

const unwrapJournal = <Value>(result: Readonly<{
  type: 'ok';
  value: Value;
}> | Readonly<{ type: 'err' }>): Value => {
  if (result.type === 'err') throw new Error('invalid terminal observer journal fixture');
  return result.value;
};

const attemptId = unwrapBroker(parseProcessAttemptId('one-shot-v1-terminal-observer'));
const metadataDigest = 'a'.repeat(64);
const handle = {
  slotId: slot.slotId,
  processName: slot.processName,
  attemptId,
  metadataDigest,
  pmId: 7
};

const reservation = (() => {
  const reserveOperationId = unwrapJournal(parseJournalOperationId('reserve-terminal-1'));
  const materializeOperationId = unwrapJournal(parseJournalOperationId('materialize-terminal-1'));
  const slotIndependentPlanDigest = unwrapJournal(parseRedactedPlanDigest(`sha256:${'b'.repeat(64)}`));
  const repository = unwrapBroker(parseCanonicalRepository('R:\\Code\\fixture'));
  const recipeRevision = unwrapBroker(parseRecipeRevision('revision-terminal-1'));
  const planDigest = unwrapJournal(parseRedactedPlanDigest(metadataDigest));
  const receiverId = unwrapBroker(parseReceiverId('pm2'));
  const receiverEntryIdentity = unwrapJournal(
    parseReceiverEntryIdentity(`pm2-entry:${slot.processName.value}`)
  );
  const receiverCorrelation = unwrapJournal(parseReceiverCorrelation('receiver-terminal-1'));
  const grantId = unwrapBroker(parseGrantId('grant-terminal-1'));
  const credentialSlotId = unwrapBroker(parseCredentialSlotId('provider'));
  const recipeLocator = unwrapJournal(parseCheckedInRecipeLocator('recipe.xml'));
  const receiver: OneShotMaterializationReceiverIdentity = {
    receiverId,
    receiverEntryIdentity,
    receiverCorrelation
  };
  const candidate = {
  state: 'materializing-reserved',
  status: 'committed',
  allocationNamespace: pool.namespace,
  identity: {
    attemptId,
    reserveOperationId,
    materializeOperationId,
    slotIndependentPlanDigest
  },
  slot,
  receiver,
  exactReservationDigest: unwrapJournal(parseRedactedPlanDigest(`sha256:${'c'.repeat(64)}`)),
  attempt: {
    id: attemptId,
    reserveOperationId,
    repository,
    recipeRevision,
    planDigest,
    lifecycle: 'one-shot',
    receiverCorrelation,
    state: 'materializing',
    stateVersion: 2,
    createdAtMs: 1_000,
    updatedAtMs: 1_000,
    bootstrapBinding: null
  },
  authority: {
    grantId,
    grantGeneration: 1,
    repository,
    recipeRevision,
    credentialSlotIds: [credentialSlotId],
    grantExpiresAtMs: 10_000
  },
  admission: {
    format: 'grant-qualified-launch-admission/v1',
    bindingGeneration: 1,
    receiverId,
    receiverSlotIdentity: slot.slotId.value,
    receiverProcessName: slot.processName.value,
    receiverEntryIdentity,
    recipeLocator,
    slotIndependentPlanDigest,
    launchMetadataDigest: metadataDigest,
    deadlineAtMs: 5_000
  },
  launch: {
    attemptId,
    metadataDigest,
    startedAtMs: 1_000,
    deadlineAtMs: 5_000,
    payload: {} as Pm2OneShotLaunchPayload
  }
  } satisfies GrantQualifiedOneShotReservation<Pm2OneShotLaunchPayload>;
  const digest = deriveGrantQualifiedOneShotReservationDigest(
    candidate.identity,
    candidate.allocationNamespace,
    candidate.slot,
    candidate.receiver,
    candidate.launch
  );
  if (digest.outcome === 'failure') throw new Error('invalid terminal observer reservation digest');
  return { ...candidate, exactReservationDigest: digest.value };
})();

const activeStart: GrantQualifiedOneShotStartOutcome = {
  state: 'exact-start-confirmed',
  disposition: 'started',
  handle,
  processId: 4_100,
  receiverStatus: 'online'
};

const observation = (
  status: 'online' | 'stopped' | 'errored',
  exitCode?: number
): readonly OneShotSlotObservation[] => [{
  ...slot,
  occupant: {
    kind: 'owned',
    pmId: handle.pmId,
    pid: status === 'online' ? 4_100 : null,
    status,
    ...(exitCode === undefined ? {} : { exitCode }),
    metadata: {
      slotId: slot.slotId,
      attemptId,
      metadataDigest,
      startedAtMs: 1_000,
      deadlineAtMs: 5_000
    },
    cleanupProof: 'unconfirmed'
  }
}];

const ports = (observations: readonly (readonly OneShotSlotObservation[])[]) => {
  let nowMs = 1_100;
  let index = 0;
  const runtime: GrantQualifiedOneShotTerminalWaitPorts = {
    observe: () => Promise.resolve({
      outcome: 'success',
      value: observations[Math.min(index++, observations.length - 1)] ?? observation('online')
    }),
    now: () => nowMs,
    wait: milliseconds => {
      nowMs += milliseconds;
      return Promise.resolve();
    }
  };
  return { runtime, now: () => nowMs };
};

describe('grant-qualified one-shot terminal observer', () => {
  it('waits through exact active facts and returns only a terminal exit projection', async () => {
    const fixture = ports([observation('online'), observation('stopped', 0)]);
    const result = await waitForGrantQualifiedOneShotTerminal(
      reservation,
      pool,
      activeStart,
      new AbortController().signal,
      fixture.runtime,
      { pollIntervalMs: 25, maximumConsecutiveObserveFailures: 3 }
    );

    expect(result).toEqual({
      outcome: 'success',
      value: {
        state: 'exact-terminal-observed',
        handle,
        receiverStatus: 'stopped',
        exitCode: 0
      }
    });
    expect(fixture.now()).toBe(1_125);
  });

  it('projects abort and deadline as exact cancellation requirements', async () => {
    const cancelled = new AbortController();
    cancelled.abort();
    const fixture = ports([observation('online')]);
    await expect(waitForGrantQualifiedOneShotTerminal(
      reservation,
      pool,
      activeStart,
      cancelled.signal,
      fixture.runtime
    )).resolves.toEqual(expect.objectContaining({
      value: expect.objectContaining({ state: 'exact-cancellation-required', reason: 'control-cancelled' })
    }));

    const expiredPorts: GrantQualifiedOneShotTerminalWaitPorts = {
      ...fixture.runtime,
      now: () => 5_000
    };
    await expect(waitForGrantQualifiedOneShotTerminal(
      reservation,
      pool,
      activeStart,
      new AbortController().signal,
      expiredPorts
    )).resolves.toEqual(expect.objectContaining({
      value: expect.objectContaining({ state: 'exact-cancellation-required', reason: 'deadline-expired' })
    }));
  });

  it('fails typed on exact ownership drift and bounded receiver unavailability', async () => {
    const drifted = observation('online').map(item => ({
      ...item,
      occupant: item.occupant.kind === 'owned'
        ? { ...item.occupant, pmId: 8 }
        : item.occupant
    }));
    const drift = ports([drifted]);
    await expect(waitForGrantQualifiedOneShotTerminal(
      reservation,
      pool,
      activeStart,
      new AbortController().signal,
      drift.runtime
    )).resolves.toEqual(expect.objectContaining({
      issue: expect.objectContaining({ reason: 'slot-ownership-drift' })
    }));

    const unavailable: GrantQualifiedOneShotTerminalWaitPorts = {
      observe: vi.fn(() => Promise.resolve({
        outcome: 'failure' as const,
        issue: {
          code: 'pm2-receiver-unavailable' as const,
          operation: 'observe' as const,
          safeMessage: 'redacted'
        }
      })),
      now: () => 1_100,
      wait: () => Promise.resolve()
    };
    await expect(waitForGrantQualifiedOneShotTerminal(
      reservation,
      pool,
      activeStart,
      new AbortController().signal,
      unavailable,
      { pollIntervalMs: 1, maximumConsecutiveObserveFailures: 2 }
    )).resolves.toEqual(expect.objectContaining({
      issue: expect.objectContaining({ reason: 'receiver-observation-unavailable' })
    }));
    expect(unavailable.observe).toHaveBeenCalledTimes(2);
  });

  it('accepts an exact terminal start without another receiver effect', async () => {
    const fixture = ports([observation('online')]);
    const terminal: GrantQualifiedOneShotStartOutcome = {
      state: 'exact-terminal-confirmed',
      disposition: 'started',
      handle,
      receiverStatus: 'errored',
      exitCode: 9
    };
    const result = await waitForGrantQualifiedOneShotTerminal(
      reservation,
      pool,
      terminal,
      new AbortController().signal,
      fixture.runtime
    );

    expect(result).toEqual(expect.objectContaining({
      value: expect.objectContaining({ state: 'exact-terminal-observed', exitCode: 9 })
    }));
  });
});
