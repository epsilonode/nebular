import { describe, expect, it } from 'vitest';

import {
  parseCanonicalRepository,
  parseCredentialSlotId,
  parseProcessAttemptId,
  parseReceiverHandle,
  parseReceiverId,
  parseReceiverPlanId,
  parseReceiverVersion,
  parseRecipeRevision
} from './primitives.ts';
import {
  admitProcessPlan,
  observeProcess,
  validateProcessPlan,
  type AdmittedProcessPlan,
  type ProcessPlan,
  type ReceiverDescriptor,
  type ReceiverSnapshot
} from './receiver.ts';

const value = <T>(result: { readonly isErr: () => boolean; readonly value?: T }): T => {
  expect(result.isErr()).toBe(false);
  return result.value as T;
};

const attemptId = value(parseProcessAttemptId('attempt-1'));
const repository = value(parseCanonicalRepository('R:/Code/example'));
const revision = value(parseRecipeRevision('sha256:recipe'));
const planId = value(parseReceiverPlanId('plan-1'));
const receiverId = value(parseReceiverId('pm2'));
const receiverVersion = value(parseReceiverVersion('6.x'));
const handle = value(parseReceiverHandle('nebular:attempt-1'));
const slotId = value(parseCredentialSlotId('weather-api'));

const plan: ProcessPlan = {
  id: planId,
  attemptId,
  repository,
  recipeRevision: revision,
  plannedAtMs: 0,
  lifecycle: 'one-shot',
  cwd: 'R:/Code/example',
  argv: ['mise', 'run', 'test'],
  nonsecretEnvironmentNames: ['CI'],
  credentialSlotIds: [slotId],
  requiredCapabilities: ['exact-cancellation', 'exact-tree-cleanup', 'output-cursors'],
  policy: {
    startupDeadlineMs: 10_000,
    hardRuntimeDeadlineMs: 60_000,
    readiness: { mode: 'none' },
    progress: { mode: 'output-or-heartbeat', stallAfterMs: 5_000 },
    outputRetentionBytes: 65_536,
    cancellationGraceMs: 2_000,
    forcedCleanupDeadlineMs: 5_000,
    restart: { mode: 'never' }
  }
};

const receiver: ReceiverDescriptor = {
  id: receiverId,
  version: receiverVersion,
  capabilities: ['exact-cancellation', 'exact-tree-cleanup', 'output-cursors']
};

const admitted: AdmittedProcessPlan = value(admitProcessPlan(plan, receiver));

const snapshot = (overrides: Partial<ReceiverSnapshot> = {}): ReceiverSnapshot => ({
  attemptId,
  handle,
  backendState: 'online',
  sequence: 3,
  observedAtMs: 10_000,
  startedAtMs: 8_000,
  lastProgressAtMs: 9_500,
  restartCount: 0,
  cleanup: 'not-required',
  ...overrides
});

describe('receiver process algebra', () => {
  it('rejects unbounded one-shot plans and missing receiver capabilities before effects', () => {
    const unbounded = validateProcessPlan({
      ...plan,
      policy: {
        startupDeadlineMs: plan.policy.startupDeadlineMs,
        readiness: plan.policy.readiness,
        progress: plan.policy.progress,
        outputRetentionBytes: plan.policy.outputRetentionBytes,
        cancellationGraceMs: plan.policy.cancellationGraceMs,
        forcedCleanupDeadlineMs: plan.policy.forcedCleanupDeadlineMs,
        restart: plan.policy.restart
      }
    });
    expect(unbounded.isErr()).toBe(true);

    const incompatible = admitProcessPlan(plan, { ...receiver, capabilities: ['output-cursors'] });
    expect(incompatible.isErr()).toBe(true);
    if (incompatible.isErr()) expect(incompatible.error[0].code).toBe('receiver-incompatible');
  });

  it('distinguishes progress, bounded quiet, stall, timeout, and recovery facts', () => {
    const progressing = observeProcess(admitted, snapshot(), 10_000);
    expect(progressing.isOk() && progressing.value.state).toBe('running');

    const stalled = observeProcess(admitted, snapshot({ lastProgressAtMs: 1_000 }), 10_000);
    expect(stalled.isOk() && stalled.value.state).toBe('stalled');

    const timedOut = observeProcess(admitted, snapshot({ startedAtMs: 1_000 }), 61_000);
    expect(timedOut.isOk() && timedOut.value.state).toBe('timed-out');

    const recovery = observeProcess(admitted, snapshot({ backendState: 'stopped', cleanup: 'partial' }), 10_000);
    expect(recovery.isOk() && recovery.value.state).toBe('recovery-required');
  });

  it('reports a quiet exemption without calling the process healthy from PM2 online alone', () => {
    const quietPlan: ProcessPlan = {
      ...plan,
      policy: { ...plan.policy, progress: { mode: 'bounded-quiet', maximumQuietMs: 30_000 } }
    };
    const quietAdmitted = value(admitProcessPlan(quietPlan, receiver));
    const quiet = observeProcess(quietAdmitted, snapshot({ lastProgressAtMs: 1_000 }), 10_000);
    expect(quiet.isOk() && quiet.value.state).toBe('quiet-allowed');
    expect(quiet.isOk() && quiet.value.progressing).toBe(false);
  });
});
