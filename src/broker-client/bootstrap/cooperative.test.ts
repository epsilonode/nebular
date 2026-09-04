import { describe, expect, it } from 'vitest';

import {
  BROKER_BOOTSTRAP_PROTOCOL_VERSION,
  createBootstrapRequest,
  decodeBootstrapProtocolMessage,
  type BootstrapDeliveryMessage,
  type BootstrapRejectionCode,
  type BootstrapRequestMessage,
  type BootstrapResponseMessage
} from './protocol.ts';
import {
  planBootstrapEnvironmentPatch,
  prepareRecipeEnvironment,
  prepareRecipeEnvironmentThenImportWithRetry,
  prepareRecipeEnvironmentThenImport,
  prepareRecipeEnvironmentWithRetry,
  type BootstrapNotReadyRetryPort,
  type BootstrapEnvironmentInstallPort,
  type CooperativeBootstrapPorts,
  type CooperativeBootstrapTransportPort
} from './cooperative.ts';
import { clientErr, clientOk } from '../result.ts';

const request = (
  slots: readonly Readonly<{ slotId: string; environmentName: string }>[] = [
    { slotId: 'weather-api', environmentName: 'WEATHER_API_TOKEN' }
  ]
): BootstrapRequestMessage => {
  const created = createBootstrapRequest({
    exchangeId: 'bootstrap-1',
    repository: 'R:/Code/example',
    recipeRevision: 'recipe-revision-1',
    grantId: 'grant-1',
    grantGeneration: 3,
    receiverId: 'pm2',
    processAttemptId: 'attempt-1',
    slots
  });
  if (created.isErr()) throw new Error('expected valid bootstrap request fixture');
  return created.value;
};

const delivery = (
  slots: readonly Readonly<{ slotId: string; environmentName: string; secret: string }>[] = [
    { slotId: 'weather-api', environmentName: 'WEATHER_API_TOKEN', secret: 'SECRET_CANARY' }
  ],
  overrides: Readonly<{ exchangeId?: string; processAttemptId?: string; expiresAtMs?: number }> = {}
): BootstrapDeliveryMessage => {
  const decoded = decodeBootstrapProtocolMessage({
    protocolVersion: BROKER_BOOTSTRAP_PROTOCOL_VERSION,
    messageKind: 'bootstrap-delivery',
    exchangeId: overrides.exchangeId ?? 'bootstrap-1',
    payload: {
      leaseId: 'lease-1',
      processAttemptId: overrides.processAttemptId ?? 'attempt-1',
      expiresAtMs: overrides.expiresAtMs ?? 2_000,
      slots
    }
  });
  if (decoded.isErr() || decoded.value.messageKind !== 'bootstrap-delivery') {
    throw new Error('expected valid bootstrap delivery fixture');
  }
  return decoded.value;
};

const rejection = (code: BootstrapRejectionCode): BootstrapResponseMessage => {
  const decoded = decodeBootstrapProtocolMessage({
    protocolVersion: BROKER_BOOTSTRAP_PROTOCOL_VERSION,
    messageKind: 'bootstrap-rejected',
    exchangeId: 'bootstrap-1',
    payload: { code }
  });
  if (decoded.isErr() || decoded.value.messageKind !== 'bootstrap-rejected') {
    throw new Error('expected valid bootstrap rejection fixture');
  }
  return decoded.value;
};

const successPorts = (
  response: BootstrapResponseMessage,
  inspectSecret: (environmentName: string, secretText: string) => void = () => undefined
): CooperativeBootstrapPorts => {
  const transport: CooperativeBootstrapTransportPort = {
    exchange: (_request, consume) => consume(response)
  };
  const environment: BootstrapEnvironmentInstallPort = {
    installAtomically: patch => Promise.resolve((() => {
      patch.entries.forEach(entry => entry.secret.withValue(secretText =>
        inspectSecret(entry.environmentName, secretText)));
      return clientOk({
        atomic: true,
        installedSlots: patch.slots,
        cleanup: { rollback: () => Promise.resolve(clientOk(undefined)) }
      });
    })())
  };
  return { clock: { nowMs: () => 1_000 }, environment, transport };
};

describe('cooperative bootstrap environment planning', () => {
  it('plans an exact all-or-nothing patch whose default projection is redacted', () => {
    const canary = 'SECRET_CANARY_PATCH';
    const planned = planBootstrapEnvironmentPatch(
      request(),
      delivery([{ slotId: 'weather-api', environmentName: 'WEATHER_API_TOKEN', secret: canary }]),
      ['PATH', 'CI'],
      1_000
    );
    if (planned.isErr()) throw new Error('expected valid environment patch');

    const observed = planned.value.entries[0]?.secret.withValue(secretText => secretText);
    expect(observed).toBe(canary);
    expect(planned.value.slots).toEqual([expect.objectContaining({ environmentName: 'WEATHER_API_TOKEN' })]);
    expect(JSON.stringify(planned.value)).not.toContain(canary);
  });

  it.each([
    {
      name: 'Windows case-fold collision with inherited environment',
      requested: request(),
      delivered: delivery(),
      inherited: ['weather_api_token'],
      nowMs: 1_000,
      code: 'environment-invalid'
    },
    {
      name: 'reserved runtime loader name',
      requested: request([{ slotId: 'weather-api', environmentName: 'NODE_OPTIONS' }]),
      delivered: delivery([{ slotId: 'weather-api', environmentName: 'NODE_OPTIONS', secret: 'secret' }]),
      inherited: [],
      nowMs: 1_000,
      code: 'environment-invalid'
    },
    {
      name: 'reserved broker authority name under Windows case folding',
      requested: request([{ slotId: 'weather-api', environmentName: 'nebular_pm2_job_identity' }]),
      delivered: delivery([{
        slotId: 'weather-api',
        environmentName: 'nebular_pm2_job_identity',
        secret: 'secret'
      }]),
      inherited: [],
      nowMs: 1_000,
      code: 'environment-invalid'
    },
    {
      name: 'reserved process search path',
      requested: request([{ slotId: 'weather-api', environmentName: 'PATH' }]),
      delivered: delivery([{ slotId: 'weather-api', environmentName: 'PATH', secret: 'secret' }]),
      inherited: [],
      nowMs: 1_000,
      code: 'environment-invalid'
    },
    {
      name: 'undeclared delivered slot',
      requested: request(),
      delivered: delivery([
        { slotId: 'weather-api', environmentName: 'WEATHER_API_TOKEN', secret: 'secret' },
        { slotId: 'extra-api', environmentName: 'EXTRA_API_TOKEN', secret: 'extra' }
      ]),
      inherited: [],
      nowMs: 1_000,
      code: 'environment-invalid'
    },
    {
      name: 'missing delivered slot',
      requested: request(),
      delivered: delivery([]),
      inherited: [],
      nowMs: 1_000,
      code: 'environment-invalid'
    },
    {
      name: 'expired lease',
      requested: request(),
      delivered: delivery(undefined, { expiresAtMs: 1_000 }),
      inherited: [],
      nowMs: 1_000,
      code: 'bootstrap-expired'
    },
    {
      name: 'attempt mismatch',
      requested: request(),
      delivered: delivery(undefined, { processAttemptId: 'attempt-2' }),
      inherited: [],
      nowMs: 1_000,
      code: 'bootstrap-rejected'
    }
  ])('rejects $name before installation', fixture => {
    expect(planBootstrapEnvironmentPatch(
      fixture.requested,
      fixture.delivered,
      fixture.inherited,
      fixture.nowMs
    )).toEqual(expect.objectContaining({
      error: [expect.objectContaining({ code: fixture.code })]
    }));
  });

  it('rejects NUL secret text even if an adapter forges an opaque capability', () => {
    const valid = delivery();
    const declaredSlot = request().payload.slots[0];
    if (declaredSlot === undefined) throw new Error('expected declared bootstrap slot fixture');
    const forged: BootstrapDeliveryMessage = {
      ...valid,
      payload: {
        ...valid.payload,
        secrets: {
          slots: [{
            slotId: declaredSlot.slotId,
            environmentName: 'WEATHER_API_TOKEN',
            secret: { withValue: consume => consume('secret\0suffix') }
          }]
        }
      }
    };
    expect(planBootstrapEnvironmentPatch(request(), forged, [], 1_000)).toEqual(expect.objectContaining({
      error: [expect.objectContaining({ code: 'environment-invalid' })]
    }));
  });
});

describe('cooperative bootstrap composition', () => {
  it('installs every admitted slot, emits a redacted acknowledgement, and returns no secret', async () => {
    const canary = 'SECRET_CANARY_PREPARE';
    const observations: readonly string[][] = [];
    const mutableObservations = observations as string[][];
    const response = delivery([{
      slotId: 'weather-api',
      environmentName: 'WEATHER_API_TOKEN',
      secret: canary
    }]);
    let acknowledgement = '';
    const base = successPorts(response, (name, value) => mutableObservations.push([name, value]));
    const ports: CooperativeBootstrapPorts = {
      ...base,
      transport: {
        exchange: (_request, consume) => consume(response).then(result => {
          if (result.isOk()) acknowledgement = JSON.stringify(result.value.acknowledgement);
          return result;
        })
      }
    };

    const prepared = await prepareRecipeEnvironment({
      request: request(),
      inheritedEnvironmentNames: ['PATH']
    }, ports);

    expect(prepared).toEqual(expect.objectContaining({
      value: expect.objectContaining({
        state: 'prepared',
        installedSlots: [expect.objectContaining({ environmentName: 'WEATHER_API_TOKEN' })]
      })
    }));
    expect(mutableObservations).toEqual([['WEATHER_API_TOKEN', canary]]);
    expect(acknowledgement).toContain('weather-api');
    expect(acknowledgement).not.toContain(canary);
    expect(JSON.stringify(prepared)).not.toContain(canary);
  });

  it('does not invoke the atomic installer when any delivered slot is invalid', async () => {
    let installs = 0;
    const response = delivery([
      { slotId: 'weather-api', environmentName: 'WEATHER_API_TOKEN', secret: 'secret' },
      { slotId: 'undeclared', environmentName: 'UNDECLARED_TOKEN', secret: 'secret-2' }
    ]);
    const ports: CooperativeBootstrapPorts = {
      clock: { nowMs: () => 1_000 },
      transport: { exchange: (_request, consume) => consume(response) },
      environment: {
        installAtomically: () => {
          installs += 1;
          return Promise.resolve(clientErr({ code: 'environment-invalid', message: 'must not run' }));
        }
      }
    };

    const prepared = await prepareRecipeEnvironment({
      request: request(),
      inheritedEnvironmentNames: []
    }, ports);
    expect(prepared).toEqual(expect.objectContaining({
      error: [expect.objectContaining({ code: 'environment-invalid' })]
    }));
    expect(installs).toBe(0);
  });

  it('evaluates a deferred application only after atomic preparation succeeds', async () => {
    const events: string[] = [];
    const response = delivery();
    const base = successPorts(response, () => events.push('installed'));
    const loaded = await prepareRecipeEnvironmentThenImport({
      request: request(),
      inheritedEnvironmentNames: []
    }, base, () => {
      events.push('application-evaluated');
      return Promise.resolve({ ready: true as const });
    });

    expect(events).toEqual(['installed', 'application-evaluated']);
    expect(loaded).toEqual(expect.objectContaining({
      value: expect.objectContaining({ application: { ready: true } })
    }));
  });

  it('keeps application code unevaluated after a redacted broker rejection', async () => {
    const rejected = decodeBootstrapProtocolMessage({
      protocolVersion: BROKER_BOOTSTRAP_PROTOCOL_VERSION,
      messageKind: 'bootstrap-rejected',
      exchangeId: 'bootstrap-1',
      payload: { code: 'grant-revoked' }
    });
    if (rejected.isErr() || rejected.value.messageKind !== 'bootstrap-rejected') {
      throw new Error('expected rejected bootstrap response fixture');
    }
    let evaluated = false;
    const loaded = await prepareRecipeEnvironmentThenImport({
      request: request(),
      inheritedEnvironmentNames: []
    }, successPorts(rejected.value), () => {
      evaluated = true;
      return Promise.resolve({ ready: true });
    });

    expect(loaded).toEqual(expect.objectContaining({
      error: [expect.objectContaining({
        code: 'bootstrap-rejected',
        message: 'The repository-scoped grant is revoked.'
      })]
    }));
    expect(evaluated).toBe(false);
  });

  it('retries only transient not-ready responses and installs exactly once after receiver binding', async () => {
    const responses: BootstrapResponseMessage[] = [
      rejection('attempt-not-ready'),
      rejection('attempt-not-ready'),
      delivery()
    ];
    const waits: number[] = [];
    let exchanges = 0;
    let installs = 0;
    const base = successPorts(delivery());
    const ports: CooperativeBootstrapPorts = {
      ...base,
      transport: {
        exchange: (_request, consume) => {
          const response = responses[exchanges];
          exchanges += 1;
          return response === undefined
            ? Promise.resolve(clientErr({ code: 'transport-unavailable', message: 'fixture exhausted' }))
            : consume(response);
        }
      },
      environment: {
        installAtomically: patch => {
          installs += 1;
          return base.environment.installAtomically(patch);
        }
      }
    };
    const retry: BootstrapNotReadyRetryPort = {
      wait: delayMs => {
        waits.push(delayMs);
        return Promise.resolve();
      }
    };

    const prepared = await prepareRecipeEnvironmentWithRetry({
      request: request(),
      inheritedEnvironmentNames: []
    }, ports, retry, { maximumAttempts: 3, delayMs: 25 });

    expect(prepared.isOk()).toBe(true);
    expect(exchanges).toBe(3);
    expect(waits).toEqual([25, 25]);
    expect(installs).toBe(1);
  });

  it('bounds not-ready retries and never retries a terminal authority denial', async () => {
    const observed: string[] = [];
    const retry: BootstrapNotReadyRetryPort = {
      wait: () => {
        observed.push('wait');
        return Promise.resolve();
      }
    };
    const portsFor = (response: BootstrapResponseMessage): CooperativeBootstrapPorts => ({
      ...successPorts(response),
      transport: {
        exchange: (_request, consume) => {
          observed.push('exchange');
          return consume(response);
        }
      }
    });

    const exhausted = await prepareRecipeEnvironmentWithRetry({
      request: request(),
      inheritedEnvironmentNames: []
    }, portsFor(rejection('attempt-not-ready')), retry, { maximumAttempts: 2, delayMs: 10 });
    expect(exhausted).toEqual(expect.objectContaining({
      error: [expect.objectContaining({ code: 'bootstrap-not-ready' })]
    }));
    expect(observed).toEqual(['exchange', 'wait', 'exchange']);

    observed.splice(0);
    const denied = await prepareRecipeEnvironmentWithRetry({
      request: request(),
      inheritedEnvironmentNames: []
    }, portsFor(rejection('grant-revoked')), retry, { maximumAttempts: 3, delayMs: 10 });
    expect(denied).toEqual(expect.objectContaining({
      error: [expect.objectContaining({ code: 'bootstrap-rejected' })]
    }));
    expect(observed).toEqual(['exchange']);
  });

  it('rejects an invalid retry policy before transport and defers import through successful retry', async () => {
    let exchanges = 0;
    let evaluated = false;
    const responses: BootstrapResponseMessage[] = [rejection('attempt-not-ready'), delivery()];
    const base = successPorts(delivery());
    const ports: CooperativeBootstrapPorts = {
      ...base,
      transport: {
        exchange: (_request, consume) => {
          const response = responses[exchanges];
          exchanges += 1;
          return response === undefined
            ? Promise.resolve(clientErr({ code: 'transport-unavailable', message: 'fixture exhausted' }))
            : consume(response);
        }
      }
    };
    const retry: BootstrapNotReadyRetryPort = { wait: () => Promise.resolve() };
    const invalid = await prepareRecipeEnvironmentWithRetry({
      request: request(),
      inheritedEnvironmentNames: []
    }, ports, retry, { maximumAttempts: 0, delayMs: 10 });
    expect(invalid).toEqual(expect.objectContaining({
      error: [expect.objectContaining({ code: 'invalid-input' })]
    }));
    expect(exchanges).toBe(0);

    const loaded = await prepareRecipeEnvironmentThenImportWithRetry({
      request: request(),
      inheritedEnvironmentNames: []
    }, ports, retry, { maximumAttempts: 2, delayMs: 10 }, () => {
      evaluated = true;
      return Promise.resolve({ ready: true as const });
    });
    expect(loaded.isOk()).toBe(true);
    expect(exchanges).toBe(2);
    expect(evaluated).toBe(true);
  });

  it('redacts a failed retry scheduler and performs no further exchange', async () => {
    let exchanges = 0;
    const response = rejection('attempt-not-ready');
    const ports: CooperativeBootstrapPorts = {
      ...successPorts(response),
      transport: {
        exchange: (_request, consume) => {
          exchanges += 1;
          return consume(response);
        }
      }
    };
    const result = await prepareRecipeEnvironmentWithRetry({
      request: request(),
      inheritedEnvironmentNames: []
    }, ports, {
      wait: () => Promise.reject(new Error('private scheduler diagnostic'))
    }, { maximumAttempts: 3, delayMs: 10 });

    expect(result).toEqual(expect.objectContaining({
      error: [expect.objectContaining({ code: 'transport-unavailable' })]
    }));
    expect(JSON.stringify(result)).not.toContain('private scheduler diagnostic');
    expect(exchanges).toBe(1);
  });

  it('rolls back an installed environment when deferred application import fails', async () => {
    let rollbacks = 0;
    const response = delivery();
    const base = successPorts(response);
    const ports: CooperativeBootstrapPorts = {
      ...base,
      environment: {
        installAtomically: patch => Promise.resolve(clientOk({
          atomic: true,
          installedSlots: patch.slots,
          cleanup: {
            rollback: () => {
              rollbacks += 1;
              return Promise.resolve(clientOk(undefined));
            }
          }
        }))
      }
    };

    const loaded = await prepareRecipeEnvironmentThenImport({
      request: request(),
      inheritedEnvironmentNames: []
    }, ports, () => Promise.reject(new Error('synthetic import failure')));

    expect(loaded).toEqual(expect.objectContaining({
      error: [expect.objectContaining({ code: 'application-import-failed' })]
    }));
    expect(rollbacks).toBe(1);
  });
});
