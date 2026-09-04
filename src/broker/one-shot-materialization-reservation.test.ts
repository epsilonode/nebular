import type { Result } from 'neverthrow';
import { win32 } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { parseBrokerRequestId } from '../broker-client/primitives.ts';
import {
  journalErr,
  journalOk,
  parseCheckedInRecipeLocator,
  type GrantQualifiedMaterializingAttemptRecord,
  type JournalIssueCode,
  type JournalMutation,
  type JournalResult,
  type ReserveGrantQualifiedMaterializingAttempt
} from './journal.ts';
import {
  deriveGrantQualifiedOneShotIdentity,
  reserveGrantQualifiedOneShotMaterialization,
  type GrantQualifiedOneShotLaunchFactory,
  type OneShotMaterializationReservationPorts
} from './one-shot-materialization-reservation.ts';
import {
  createOneShotSlotPool,
  type OneShotSlotDefinition,
  type OneShotSlotObservation,
  type OneShotSlotPool
} from './one-shot-slots.ts';
import {
  parseCanonicalRepository,
  parseCredentialSlotId,
  parseGrantId,
  parseProcessAttemptId,
  parseRecipeRevision
} from './primitives.ts';
import {
  canonicalRecipeMaterializationDigestInput,
  RECIPE_MATERIALIZATION_DIGEST_DOMAIN,
  RECIPE_MATERIALIZATION_PLAN_SCHEMA,
  type RecipeMaterializationPlan,
  validateRecipeMaterializationPlan
} from './recipe-materialization-plan.ts';
import type { BrokerResult } from './result.ts';

type MaterializationPlanBase = Omit<RecipeMaterializationPlan, 'redactedDigestInput'>;

type MutableReservationHarness = {
  current: GrantQualifiedMaterializingAttemptRecord | null;
  readonly commands: ReserveGrantQualifiedMaterializingAttempt[];
  readonly events: string[];
  reserveIssue: JournalIssueCode | null;
};

const unwrapResult = <Value>(result: Result<Value, unknown>): Value => {
  if (result.isErr()) throw new Error('invalid neverthrow fixture');
  return result.value;
};

const unwrapBroker = <Value>(result: BrokerResult<Value>): Value => {
  if (result.isErr()) throw new Error('invalid broker fixture');
  return result.value;
};

const unwrapJournal = <Value>(result: JournalResult<Value>): Value => {
  if (result.type === 'err') throw new Error('invalid journal fixture');
  return result.value;
};

const planFixture = (
  request = 'request-1',
  argv: readonly string[] = ['src/main.ts'],
  timeoutMs = 20_000
): RecipeMaterializationPlan => {
  const repository = unwrapBroker(parseCanonicalRepository('R:\\Code\\repository'));
  const workingDirectory = {
    kind: 'canonical-windows-working-directory' as const,
    value: 'R:\\Code\\repository',
    repository,
    relativePath: { kind: 'repository-relative-windows-directory' as const, value: '.' }
  };
  const targetRelativePath = argv[0] ?? '';
  const base: MaterializationPlanBase = {
    state: 'planned',
    schema: RECIPE_MATERIALIZATION_PLAN_SCHEMA,
    targetContract: 'windows-direct-cooperative-bun-v1',
    platform: 'win32',
    receiver: 'pm2',
    lifecycle: 'one-shot',
    stopPolicy: 'ephemeral-safe-to-stop',
    requestId: unwrapResult(parseBrokerRequestId(request)),
    repository,
    recipeLocator: unwrapJournal(parseCheckedInRecipeLocator('.nebular/recipes/app.xml')),
    recipeRevision: unwrapBroker(parseRecipeRevision('revision-1')),
    authority: {
      grantId: unwrapBroker(parseGrantId('grant-1')),
      grantGeneration: 3,
      grantExpiresAtMs: 10_000
    },
    declaredProcessName: 'app-once',
    tool: {
      kind: 'cooperative-bun-v1',
      executable: { kind: 'canonical-current-bun-executable', value: 'C:\\Tools\\bun.exe' },
      brokerEntrypoint: { kind: 'canonical-broker-entrypoint', value: 'R:\\Code\\nebular\\broker.js' }
    },
    workingDirectory,
    targetEntrypoint: {
      kind: 'canonical-windows-target-entrypoint',
      value: win32.join(workingDirectory.value, ...targetRelativePath.split('/')),
      repository,
      workingDirectory,
      relativePath: {
        kind: 'repository-relative-windows-target-entrypoint',
        value: targetRelativePath
      }
    },
    argv,
    timeoutMs,
    nonsecretEnvironment: [{ name: 'MODE', value: 'test' }],
    credentialSlots: [{
      slotId: unwrapBroker(parseCredentialSlotId('weather')),
      injectionName: 'WEATHER_KEY'
    }]
  };
  return {
    ...base,
    redactedDigestInput: {
      kind: 'redacted-recipe-materialization-digest-input',
      domain: RECIPE_MATERIALIZATION_DIGEST_DOMAIN,
      canonicalJson: canonicalRecipeMaterializationDigestInput(base).canonicalJson
    }
  };
};

const poolFixture = (): OneShotSlotPool => {
  const created = createOneShotSlotPool('nebular-one-shot', 2);
  if (created.outcome === 'failure') throw new Error('invalid pool fixture');
  return created.value;
};

const slotAt = (pool: OneShotSlotPool, index: number): OneShotSlotDefinition => {
  const slot = pool.slots.at(index);
  if (slot === undefined) throw new Error('missing slot fixture');
  return slot;
};

const empty = (slot: OneShotSlotDefinition): OneShotSlotObservation => ({
  ...slot,
  occupant: { kind: 'empty' }
});

const occupied = (slot: OneShotSlotDefinition, attemptId = 'other-attempt'): OneShotSlotObservation => ({
  ...slot,
  occupant: {
    kind: 'owned',
    pmId: 7,
    pid: 51,
    status: 'online',
    metadata: {
      slotId: slot.slotId,
      attemptId: unwrapBroker(parseProcessAttemptId(attemptId)),
      metadataDigest: 'd'.repeat(64),
      startedAtMs: 500,
      deadlineAtMs: 9_000
    },
    cleanupProof: 'unconfirmed'
  }
});

const materializingRecord = (
  command: ReserveGrantQualifiedMaterializingAttempt
): GrantQualifiedMaterializingAttemptRecord => ({
  attempt: {
    ...command.reservation.attempt,
    receiverCorrelation: command.materialization.receiverCorrelation,
    state: 'materializing',
    stateVersion: 2,
    updatedAtMs: command.materialization.atMs
  },
  authority: command.authority,
  admission: command.admission
});

const reserve = (
  harness: MutableReservationHarness,
  command: ReserveGrantQualifiedMaterializingAttempt
): JournalResult<JournalMutation<GrantQualifiedMaterializingAttemptRecord>> => {
  harness.events.push('reserve');
  harness.commands.push(command);
  if (harness.reserveIssue !== null) {
    return journalErr({ code: harness.reserveIssue, message: 'redacted journal failure' });
  }
  if (harness.current !== null && harness.current.admission.slotIndependentPlanDigest.value !==
      command.admission.slotIndependentPlanDigest.value) {
    return journalErr({ code: 'journal-conflict', message: 'redacted conflict' });
  }
  if (harness.current !== null) {
    return journalOk({ status: 'already-committed', record: harness.current });
  }
  const record = materializingRecord(command);
  harness.current = record;
  return journalOk({ status: 'committed', record });
};

const ports = (
  harness: MutableReservationHarness,
  observations: readonly OneShotSlotObservation[]
): OneShotMaterializationReservationPorts => ({
  withAllocationLock: (_namespace, work) => {
    harness.events.push('lock');
    return work();
  },
  observe: () => {
    harness.events.push('observe');
    return Promise.resolve({ outcome: 'success', value: observations });
  },
  attempts: {
    readGrantQualifiedMaterializing: () => {
      harness.events.push('read');
      return Promise.resolve(journalOk(harness.current));
    },
    reserveGrantQualifiedMaterializing: command => Promise.resolve(reserve(harness, command))
  }
});

const successfulFactory = (
  harness: MutableReservationHarness
): GrantQualifiedOneShotLaunchFactory<Readonly<{ slot: string }>> => ({
  finalizeForSlot: context => {
    harness.events.push(`finalize:${context.slot.slotId.value}`);
    return {
      outcome: 'success',
      value: {
        attemptId: context.identity.attemptId,
        metadataDigest: 'c'.repeat(64),
        startedAtMs: context.startedAtMs,
        deadlineAtMs: context.deadlineAtMs,
        payload: { slot: context.slot.slotId.value }
      }
    };
  }
});

const harness = (): MutableReservationHarness => ({
  current: null,
  commands: [],
  events: [],
  reserveIssue: null
});

describe('grant-qualified one-shot materialization reservation', () => {
  it('uses one shared validator for canonical target structure and digest integrity', () => {
    const valid = planFixture();
    const driftedBase: MaterializationPlanBase = {
      ...valid,
      targetEntrypoint: {
        ...valid.targetEntrypoint,
        value: 'R:\\Code\\repository\\elsewhere\\main.ts'
      }
    };
    const drifted: RecipeMaterializationPlan = {
      ...driftedBase,
      redactedDigestInput: canonicalRecipeMaterializationDigestInput(driftedBase)
    };
    const staleDigest: RecipeMaterializationPlan = {
      ...valid,
      redactedDigestInput: { ...valid.redactedDigestInput, canonicalJson: '[]' }
    };

    expect(validateRecipeMaterializationPlan(valid)).toBe(true);
    expect(validateRecipeMaterializationPlan(drifted)).toBe(false);
    expect(validateRecipeMaterializationPlan(staleDigest)).toBe(false);
    expect(deriveGrantQualifiedOneShotIdentity(drifted).outcome).toBe('failure');
  });

  it('uses request identity for stable operation ids and a slot-independent digest for plan drift', () => {
    const original = deriveGrantQualifiedOneShotIdentity(planFixture());
    const drifted = deriveGrantQualifiedOneShotIdentity(planFixture('request-1', ['src/other.ts']));
    const otherRequest = deriveGrantQualifiedOneShotIdentity(planFixture('request-2'));
    expect(original.outcome === 'success' && drifted.outcome === 'success' && otherRequest.outcome === 'success')
      .toBe(true);
    if (original.outcome === 'failure' || drifted.outcome === 'failure' || otherRequest.outcome === 'failure') return;
    expect(drifted.value.attemptId).toBe(original.value.attemptId);
    expect(drifted.value.reserveOperationId).toEqual(original.value.reserveOperationId);
    expect(drifted.value.materializeOperationId).toEqual(original.value.materializeOperationId);
    expect(drifted.value.slotIndependentPlanDigest).not.toEqual(original.value.slotIndependentPlanDigest);
    expect(otherRequest.value.attemptId).not.toBe(original.value.attemptId);
  });

  it('orders lock, durable read, observation, slot finalization, and one atomic journal write', async () => {
    const target = poolFixture();
    const state = harness();
    const result = await reserveGrantQualifiedOneShotMaterialization(
      planFixture(),
      1_000,
      target,
      successfulFactory(state),
      ports(state, [occupied(slotAt(target, 0)), empty(slotAt(target, 1))])
    );

    expect(result).toMatchObject({
      outcome: 'success',
      value: {
        state: 'materializing-reserved',
        status: 'committed',
        slot: slotAt(target, 1),
        launch: { startedAtMs: 1_000, deadlineAtMs: 10_000 }
      }
    });
    expect(state.events).toEqual([
      'lock',
      'read',
      'observe',
      `finalize:${slotAt(target, 1).slotId.value}`,
      'reserve'
    ]);
    expect(state.commands).toHaveLength(1);
    expect(state.commands[0]).toMatchObject({
      authorityCheckedAtMs: 1_000,
      authority: {
        grantId: 'grant-1',
        grantGeneration: 3,
        credentialSlotIds: ['weather'],
        grantExpiresAtMs: 10_000
      },
      admission: {
        receiverSlotIdentity: slotAt(target, 1).slotId.value,
        receiverProcessName: slotAt(target, 1).processName.value,
        deadlineAtMs: 10_000
      },
      reservation: { attempt: { state: 'reserved', stateVersion: 1 } },
      materialization: { expectedState: 'reserved', nextState: 'materializing' }
    });
  });

  it('reuses the durable slot, rejects same-request plan drift before effects, and maps stale authority', async () => {
    const target = poolFixture();
    const state = harness();
    const factory = successfulFactory(state);
    const first = await reserveGrantQualifiedOneShotMaterialization(
      planFixture(),
      1_000,
      target,
      factory,
      ports(state, [occupied(slotAt(target, 0)), empty(slotAt(target, 1))])
    );
    expect(first.outcome).toBe('success');

    const replay = await reserveGrantQualifiedOneShotMaterialization(
      planFixture(),
      1_500,
      target,
      factory,
      ports(state, [empty(slotAt(target, 0)), empty(slotAt(target, 1))])
    );
    expect(replay).toMatchObject({
      outcome: 'success',
      value: { status: 'already-committed', slot: slotAt(target, 1) }
    });
    const eventCount = state.events.length;
    const commandCount = state.commands.length;
    const drift = await reserveGrantQualifiedOneShotMaterialization(
      planFixture('request-1', ['src/other.ts']),
      1_600,
      target,
      factory,
      ports(state, [empty(slotAt(target, 0)), empty(slotAt(target, 1))])
    );
    expect(drift).toMatchObject({
      outcome: 'failure',
      issue: { code: 'one-shot-materialization-journal-failed', journalCode: 'journal-conflict' }
    });
    expect(state.events.slice(eventCount)).toEqual(['lock', 'read']);
    expect(state.commands).toHaveLength(commandCount);

    state.reserveIssue = 'journal-authority-stale';
    const stale = await reserveGrantQualifiedOneShotMaterialization(
      planFixture(),
      1_700,
      target,
      factory,
      ports(state, [empty(slotAt(target, 0)), empty(slotAt(target, 1))])
    );
    expect(stale).toMatchObject({
      outcome: 'failure',
      issue: { code: 'one-shot-materialization-authority-stale', action: 'cancel-or-reconcile' }
    });
  });

  it('never persists after receiver evidence, factory, or port effects fail', async () => {
    const target = poolFixture();
    const plan = planFixture();
    const identity = deriveGrantQualifiedOneShotIdentity(plan);
    if (identity.outcome === 'failure') throw new Error('invalid identity fixture');

    const existingState = harness();
    const existingFactory = vi.fn(successfulFactory(existingState).finalizeForSlot);
    const existing = await reserveGrantQualifiedOneShotMaterialization(
      plan,
      1_000,
      target,
      { finalizeForSlot: existingFactory },
      ports(existingState, [occupied(slotAt(target, 0), identity.value.attemptId), empty(slotAt(target, 1))])
    );
    expect(existing).toMatchObject({
      outcome: 'failure', issue: { code: 'one-shot-materialization-recovery-required' }
    });
    expect(existingFactory).not.toHaveBeenCalled();
    expect(existingState.commands).toHaveLength(0);

    const factoryState = harness();
    const failedFactory: GrantQualifiedOneShotLaunchFactory<never> = {
      finalizeForSlot: () => Promise.reject(new Error('private factory canary'))
    };
    const failed = await reserveGrantQualifiedOneShotMaterialization(
      plan,
      1_000,
      target,
      failedFactory,
      ports(factoryState, [empty(slotAt(target, 0)), empty(slotAt(target, 1))])
    );
    expect(failed).toMatchObject({
      outcome: 'failure', issue: { code: 'one-shot-launch-factory-failed' }
    });
    expect(factoryState.commands).toHaveLength(0);

    const observationState = harness();
    const basePorts = ports(observationState, [empty(slotAt(target, 0)), empty(slotAt(target, 1))]);
    const observationFailure: OneShotMaterializationReservationPorts = {
      ...basePorts,
      observe: () => Promise.reject(new Error('private observation canary'))
    };
    const unavailable = await reserveGrantQualifiedOneShotMaterialization(
      plan,
      1_000,
      target,
      successfulFactory(observationState),
      observationFailure
    );
    expect(unavailable).toMatchObject({
      outcome: 'failure', issue: { code: 'one-shot-reservation-observation-unavailable' }
    });
    expect(observationState.commands).toHaveLength(0);
    expect(JSON.stringify([failed, unavailable])).not.toContain('private');
  });
});
