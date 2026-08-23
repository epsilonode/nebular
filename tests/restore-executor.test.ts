import { describe, expect, it } from 'vitest';
import { err, executeTeleportRestorePlan, ok, type TeleportRestorePlan } from '../src';

const plan: TeleportRestorePlan = {
  steps: [
    { id: 'one', capabilityInstanceId: 'a', effect: 'safe-local', dependsOn: [], resources: ['a'], requiresConfirmation: false, reversible: true, verification: 'one applied' },
    { id: 'two', capabilityInstanceId: 'b', effect: 'destructive-replace', dependsOn: ['one'], resources: ['b'], requiresConfirmation: true, reversible: true, verification: 'two applied' }
  ],
  confirmations: ['two'],
  unresolvedOptionalInstances: []
};

describe('transactional restore executor', () => {
  it('stages every step before commit and verifies receipts', async () => {
    const events: string[] = [];
    const result = await executeTeleportRestorePlan(plan, { allowEffects: ['safe-local', 'destructive-replace'], confirmedStepIds: ['two'] }, {
      stage: async step => { events.push(`stage:${step.id}`); return ok(`staged:${step.id}`); },
      commit: async step => { events.push(`commit:${step.id}`); return ok(`receipt:${step.id}`); },
      verify: async step => { events.push(`verify:${step.id}`); return ok(undefined); },
      rollback: async step => { events.push(`rollback:${step.id}`); return ok(undefined); },
      cleanup: async step => { events.push(`cleanup:${step.id}`); }
    });
    expect(result.ok).toBe(true);
    expect(events.slice(0, 2)).toEqual(['stage:one', 'stage:two']);
    expect(events).toContain('verify:two');
  });

  it('rejects missing authorization without staging', async () => {
    let staged = false;
    const result = await executeTeleportRestorePlan(plan, { allowEffects: ['safe-local'] }, {
      stage: async () => { staged = true; return ok(undefined); },
      commit: async () => ok(undefined), verify: async () => ok(undefined), rollback: async () => ok(undefined), cleanup: async () => {}
    });
    expect(result.ok).toBe(false);
    expect(staged).toBe(false);
  });

  it('rolls committed reversible steps back in reverse order on verification failure', async () => {
    const rolledBack: string[] = [];
    const result = await executeTeleportRestorePlan(plan, { allowEffects: ['safe-local', 'destructive-replace'], confirmedStepIds: ['two'] }, {
      stage: async step => ok(step.id),
      commit: async step => ok(step.id),
      verify: async step => step.id === 'two' ? err({ code: 'verification-failed', message: 'nope' }) : ok(undefined),
      rollback: async step => { rolledBack.push(step.id); return ok(undefined); },
      cleanup: async () => {}
    });
    expect(result.ok).toBe(false);
    expect(rolledBack).toEqual(['two', 'one']);
  });
});
