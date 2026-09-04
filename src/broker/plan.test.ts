import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  composeBrokerPlans,
  createBrokerPlan,
  type BrokerPlan,
  type BrokerPlanStep
} from './plan.ts';

const step = (id: string, dependsOn: readonly string[] = []): BrokerPlanStep => ({
  id,
  kind: 'credential-operation',
  dependsOn,
  authority: 'lease',
  resources: [`credential:${id}`],
  exposure: 'opaque-handle',
  confirmation: 'standard',
  deadlineMs: 5_000,
  idempotencyKey: `idempotency:${id}`,
  retry: 'idempotent',
  verification: 'redacted receipt confirms the requested operation',
  reversible: true,
  rollback: 'release the staged credential operation',
  journalRequired: false
});

const plan = (steps: readonly BrokerPlanStep[]): BrokerPlan => {
  const created = createBrokerPlan(steps);
  if (created.isErr()) throw new Error(created.error[0].message);
  return created.value;
};

const compose = (left: BrokerPlan, right: BrokerPlan): BrokerPlan => {
  const combined = composeBrokerPlans(left, right);
  if (combined.isErr()) throw new Error(combined.error[0].message);
  return combined.value;
};

describe('broker plan algebra', () => {
  it('orders compatible dependencies deterministically and aggregates confirmation boundaries', () => {
    const created = createBrokerPlan([
      { ...step('write', ['read']), confirmation: 'elevated', resources: ['credential:shared'] },
      { ...step('read'), resources: ['credential:shared'] }
    ]);
    expect(created).toMatchObject({
      isOk: expect.any(Function),
      value: {
        steps: [expect.objectContaining({ id: 'read' }), expect.objectContaining({ id: 'write' })],
        confirmations: ['standard', 'elevated']
      }
    });
  });

  it('rejects duplicate identities, missing dependencies, cycles, unordered conflicts, and unsafe exposure', () => {
    expect(createBrokerPlan([step('same'), step('same')])).toMatchObject({ isErr: expect.any(Function) });
    expect(createBrokerPlan([step('missing', ['absent'])])).toMatchObject({ isErr: expect.any(Function) });
    expect(createBrokerPlan([step('left', ['right']), step('right', ['left'])])).toMatchObject({ isErr: expect.any(Function) });
    expect(createBrokerPlan([
      { ...step('left'), resources: ['credential:shared'] },
      { ...step('right'), resources: ['credential:shared'] }
    ])).toMatchObject({ isErr: expect.any(Function) });
    expect(createBrokerPlan([{
      ...step('raw'), exposure: 'elevated-raw', confirmation: 'standard'
    }])).toMatchObject({ isErr: expect.any(Function) });
  });

  it('is associative for compatible independent plans', () => {
    const suffix = fc.integer({ min: 1, max: 999 });
    fc.assert(fc.property(suffix, suffix, suffix, (first, second, third) => {
      const ids = [first, second, third].map(value => `step:${value}`);
      fc.pre(new Set(ids).size === ids.length);
      const left = plan([step(ids[0] ?? 'first')]);
      const middle = plan([step(ids[1] ?? 'middle')]);
      const right = plan([step(ids[2] ?? 'right')]);
      const leftAssociated = compose(compose(left, middle), right);
      const rightAssociated = compose(left, compose(middle, right));
      expect(leftAssociated).toEqual(rightAssociated);
    }), { numRuns: 100 });
  });
});
