import type { Result } from 'neverthrow';
import { describe, expect, it } from 'vitest';

import {
  journalErr,
  journalOk,
  parseCheckedInRecipeLocator,
  parseDurableWindowsNamedJobIdentity,
  parseJournalOperationId,
  parseLeaseJournalId,
  parseProcessIncarnation,
  parseReceiverCorrelation,
  parseReceiverEntryIdentity,
  parseRedactedPlanDigest,
  type GrantQualifiedContainedAttemptRecord,
  type JournalResult,
  type LeaseJournalRecord,
  type TransitionLease,
  type VerifiedWindowsTerminalCleanupRecord
} from './journal.ts';
import { parseSecretExposureCorrelation } from './lease.ts';
import {
  parseCanonicalRepository,
  parseCredentialSlotId,
  parseGrantId,
  parseProcessAttemptId,
  parseReceiverId,
  parseRecipeRevision
} from './primitives.ts';
import {
  cleanupVerifiedWindowsOneShotAttempt,
  type WindowsOneShotTerminalSignal,
  type WindowsTerminalCleanupPorts
} from './windows-terminal-cleanup.ts';

const unwrapJournal = <Value>(result: JournalResult<Value>): Value => {
  if (result.type === 'err') throw new Error(result.issues[0].message);
  return result.value;
};

const unwrapBroker = <Value>(result: Result<Value, unknown>): Value => {
  if (result.isErr()) throw new Error('invalid broker fixture');
  return result.value;
};

const fixture = (): GrantQualifiedContainedAttemptRecord => {
  const processAttemptId = unwrapBroker(parseProcessAttemptId('attempt-terminal-1'));
  const repository = unwrapBroker(parseCanonicalRepository('R:\\Code\\repository'));
  const recipeRevision = unwrapBroker(parseRecipeRevision('revision-1'));
  const grantId = unwrapBroker(parseGrantId('grant-1'));
  const slotId = unwrapBroker(parseCredentialSlotId('weather'));
  const receiverId = unwrapBroker(parseReceiverId('pm2'));
  const receiverCorrelation = unwrapJournal(parseReceiverCorrelation('receiver-correlation-1'));
  const receiverEntryIdentity = unwrapJournal(parseReceiverEntryIdentity('pm2-entry:nebular-one-shot-01'));
  const recipeLocator = unwrapJournal(parseCheckedInRecipeLocator('.nebular/recipes/weather.xml'));
  const slotIndependentPlanDigest = unwrapJournal(parseRedactedPlanDigest(`sha256:${'b'.repeat(64)}`));
  const planDigest = unwrapJournal(parseRedactedPlanDigest('a'.repeat(64)));
  const rootProcessIncarnation = unwrapJournal(parseProcessIncarnation(
    `windows-process-incarnation-v1-${'c'.repeat(64)}`
  ));
  const jobIdentity = unwrapJournal(parseDurableWindowsNamedJobIdentity(
    `Local\\epsilonode.nebular.job.v1.${'d'.repeat(64)}`
  ));
  const binding = {
    format: 'verified-windows-attempt-containment/v1' as const,
    bindingGeneration: 1,
    processAttemptId,
    repository,
    recipeRevision,
    grantId,
    grantGeneration: 2,
    credentialSlotIds: [slotId],
    grantExpiresAtMs: 20_000,
    receiverId,
    receiverCorrelation,
    receiverEntryIdentity,
    receiverSlotIdentity: 'nebular-one-shot:01',
    receiverProcessName: 'nebular-one-shot-01',
    receiverPmId: 7,
    recipeLocator,
    slotIndependentPlanDigest,
    launchMetadataDigest: 'a'.repeat(64),
    deadlineAtMs: 10_000,
    rootProcessId: 4_200,
    rootProcessIncarnation,
    jobIdentity,
    jobPolicy: {
      format: 'windows-job-policy/v1' as const,
      extendedLimit: 'kill-on-job-close-only' as const,
      uiRestrictions: 'none' as const,
      breakaway: 'forbidden' as const
    },
    membershipVerifiedAtMs: 2_000
  };
  return {
    attempt: {
      id: processAttemptId,
      reserveOperationId: unwrapJournal(parseJournalOperationId('reserve-attempt-1')),
      repository,
      recipeRevision,
      planDigest,
      lifecycle: 'one-shot',
      receiverCorrelation,
      state: 'running',
      stateVersion: 3,
      createdAtMs: 1_000,
      updatedAtMs: 2_000,
      bootstrapBinding: {
        format: 'bootstrap-attempt-binding/v2',
        bindingGeneration: 1,
        grantId,
        grantGeneration: 2,
        receiverId,
        receiverEntryIdentity,
        helperParentProcessId: 4_200,
        helperParentProcessIncarnation: rootProcessIncarnation,
        recipeLocator
      }
    },
    authority: {
      grantId,
      grantGeneration: 2,
      repository,
      recipeRevision,
      credentialSlotIds: [slotId],
      grantExpiresAtMs: 20_000
    },
    admission: {
      format: 'grant-qualified-launch-admission/v1',
      bindingGeneration: 1,
      receiverId,
      receiverSlotIdentity: 'nebular-one-shot:01',
      receiverProcessName: 'nebular-one-shot-01',
      receiverEntryIdentity,
      recipeLocator,
      slotIndependentPlanDigest,
      launchMetadataDigest: 'a'.repeat(64),
      deadlineAtMs: 10_000
    },
    containmentBinding: binding
  };
};

const lease = (
  contained: GrantQualifiedContainedAttemptRecord,
  suffix: string,
  state: LeaseJournalRecord['state']
): LeaseJournalRecord => ({
  id: unwrapJournal(parseLeaseJournalId(`lease-${suffix}`)),
  operationId: unwrapJournal(parseJournalOperationId(`lease-create-${suffix}`)),
  grantId: contained.authority.grantId,
  grantGeneration: contained.authority.grantGeneration,
  processAttemptId: contained.attempt.id,
  receiverId: contained.containmentBinding.receiverId,
  exposureCorrelation: unwrapBroker(parseSecretExposureCorrelation(`exposure-${suffix}`)),
  issuedAtMs: 1_500,
  expiresAtMs: 9_000,
  updatedAtMs: 1_900,
  cleanupReceipt: null,
  state
});

type HarnessMode = 'proved-empty' | 'job-missing' | 'same-root-running' | 'unbound' | 'pm2-failure';

type Harness = Readonly<{
  ports: WindowsTerminalCleanupPorts;
  events: string[];
  transitions: string[];
  currentLeases: LeaseJournalRecord[];
}>;

const harness = (
  mode: HarnessMode,
  initialLeases: readonly LeaseJournalRecord[] = [],
  priorCleanup: VerifiedWindowsTerminalCleanupRecord | null = null
): Harness => {
  const contained = fixture();
  const events: string[] = [];
  const transitions: string[] = [];
  const currentLeases = [...initialLeases];
  const updateLease = (command: TransitionLease): LeaseJournalRecord | null => {
    const index = currentLeases.findIndex(candidate => candidate.id.value === command.leaseId.value);
    const current = currentLeases.at(index);
    if (current === undefined || current.state !== command.expectedState) return null;
    const updated: LeaseJournalRecord = {
      ...current,
      state: command.nextState,
      updatedAtMs: command.atMs,
      cleanupReceipt: command.cleanupReceipt
    };
    currentLeases.splice(index, 1, updated);
    transitions.push(`${command.expectedState}->${command.nextState}`);
    events.push(`lease:${command.nextState}`);
    return updated;
  };
  const ports: WindowsTerminalCleanupPorts = {
    attempts: {
      readVerifiedWindowsTerminalCleanup: () => {
        events.push('journal:read-cleanup');
        return Promise.resolve(journalOk(priorCleanup));
      },
      readGrantQualifiedContainedAttempt: () => {
        events.push('journal:read-contained');
        return Promise.resolve(journalOk(mode === 'unbound' ? null : contained));
      },
      finalizeVerifiedWindowsTerminalCleanup: command => {
        events.push('journal:finalize');
        return Promise.resolve(journalOk({ status: 'committed', record: command.cleanup }));
      }
    },
    leases: {
      readNonterminalForAttempt: () => {
        events.push('leases:read');
        return Promise.resolve(journalOk(currentLeases.filter(candidate =>
          candidate.state !== 'closed' && candidate.state !== 'revoked')));
      },
      readClosedCountForAttempt: () => {
        events.push('leases:count-closed');
        return Promise.resolve(journalOk(currentLeases.filter(candidate => candidate.state === 'closed').length));
      },
      transition: command => {
        const updated = updateLease(command);
        return Promise.resolve(updated === null
          ? journalErr({ code: 'journal-conflict', message: 'transition fixture conflict' })
          : journalOk({ status: 'committed', record: updated }));
      }
    },
    containment: {
      terminateAndObserve: () => {
        events.push('job:terminate-observe');
        return Promise.resolve(mode === 'proved-empty'
          ? {
              status: 'proved-empty',
              receipt: {
                state: 'terminated-empty',
                job: {
                  kind: 'windows-named-job-identity',
                  value: contained.containmentBinding.jobIdentity.value
                },
                activeProcesses: 0
              }
            }
          : {
              status: 'missing',
              job: {
                kind: 'windows-named-job-identity',
                value: contained.containmentBinding.jobIdentity.value
              }
            });
      }
    },
    rootProcesses: {
      readCurrentIncarnation: () => {
        events.push('root:observe');
        return Promise.resolve(mode === 'same-root-running'
          ? {
              status: 'running',
              processId: contained.containmentBinding.rootProcessId,
              incarnation: contained.containmentBinding.rootProcessIncarnation
            }
          : { status: 'missing', processId: contained.containmentBinding.rootProcessId });
      }
    },
    pm2: {
      deleteExactRecord: request => {
        events.push('pm2:delete');
        return Promise.resolve(mode === 'pm2-failure'
          ? {
              outcome: 'failure',
              issue: {
                code: 'pm2-exact-record-deletion-unconfirmed',
                safeMessage: 'unconfirmed fixture'
              }
            }
          : {
              outcome: 'success',
              value: {
                format: 'pm2-exact-record-deletion/v1',
                disposition: 'deleted',
                receiverId: request.binding.receiverId,
                receiverCorrelation: request.binding.receiverCorrelation,
                receiverSlotIdentity: request.binding.receiverSlotIdentity,
                receiverProcessName: request.binding.receiverProcessName,
                receiverPmId: request.binding.receiverPmId,
                processAttemptId: request.binding.processAttemptId,
                launchMetadataDigest: request.binding.launchMetadataDigest,
                deletedAtMs: 5_000
              }
            });
      }
    },
    clock: { nowMs: () => 5_000 }
  };
  return { ports, events, transitions, currentLeases };
};

const signal = (): WindowsOneShotTerminalSignal => ({
  format: 'windows-pm2-one-shot-terminal-signal/v1',
  processAttemptId: fixture().attempt.id,
  terminalDisposition: 'succeeded',
  observedAtMs: 4_000
});

describe('verified Windows terminal cleanup', () => {
  it('proves the tree, closes every possible exposure, then deletes PM2 and finalizes', async () => {
    const contained = fixture();
    const target = harness('proved-empty', [
      lease(contained, 'authorized', 'authorized'),
      lease(contained, 'delivering', 'delivering'),
      lease(contained, 'exposed', 'exposed')
    ]);
    const result = await cleanupVerifiedWindowsOneShotAttempt(signal(), target.ports);

    expect(result).toEqual(expect.objectContaining({ state: 'cleaned' }));
    expect(target.transitions).toEqual([
      'authorized->revoked',
      'delivering->recovery-required',
      'recovery-required->closure-required',
      'closure-required->closed',
      'exposed->closure-required',
      'closure-required->closed'
    ]);
    expect(target.events.indexOf('pm2:delete')).toBeGreaterThan(target.events.lastIndexOf('lease:closed'));
    expect(target.events.indexOf('journal:finalize')).toBeGreaterThan(target.events.indexOf('pm2:delete'));
    expect(target.currentLeases.map(candidate => candidate.state)).toEqual(['revoked', 'closed', 'closed']);
  });

  it('accepts a missing Job only with prior durable binding plus exact root exit', async () => {
    const accepted = harness('job-missing');
    const result = await cleanupVerifiedWindowsOneShotAttempt(signal(), accepted.ports);
    expect(result.state).toBe('cleaned');
    if (result.state === 'cleaned') {
      expect(result.cleanup.treeCleanup.basis).toBe('job-missing-root-exited');
    }

    const denied = harness('same-root-running');
    expect(await cleanupVerifiedWindowsOneShotAttempt(signal(), denied.ports)).toEqual(expect.objectContaining({
      state: 'recovery-required',
      stage: 'root-exit'
    }));
    expect(denied.events).not.toContain('pm2:delete');
    expect(denied.events).not.toContain('journal:finalize');
  });

  it('fails closed for an immediate terminal launch without a durable containment binding', async () => {
    const target = harness('unbound');
    expect(await cleanupVerifiedWindowsOneShotAttempt(signal(), target.ports)).toEqual(expect.objectContaining({
      state: 'recovery-required',
      stage: 'durable-binding'
    }));
    expect(target.events).toEqual(['journal:read-cleanup', 'journal:read-contained']);
  });

  it('does not finalize when exact PM2 record deletion is ambiguous', async () => {
    const target = harness('pm2-failure');
    expect(await cleanupVerifiedWindowsOneShotAttempt(signal(), target.ports)).toEqual(expect.objectContaining({
      state: 'recovery-required',
      stage: 'pm2-deletion'
    }));
    expect(target.events).not.toContain('journal:finalize');
  });

  it('returns durable already-cleaned evidence without repeating process effects', async () => {
    const first = harness('proved-empty');
    const completed = await cleanupVerifiedWindowsOneShotAttempt(signal(), first.ports);
    if (completed.state !== 'cleaned') throw new Error('cleanup fixture did not complete');
    const replay = harness('proved-empty', [], completed.cleanup);
    expect(await cleanupVerifiedWindowsOneShotAttempt(signal(), replay.ports)).toEqual(expect.objectContaining({
      state: 'already-cleaned'
    }));
    expect(replay.events).toEqual(['journal:read-cleanup']);
  });
});
