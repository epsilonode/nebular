import { describe, expect, it, vi } from 'vitest';

import {
  clientErr,
  clientOk,
  type BrokerClientResult
} from '../result.ts';
import type { BootstrapDeliveryMessage } from './protocol.ts';
import { decodeBootstrapProtocolMessage } from './protocol.ts';
import {
  prepareManagedBunRecipeEnvironmentThenImport,
  type ManagedBunRecipeBootstrapRuntime
} from './bun-managed-recipe.ts';
import { MANAGED_ATTEMPT_ENVIRONMENT } from './managed-attempt.ts';

const slots = [{ slotId: 'weather-api', environmentName: 'WEATHER_API_TOKEN' }] as const;

const authorityFacts: Readonly<Record<string, string>> = {
  [MANAGED_ATTEMPT_ENVIRONMENT.repository]: 'R:\\Code\\weather',
  [MANAGED_ATTEMPT_ENVIRONMENT.recipeRevision]: 'recipe-revision-1',
  [MANAGED_ATTEMPT_ENVIRONMENT.grantId]: 'grant-1',
  [MANAGED_ATTEMPT_ENVIRONMENT.grantGeneration]: '3',
  [MANAGED_ATTEMPT_ENVIRONMENT.receiverId]: 'pm2',
  [MANAGED_ATTEMPT_ENVIRONMENT.processAttemptId]: 'attempt-1'
};

const delivery = (): BrokerClientResult<BootstrapDeliveryMessage> => {
  const decoded = decodeBootstrapProtocolMessage({
    protocolVersion: 'epsilonode.bootstrap/v1',
    messageKind: 'bootstrap-delivery',
    exchangeId: 'exchange-1',
    payload: {
      leaseId: 'lease-1',
      processAttemptId: 'attempt-1',
      expiresAtMs: 2_000,
      slots: [{
        slotId: 'weather-api',
        environmentName: 'WEATHER_API_TOKEN',
        secret: 'fixture-value-never-logged'
      }]
    }
  });
  return decoded.isOk() && decoded.value.messageKind === 'bootstrap-delivery'
    ? clientOk(decoded.value)
    : clientErr({ code: 'invalid-input', message: 'Fixture delivery is invalid.' });
};

const runtime = (): ManagedBunRecipeBootstrapRuntime => ({
  containment: {
    enter: () => Promise.resolve(clientOk({
      identity: {
        state: 'assigned',
        job: {
          kind: 'managed-windows-job-identity',
          value: `Local\\epsilonode.nebular.job.v1.${'ab'.repeat(32)}`
        },
        attempt: { kind: 'managed-windows-job-attempt-identity', value: 'attempt-1' },
        processId: 4_100
      },
      authority: {
        proveRetained: () => Promise.resolve(clientOk({
          state: 'already-contained',
          job: {
            kind: 'managed-windows-job-identity',
            value: `Local\\epsilonode.nebular.job.v1.${'ab'.repeat(32)}`
          },
          attempt: { kind: 'managed-windows-job-attempt-identity', value: 'attempt-1' },
          processId: 4_100
        }))
      }
    }))
  },
  authorityEnvironment: {
    read: name => authorityFacts[name],
    createExchangeId: () => 'exchange-1'
  },
  environment: {
    installAtomically: patch => Promise.resolve(clientOk({
      atomic: true,
      installedSlots: patch.slots,
      cleanup: { rollback: () => Promise.resolve(clientOk(undefined)) }
    }))
  },
  inheritedEnvironment: { names: () => [] },
  locations: {
    currentDirectory: () => 'R:\\Code\\weather',
    brokerEntrypoint: () => 'R:\\Tools\\nebular\\broker.js'
  },
  retry: { wait: () => Promise.resolve() },
  transports: {
    create: () => ({
      exchange: (request, consume) => {
        const response = delivery();
        return response.isErr()
          ? Promise.resolve(clientErr(response.error[0], ...response.error.slice(1)))
          : consume(response.value);
      }
    })
  },
  clock: { nowMs: () => 1_000 }
});

describe('managed Bun recipe bootstrap composition', () => {
  it('prepares the current PM2 attempt and defers application import until after installation', async () => {
    const fixture = runtime();
    const install = vi.fn(fixture.environment.installAtomically);
    const deferredImport = vi.fn(() => Promise.resolve({ started: true }));

    const result = await prepareManagedBunRecipeEnvironmentThenImport({
      slots
    }, deferredImport, {
      ...fixture,
      environment: { installAtomically: install }
    });

    expect(result.isOk()).toBe(true);
    expect(install).toHaveBeenCalledOnce();
    expect(deferredImport).toHaveBeenCalledOnce();
    expect(result.isOk() ? result.value.application : undefined).toEqual({ started: true });
    expect(result.isOk() ? result.value.environment.installedSlots : undefined).toEqual([{
      slotId: { kind: 'bootstrap-slot-id', value: 'weather-api' },
      environmentName: 'WEATHER_API_TOKEN'
    }]);
  });

  it('fails before transport construction when managed authority facts are missing', async () => {
    const fixture = runtime();
    const create = vi.fn(fixture.transports.create);
    const result = await prepareManagedBunRecipeEnvironmentThenImport({
      slots
    }, () => Promise.resolve({}), {
      ...fixture,
      authorityEnvironment: {
        ...fixture.authorityEnvironment,
        read: name => name === MANAGED_ATTEMPT_ENVIRONMENT.grantId
          ? undefined
          : authorityFacts[name]
      },
      transports: { create }
    });

    expect(result.isErr()).toBe(true);
    expect(create).not.toHaveBeenCalled();
  });

  it('redacts synchronous adapter defects', async () => {
    const fixture = runtime();
    const result = await prepareManagedBunRecipeEnvironmentThenImport({
      slots
    }, () => Promise.resolve({}), {
      ...fixture,
      transports: {
        create: () => {
          throw new Error('secret-like host detail');
        }
      }
    });

    expect(result.isErr()).toBe(true);
    expect(result.isErr() ? result.error[0].message : '').not.toContain('secret-like');
  });

  it('runs containment as the first effect before authority reads, exchange, installation, or import', async () => {
    const fixture = runtime();
    const effects: string[] = [];
    const result = await prepareManagedBunRecipeEnvironmentThenImport({ slots }, () => {
      effects.push('application-import');
      return Promise.resolve({ started: true });
    }, {
      ...fixture,
      containment: {
        enter: () => {
          effects.push('containment');
          return fixture.containment.enter();
        }
      },
      authorityEnvironment: {
        ...fixture.authorityEnvironment,
        read: name => {
          effects.push('authority-read');
          return fixture.authorityEnvironment.read(name);
        }
      },
      environment: {
        installAtomically: patch => {
          effects.push('secret-install');
          return fixture.environment.installAtomically(patch);
        }
      },
      transports: {
        create: options => {
          effects.push('transport-create');
          const transport = fixture.transports.create(options);
          return {
            exchange: (request, consume) => {
              effects.push('secret-exchange');
              return transport.exchange(request, consume);
            }
          };
        }
      }
    });

    expect(result.isOk()).toBe(true);
    expect(effects[0]).toBe('containment');
    expect(effects).toEqual([
      'containment',
      'authority-read',
      'authority-read',
      'authority-read',
      'authority-read',
      'authority-read',
      'authority-read',
      'transport-create',
      'secret-exchange',
      'secret-install',
      'application-import'
    ]);
  });

  it('stops before every downstream bootstrap effect when first-effect containment fails', async () => {
    const fixture = runtime();
    const read = vi.fn(fixture.authorityEnvironment.read);
    const create = vi.fn(fixture.transports.create);
    const install = vi.fn(fixture.environment.installAtomically);
    const deferredImport = vi.fn(() => Promise.resolve({ started: true }));

    const result = await prepareManagedBunRecipeEnvironmentThenImport({ slots }, deferredImport, {
      ...fixture,
      containment: {
        enter: () => Promise.resolve(clientErr({
          code: 'transport-unavailable',
          message: 'The managed Windows containment first effect is unavailable.'
        }))
      },
      authorityEnvironment: { ...fixture.authorityEnvironment, read },
      transports: { create },
      environment: { installAtomically: install }
    });

    expect(result.isErr()).toBe(true);
    expect(read).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(install).not.toHaveBeenCalled();
    expect(deferredImport).not.toHaveBeenCalled();
  });
});
