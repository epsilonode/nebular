import { describe, expect, it } from 'vitest';
import {
  err,
  executeTeleportRestorePlan,
  ok,
  type TeleportRestoreExecutorPort,
  type TeleportRestorePlan
} from './public';

const plan: TeleportRestorePlan = {
  steps: [
    { id: 'one', capabilityInstanceId: 'a', effect: 'safe-local', dependsOn: [], resources: ['a'], requiresConfirmation: false, reversible: true, verification: 'one applied' },
    { id: 'two', capabilityInstanceId: 'b', effect: 'destructive-replace', dependsOn: ['one'], resources: ['b'], requiresConfirmation: true, reversible: true, verification: 'two applied' }
  ],
  confirmations: ['two'],
  unresolvedOptionalInstances: []
};

const authorization = {
  allowEffects: ['safe-local', 'destructive-replace'] as const,
  confirmedStepIds: ['two']
};

const successfulPort = (events: string[]): TeleportRestoreExecutorPort => ({
  stage: step => {
    events.push(`stage:${step.id}`);
    return Promise.resolve(ok(`staged:${step.id}`));
  },
  commit: step => {
    events.push(`commit:${step.id}`);
    return Promise.resolve(ok(`receipt:${step.id}`));
  },
  verify: step => {
    events.push(`verify:${step.id}`);
    return Promise.resolve(ok(undefined));
  },
  rollback: step => {
    events.push(`rollback:${step.id}`);
    return Promise.resolve(ok(undefined));
  },
  cleanup: step => {
    events.push(`cleanup:${step.id}`);
    return Promise.resolve();
  }
});

const rejected = (message: string): Promise<void> => new Promise((_resolve, reject) => {
  reject(new Error(message));
});

describe('transactional restore executor', () => {
  it('stages every step before ordered commit and always cleans staged values', async () => {
    const events: string[] = [];
    const result = await executeTeleportRestorePlan(plan, authorization, successfulPort(events));

    expect(result).toMatchObject({
      ok: true,
      value: {
        status: 'committed',
        receipts: [
          { stepId: 'one', token: 'receipt:one' },
          { stepId: 'two', token: 'receipt:two' }
        ],
        rolledBackStepIds: []
      }
    });
    expect(events).toEqual([
      'stage:one',
      'stage:two',
      'commit:one',
      'verify:one',
      'commit:two',
      'verify:two',
      'cleanup:one',
      'cleanup:two'
    ]);
  });

  it('rejects missing authorization before staging', async () => {
    const events: string[] = [];
    const result = await executeTeleportRestorePlan(
      plan,
      { allowEffects: ['safe-local'] },
      successfulPort(events)
    );

    expect(result).toMatchObject({ ok: false, issues: [{ code: 'policy-rejected' }] });
    expect(events).toEqual([]);
  });

  it('cleans only successfully staged values when a later stage fails', async () => {
    const events: string[] = [];
    const port = successfulPort(events);
    const result = await executeTeleportRestorePlan(plan, authorization, {
      ...port,
      stage: step => {
        events.push(`stage:${step.id}`);
        return Promise.resolve(step.id === 'two'
          ? err({ code: 'execution-failed', message: 'stage two failed' })
          : ok(`staged:${step.id}`));
      }
    });

    expect(result).toMatchObject({
      ok: false,
      issues: [{ code: 'execution-failed', message: 'stage two failed' }]
    });
    expect(events).toEqual(['stage:one', 'stage:two', 'cleanup:one']);
  });

  it('rolls committed reversible steps back in reverse order before cleanup', async () => {
    const events: string[] = [];
    const port = successfulPort(events);
    const result = await executeTeleportRestorePlan(plan, authorization, {
      ...port,
      verify: step => {
        events.push(`verify:${step.id}`);
        return Promise.resolve(step.id === 'two'
          ? err({ code: 'verification-failed', message: 'two did not verify' })
          : ok(undefined));
      }
    });

    expect(result).toMatchObject({
      ok: false,
      issues: [{ code: 'verification-failed', message: 'two did not verify' }]
    });
    expect(events).toEqual([
      'stage:one',
      'stage:two',
      'commit:one',
      'verify:one',
      'commit:two',
      'verify:two',
      'rollback:two',
      'rollback:one',
      'cleanup:one',
      'cleanup:two'
    ]);
  });

  it('rolls back only earlier receipts when a later commit fails', async () => {
    const events: string[] = [];
    const port = successfulPort(events);
    const result = await executeTeleportRestorePlan(plan, authorization, {
      ...port,
      commit: step => {
        events.push(`commit:${step.id}`);
        return Promise.resolve(step.id === 'two'
          ? err({ code: 'execution-failed', message: 'commit two failed' })
          : ok(`receipt:${step.id}`));
      }
    });

    expect(result).toMatchObject({
      ok: false,
      issues: [{ code: 'execution-failed', message: 'commit two failed' }]
    });
    expect(events).toEqual([
      'stage:one',
      'stage:two',
      'commit:one',
      'verify:one',
      'commit:two',
      'rollback:one',
      'cleanup:one',
      'cleanup:two'
    ]);
  });

  it('continues reverse rollback and reports rollback failures', async () => {
    const events: string[] = [];
    const port = successfulPort(events);
    const result = await executeTeleportRestorePlan(plan, authorization, {
      ...port,
      verify: step => Promise.resolve(step.id === 'two'
        ? err({ code: 'verification-failed', message: 'verification failed' })
        : ok(undefined)),
      rollback: step => {
        events.push(`rollback:${step.id}`);
        return Promise.resolve(step.id === 'two'
          ? err({ code: 'execution-failed', message: 'rollback two failed' })
          : ok(undefined));
      }
    });

    expect(result).toMatchObject({
      ok: false,
      issues: [
        { code: 'verification-failed', message: 'verification failed' },
        { code: 'execution-failed', message: 'rollback two failed' }
      ]
    });
    expect(events.filter(event => event.startsWith('rollback:'))).toEqual([
      'rollback:two',
      'rollback:one'
    ]);
    expect(events.slice(-2)).toEqual(['cleanup:one', 'cleanup:two']);
  });

  it('reports cleanup rejection as a warning without hiding a committed result', async () => {
    const events: string[] = [];
    const port = successfulPort(events);
    const result = await executeTeleportRestorePlan(plan, authorization, {
      ...port,
      cleanup: step => {
        events.push(`cleanup:${step.id}`);
        return step.id === 'one' ? rejected('cleanup unavailable') : Promise.resolve();
      }
    });

    expect(result).toMatchObject({
      ok: true,
      value: { status: 'committed' },
      warnings: [{
        code: 'execution-failed',
        message: 'Restore step one cleanup failed.',
        instanceId: 'a'
      }]
    });
    expect(events.slice(-2)).toEqual(['cleanup:one', 'cleanup:two']);
  });
});
