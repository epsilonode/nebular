import { describe, expect, it } from 'vitest';

import {
  BROKER_BOOTSTRAP_PROTOCOL_VERSION,
  createBootstrapRequest,
  decodeBootstrapProtocolMessage,
  type BootstrapDeliveryMessage,
  type BootstrapRequestMessage
} from './protocol.ts';
import { planBootstrapEnvironmentPatch } from './cooperative.ts';
import {
  createBunProcessEnvironmentInstallPort,
  type BunProcessEnvironmentRuntime
} from './bun-process-environment.ts';
import { clientErr, clientOk } from '../result.ts';

const request = (): BootstrapRequestMessage => {
  const created = createBootstrapRequest({
    exchangeId: 'bootstrap-env-1',
    repository: 'R:/Code/example',
    recipeRevision: 'recipe-revision-1',
    grantId: 'grant-1',
    grantGeneration: 1,
    receiverId: 'pm2',
    processAttemptId: 'attempt-1',
    slots: [
      { slotId: 'weather-api', environmentName: 'WEATHER_API_TOKEN' },
      { slotId: 'alerts-api', environmentName: 'ALERTS_API_TOKEN' }
    ]
  });
  if (created.isErr()) throw new Error('expected process environment request fixture');
  return created.value;
};

const delivery = (): BootstrapDeliveryMessage => {
  const decoded = decodeBootstrapProtocolMessage({
    protocolVersion: BROKER_BOOTSTRAP_PROTOCOL_VERSION,
    messageKind: 'bootstrap-delivery',
    exchangeId: 'bootstrap-env-1',
    payload: {
      leaseId: 'lease-1',
      processAttemptId: 'attempt-1',
      expiresAtMs: 2_000,
      slots: [
        { slotId: 'weather-api', environmentName: 'WEATHER_API_TOKEN', secret: 'WEATHER_CANARY' },
        { slotId: 'alerts-api', environmentName: 'ALERTS_API_TOKEN', secret: 'ALERTS_CANARY' }
      ]
    }
  });
  if (decoded.isErr() || decoded.value.messageKind !== 'bootstrap-delivery') {
    throw new Error('expected process environment delivery fixture');
  }
  return decoded.value;
};

const patch = () => {
  const planned = planBootstrapEnvironmentPatch(request(), delivery(), ['PATH'], 1_000);
  if (planned.isErr()) throw new Error('expected process environment patch fixture');
  return planned.value;
};

const fakeRuntime = (
  initial: Readonly<Record<string, string>> = {},
  failOnWrite?: string
): Readonly<{
  runtime: BunProcessEnvironmentRuntime;
  snapshot: () => Readonly<Record<string, string>>;
  writes: () => readonly string[];
  removals: () => readonly string[];
}> => {
  const values = new Map(Object.entries(initial));
  const written: string[] = [];
  const removed: string[] = [];
  return {
    runtime: {
      names: () => [...values.keys()],
      write: (name, value) => {
        written.push(name);
        if (name === failOnWrite) {
          return clientErr({ code: 'environment-invalid', message: 'Injected environment write failure.' });
        }
        values.set(name, value);
        return clientOk(undefined);
      },
      remove: name => {
        removed.push(name);
        values.delete(name);
        return clientOk(undefined);
      }
    },
    snapshot: () => Object.fromEntries(values),
    writes: () => [...written],
    removals: () => [...removed]
  };
};

describe('Bun current-process environment adapter', () => {
  it('installs a complete patch and returns only redacted receipt facts', async () => {
    const fake = fakeRuntime({ PATH: 'fixture-path' });
    const installed = await createBunProcessEnvironmentInstallPort(fake.runtime).installAtomically(patch());

    expect(installed).toEqual(expect.objectContaining({
      value: expect.objectContaining({
        atomic: true,
        installedSlots: request().payload.slots
      })
    }));
    expect(fake.snapshot()).toEqual({
      PATH: 'fixture-path',
      WEATHER_API_TOKEN: 'WEATHER_CANARY',
      ALERTS_API_TOKEN: 'ALERTS_CANARY'
    });
    expect(JSON.stringify(installed)).not.toMatch(/WEATHER_CANARY|ALERTS_CANARY/u);
    if (installed.isErr()) return;
    expect((await installed.value.cleanup.rollback()).isOk()).toBe(true);
    expect((await installed.value.cleanup.rollback()).isOk()).toBe(true);
    expect(fake.snapshot()).toEqual({ PATH: 'fixture-path' });
    expect(fake.removals()).toEqual(['ALERTS_API_TOKEN', 'WEATHER_API_TOKEN']);
  });

  it('rolls back every prior write after a later write fails', async () => {
    const fake = fakeRuntime({ PATH: 'fixture-path' }, 'ALERTS_API_TOKEN');
    const installed = await createBunProcessEnvironmentInstallPort(fake.runtime).installAtomically(patch());

    expect(installed).toEqual(expect.objectContaining({
      error: [expect.objectContaining({ code: 'environment-invalid' })]
    }));
    expect(fake.writes()).toEqual(['WEATHER_API_TOKEN', 'ALERTS_API_TOKEN']);
    expect(fake.removals()).toEqual(['WEATHER_API_TOKEN']);
    expect(fake.snapshot()).toEqual({ PATH: 'fixture-path' });
    expect(JSON.stringify(installed)).not.toMatch(/WEATHER_CANARY|ALERTS_CANARY/u);
  });

  it('rejects case-folded existing names before reading or writing a secret patch', async () => {
    const fake = fakeRuntime({ weather_api_token: 'existing-value' });
    const installed = await createBunProcessEnvironmentInstallPort(fake.runtime).installAtomically(patch());

    expect(installed).toEqual(expect.objectContaining({
      error: [expect.objectContaining({ code: 'environment-invalid' })]
    }));
    expect(fake.writes()).toEqual([]);
    expect(fake.snapshot()).toEqual({ weather_api_token: 'existing-value' });
  });
});
