import { describe, expect, it } from 'vitest';

import {
  admitProcessPlan,
  brokerTaskOk,
  observeProcess,
  parseCanonicalRepository,
  parseCleanupId,
  parseProcessAttemptId,
  parseReceiverHandle,
  parseReceiverId,
  parseReceiverPlanId,
  parseReceiverVersion,
  parseRecipeRevision,
  type MaterializedProcess,
  type ProcessPlan,
  type ReceiverDescriptor,
  type ReceiverSession,
  type ReceiverSnapshot
} from '../broker/public.ts';

const required = <T>(result: { readonly isErr: () => boolean; readonly value?: T }): T => {
  expect(result.isErr()).toBe(false);
  return result.value as T;
};

const attemptId = required(parseProcessAttemptId('attempt-observed-1'));
const handle = required(parseReceiverHandle('nebular-one-shot-00:attempt-observed-1'));
const receiver: ReceiverDescriptor = {
  id: required(parseReceiverId('pm2')),
  version: required(parseReceiverVersion('host-observed')),
  capabilities: ['exact-cancellation', 'exact-tree-cleanup', 'output-cursors']
};
const plan: ProcessPlan = {
  id: required(parseReceiverPlanId('plan-observed-1')),
  attemptId,
  repository: required(parseCanonicalRepository('R:/Code/example')),
  recipeRevision: required(parseRecipeRevision('sha256:observed-recipe')),
  plannedAtMs: 0,
  lifecycle: 'one-shot',
  cwd: 'R:/Code/example',
  argv: ['mise', 'run', 'test'],
  nonsecretEnvironmentNames: [],
  credentialSlotIds: [],
  requiredCapabilities: receiver.capabilities,
  policy: {
    startupDeadlineMs: 5_000,
    hardRuntimeDeadlineMs: 30_000,
    readiness: { mode: 'none' },
    progress: { mode: 'output-or-heartbeat', stallAfterMs: 2_000 },
    outputRetentionBytes: 16_384,
    cancellationGraceMs: 1_000,
    forcedCleanupDeadlineMs: 3_000,
    restart: { mode: 'never' }
  }
};

const snapshot = (state: ReceiverSnapshot['backendState'], sequence: number): ReceiverSnapshot => ({
  attemptId,
  handle,
  backendState: state,
  sequence,
  observedAtMs: 1_000 + sequence,
  startedAtMs: 1_000,
  lastProgressAtMs: 1_000 + sequence,
  restartCount: 0,
  ...(state === 'stopped' ? { exitCode: 0, cleanup: 'complete' as const } : { cleanup: 'not-required' as const })
});

describe('broker policy to receiver observability seam', () => {
  it('materializes through a receiver port and derives objective state from facts', async () => {
    let current = snapshot('materialized', 0);
    const receiverPort: ReceiverSession = {
      preflight: () => brokerTaskOk({ outcome: 'ready', receiver }),
      materialize: admitted => brokerTaskOk({ admitted, handle }),
      start: () => {
        current = snapshot('online', 1);
        return brokerTaskOk({ outcome: 'started', handle, startedAtMs: 1_000 });
      },
      inspect: () => brokerTaskOk(current),
      cancel: () => {
        current = snapshot('stopped', current.sequence + 1);
        return brokerTaskOk(current);
      },
      delete: () => brokerTaskOk({ ...current, cleanup: 'complete' })
    };

    const preflight = await receiverPort.preflight(plan);
    expect(preflight.isOk() && preflight.value.outcome).toBe('ready');
    if (preflight.isErr() || preflight.value.outcome !== 'ready') return;
    const admitted = admitProcessPlan(plan, preflight.value.receiver);
    expect(admitted.isOk()).toBe(true);
    if (admitted.isErr()) return;
    const materialized = await receiverPort.materialize(admitted.value);
    expect(materialized.isOk()).toBe(true);
    if (materialized.isErr()) return;
    await receiverPort.start(materialized.value);
    const inspected = await receiverPort.inspect(materialized.value);
    expect(inspected.isOk()).toBe(true);
    if (inspected.isErr()) return;
    const observation = observeProcess(admitted.value, inspected.value, 1_100);
    expect(observation.isOk() && observation.value.state).toBe('running');
    expect(observation.isOk() && observation.value.nextActions.map(action => action.action))
      .toEqual(['poll', 'inspect-output', 'cancel']);
  });

  it('cancels only the materialized attempt and exposes verified cleanup', async () => {
    const admitted = required(admitProcessPlan(plan, receiver));
    const materialized: MaterializedProcess = { admitted, handle };
    let cancelledAttempt = '';
    const cleanupId = required(parseCleanupId('cleanup-1'));
    const receiverPort: Pick<ReceiverSession, 'cancel' | 'delete'> = {
      cancel: process => {
        cancelledAttempt = process.admitted.plan.attemptId;
        return brokerTaskOk(snapshot('stopped', 2));
      },
      delete: (_process, suppliedCleanupId) => brokerTaskOk({
        ...snapshot('stopped', 3),
        cleanup: suppliedCleanupId === cleanupId ? 'complete' : 'partial'
      })
    };

    const cancelled = await receiverPort.cancel(materialized, 1);
    expect(cancelled.isOk()).toBe(true);
    expect(cancelledAttempt).toBe(attemptId);
    const deleted = await receiverPort.delete(materialized, cleanupId);
    expect(deleted.isOk() && deleted.value.cleanup).toBe('complete');
  });
});
