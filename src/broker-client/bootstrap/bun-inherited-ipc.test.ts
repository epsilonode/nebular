import { describe, expect, it } from 'vitest';

import {
  BROKER_BOOTSTRAP_PROTOCOL_VERSION,
  createBootstrapAcknowledgement,
  createBootstrapRequest,
  decodeBootstrapProtocolMessage,
  type BootstrapDeliveryMessage,
  type BootstrapRequestMessage
} from './protocol.ts';
import {
  BROKER_BOOTSTRAP_BUILD_ID,
  createBunCooperativeBootstrapTransportPort,
  type BunBootstrapInheritedIpcRuntime,
  type BunBootstrapIpcPeer
} from './bun-inherited-ipc.ts';
import { clientOk } from '../result.ts';

const request = (): BootstrapRequestMessage => {
  const created = createBootstrapRequest({
    exchangeId: 'bootstrap-ipc-1',
    repository: 'R:/Code/example',
    recipeRevision: 'recipe-revision-1',
    grantId: 'grant-1',
    grantGeneration: 1,
    receiverId: 'pm2',
    processAttemptId: 'attempt-1',
    slots: [{ slotId: 'weather-api', environmentName: 'WEATHER_API_TOKEN' }]
  });
  if (created.isErr()) throw new Error('expected bootstrap IPC request fixture');
  return created.value;
};

const delivery = (): BootstrapDeliveryMessage => {
  const decoded = decodeBootstrapProtocolMessage({
    protocolVersion: BROKER_BOOTSTRAP_PROTOCOL_VERSION,
    messageKind: 'bootstrap-delivery',
    exchangeId: 'bootstrap-ipc-1',
    payload: {
      leaseId: 'lease-1',
      processAttemptId: 'attempt-1',
      expiresAtMs: 2_000,
      slots: [{ slotId: 'weather-api', environmentName: 'WEATHER_API_TOKEN', secret: 'IPC_CANARY' }]
    }
  });
  if (decoded.isErr() || decoded.value.messageKind !== 'bootstrap-delivery') {
    throw new Error('expected bootstrap IPC delivery fixture');
  }
  return decoded.value;
};

const helloWire = (): unknown => ({
  protocolVersion: BROKER_BOOTSTRAP_PROTOCOL_VERSION,
  messageKind: 'bootstrap-hello',
  exchangeId: 'bootstrap-ipc-1',
  payload: {
    buildId: BROKER_BOOTSTRAP_BUILD_ID,
    capabilities: ['atomic-environment-v1', 'secret-bundle-v1']
  }
});

const messageKind = (value: unknown): string | undefined =>
  typeof value === 'object' && value !== null && 'messageKind' in value &&
    typeof value.messageKind === 'string'
    ? value.messageKind
    : undefined;

describe('target-side Bun bootstrap inherited IPC adapter', () => {
  it('performs hello, request, delivery, acknowledgement, and helper exit in order', async () => {
    const sent: unknown[] = [];
    let rollbacks = 0;
    const response = delivery();
    const runtime: BunBootstrapInheritedIpcRuntime = {
      spawn: (_plan, observer) => {
        const peer: BunBootstrapIpcPeer = {
          send: message => {
            sent.push(message);
            if (messageKind(message) === 'bootstrap-request') {
              queueMicrotask(() => observer.onMessage({
                protocolVersion: BROKER_BOOTSTRAP_PROTOCOL_VERSION,
                messageKind: 'bootstrap-delivery',
                exchangeId: response.exchangeId.value,
                payload: {
                  leaseId: response.payload.leaseId.value,
                  processAttemptId: response.payload.processAttemptId.value,
                  expiresAtMs: response.payload.expiresAtMs,
                  slots: [{
                    slotId: 'weather-api',
                    environmentName: 'WEATHER_API_TOKEN',
                    secret: 'IPC_CANARY'
                  }]
                }
              }, peer));
            }
            if (messageKind(message) === 'bootstrap-acknowledgement') {
              queueMicrotask(() => observer.onExit(0));
            }
            return clientOk(undefined);
          },
          disconnect: () => undefined,
          terminate: () => undefined
        };
        queueMicrotask(() => observer.onMessage(helloWire(), peer));
        return clientOk(peer);
      }
    };
    const transport = createBunCooperativeBootstrapTransportPort({
      brokerEntrypoint: 'R:/fixture/broker.js',
      cwd: 'R:/Code/example'
    }, runtime);
    const result = await transport.exchange(request(), received => {
      if (received.messageKind !== 'bootstrap-delivery') {
        throw new Error('expected delivery response');
      }
      const acknowledged = createBootstrapAcknowledgement({
        exchangeId: received.exchangeId,
        leaseId: received.payload.leaseId,
        processAttemptId: received.payload.processAttemptId,
        installedSlotIds: request().payload.slots.map(slot => slot.slotId)
      });
      return Promise.resolve(acknowledged.map(acknowledgement => ({
        acknowledgement,
        value: { prepared: true as const },
        cleanup: {
          rollback: () => {
            rollbacks += 1;
            return Promise.resolve(clientOk(undefined));
          }
        }
      })));
    });

    expect(result).toEqual(expect.objectContaining({
      value: expect.objectContaining({ value: { prepared: true } })
    }));
    expect(sent.map(messageKind)).toEqual(['bootstrap-request', 'bootstrap-acknowledgement']);
    expect(rollbacks).toBe(0);
    expect(JSON.stringify(sent)).not.toContain('IPC_CANARY');
  });

  it('rejects a delivery before the required hello handshake', async () => {
    let terminated = 0;
    const runtime: BunBootstrapInheritedIpcRuntime = {
      spawn: (_plan, observer) => {
        const peer: BunBootstrapIpcPeer = {
          send: () => clientOk(undefined),
          disconnect: () => undefined,
          terminate: () => { terminated += 1; }
        };
        queueMicrotask(() => observer.onMessage({
          protocolVersion: BROKER_BOOTSTRAP_PROTOCOL_VERSION,
          messageKind: 'bootstrap-delivery',
          exchangeId: 'bootstrap-ipc-1',
          payload: {
            leaseId: 'lease-1',
            processAttemptId: 'attempt-1',
            expiresAtMs: 2_000,
            slots: []
          }
        }, peer));
        return clientOk(peer);
      }
    };
    const result = await createBunCooperativeBootstrapTransportPort({
      brokerEntrypoint: 'R:/fixture/broker.js',
      cwd: 'R:/Code/example'
    }, runtime).exchange(request(), () => {
      throw new Error('consume must remain unreachable');
    });

    expect(result).toEqual(expect.objectContaining({
      error: [expect.objectContaining({ code: 'protocol-mismatch' })]
    }));
    expect(terminated).toBe(1);
  });

  it('fails closed when the helper exits before acknowledgement', async () => {
    const runtime: BunBootstrapInheritedIpcRuntime = {
      spawn: (_plan, observer) => {
        const peer: BunBootstrapIpcPeer = {
          send: () => clientOk(undefined),
          disconnect: () => undefined,
          terminate: () => undefined
        };
        queueMicrotask(() => observer.onMessage(helloWire(), peer));
        queueMicrotask(() => observer.onExit(7));
        return clientOk(peer);
      }
    };
    const result = await createBunCooperativeBootstrapTransportPort({
      brokerEntrypoint: 'R:/fixture/broker.js',
      cwd: 'R:/Code/example'
    }, runtime).exchange(request(), () => {
      throw new Error('consume must remain unreachable');
    });

    expect(result).toEqual(expect.objectContaining({
      error: [expect.objectContaining({ code: 'transport-unavailable' })]
    }));
  });

  it('rolls back consumption when the helper fails after acknowledgement', async () => {
    let rollbacks = 0;
    const response = delivery();
    const runtime: BunBootstrapInheritedIpcRuntime = {
      spawn: (_plan, observer) => {
        const peer: BunBootstrapIpcPeer = {
          send: message => {
            if (messageKind(message) === 'bootstrap-request') {
              queueMicrotask(() => observer.onMessage({
                protocolVersion: BROKER_BOOTSTRAP_PROTOCOL_VERSION,
                messageKind: 'bootstrap-delivery',
                exchangeId: response.exchangeId.value,
                payload: {
                  leaseId: response.payload.leaseId.value,
                  processAttemptId: response.payload.processAttemptId.value,
                  expiresAtMs: response.payload.expiresAtMs,
                  slots: [{
                    slotId: 'weather-api',
                    environmentName: 'WEATHER_API_TOKEN',
                    secret: 'IPC_CANARY'
                  }]
                }
              }, peer));
            }
            if (messageKind(message) === 'bootstrap-acknowledgement') {
              queueMicrotask(() => observer.onExit(7));
            }
            return clientOk(undefined);
          },
          disconnect: () => undefined,
          terminate: () => undefined
        };
        queueMicrotask(() => observer.onMessage(helloWire(), peer));
        return clientOk(peer);
      }
    };
    const result = await createBunCooperativeBootstrapTransportPort({
      brokerEntrypoint: 'R:/fixture/broker.js',
      cwd: 'R:/Code/example'
    }, runtime).exchange(request(), received => {
      if (received.messageKind !== 'bootstrap-delivery') throw new Error('expected delivery response');
      const acknowledgement = createBootstrapAcknowledgement({
        exchangeId: received.exchangeId,
        leaseId: received.payload.leaseId,
        processAttemptId: received.payload.processAttemptId,
        installedSlotIds: request().payload.slots.map(slot => slot.slotId)
      });
      return Promise.resolve(acknowledgement.map(value => ({
        acknowledgement: value,
        value: { prepared: true as const },
        cleanup: {
          rollback: () => {
            rollbacks += 1;
            return Promise.resolve(clientOk(undefined));
          }
        }
      })));
    });

    expect(result).toEqual(expect.objectContaining({
      error: [expect.objectContaining({ code: 'transport-unavailable' })]
    }));
    expect(rollbacks).toBe(1);
  });
});
