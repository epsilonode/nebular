import { describe, expect, it, vi } from 'vitest';

import {
  createManagedBootstrapRequest,
  MANAGED_ATTEMPT_ENVIRONMENT,
  type ManagedAttemptEnvironmentPort
} from './managed-attempt.ts';

const managedFacts: Readonly<Record<string, string>> = {
  [MANAGED_ATTEMPT_ENVIRONMENT.repository]: 'R:\\Code\\weather',
  [MANAGED_ATTEMPT_ENVIRONMENT.recipeRevision]: 'recipe-revision-1',
  [MANAGED_ATTEMPT_ENVIRONMENT.grantId]: 'grant-1',
  [MANAGED_ATTEMPT_ENVIRONMENT.grantGeneration]: '3',
  [MANAGED_ATTEMPT_ENVIRONMENT.receiverId]: 'pm2',
  [MANAGED_ATTEMPT_ENVIRONMENT.processAttemptId]: 'attempt-1'
};

const port = (
  facts: Readonly<Record<string, unknown>> = managedFacts
): ManagedAttemptEnvironmentPort => ({
  read: name => facts[name],
  createExchangeId: () => 'exchange-1'
});

const slots = [{ slotId: 'weather-api', environmentName: 'WEATHER_API_TOKEN' }] as const;

describe('managed recipe bootstrap authority request', () => {
  it('projects only fixed nonsecret PM2 attempt facts into the closed bootstrap request', () => {
    const read = vi.fn(port().read);
    const result = createManagedBootstrapRequest({ slots }, {
      read,
      createExchangeId: () => 'exchange-1'
    });

    expect(result.isOk()).toBe(true);
    expect(result.isOk() ? result.value : undefined).toEqual(expect.objectContaining({
      exchangeId: { kind: 'bootstrap-exchange-id', value: 'exchange-1' },
      payload: {
        authority: {
          repository: { kind: 'bootstrap-repository', value: 'R:\\Code\\weather' },
          recipeRevision: { kind: 'bootstrap-recipe-revision', value: 'recipe-revision-1' },
          grantId: { kind: 'bootstrap-grant-id', value: 'grant-1' },
          grantGeneration: 3
        },
        attempt: {
          receiverId: { kind: 'bootstrap-receiver-id', value: 'pm2' },
          processAttemptId: { kind: 'bootstrap-process-attempt-id', value: 'attempt-1' }
        },
        slots: [{
          slotId: { kind: 'bootstrap-slot-id', value: 'weather-api' },
          environmentName: 'WEATHER_API_TOKEN'
        }]
      }
    }));
    expect(read.mock.calls.map(call => call[0])).toEqual(Object.values(MANAGED_ATTEMPT_ENVIRONMENT));
  });

  it.each(['0', '01', '-1', '1.0', '9007199254740992', '', undefined])(
    'rejects noncanonical grant generation %s',
    generation => {
      const result = createManagedBootstrapRequest({ slots }, port({
        ...managedFacts,
        [MANAGED_ATTEMPT_ENVIRONMENT.grantGeneration]: generation
      }));
      expect(result.isErr()).toBe(true);
      expect(result.isErr() ? result.error[0].code : undefined).toBe('invalid-input');
    }
  );

  it('redacts environment reads and exchange-id defects', () => {
    const readFailure = createManagedBootstrapRequest({ slots }, {
      read: () => {
        throw new Error('secret-like environment detail');
      },
      createExchangeId: () => 'exchange-1'
    });
    const exchangeFailure = createManagedBootstrapRequest({ slots }, {
      read: port().read,
      createExchangeId: () => {
        throw new Error('secret-like entropy detail');
      }
    });

    expect(readFailure.isErr() ? readFailure.error[0].message : '').not.toContain('secret-like');
    expect(exchangeFailure.isErr() ? exchangeFailure.error[0].message : '').not.toContain('secret-like');
  });

  it('fails closed for missing authority facts and illegal credential declarations', () => {
    const missing = createManagedBootstrapRequest({ slots }, port({
      ...managedFacts,
      [MANAGED_ATTEMPT_ENVIRONMENT.grantId]: undefined
    }));
    const duplicate = createManagedBootstrapRequest({
      slots: [...slots, ...slots]
    }, port());

    expect(missing.isErr()).toBe(true);
    expect(duplicate.isErr()).toBe(true);
  });
});
