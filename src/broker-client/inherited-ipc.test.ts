import { describe, expect, it } from 'vitest';

import {
  BROKER_PROTOCOL_VERSION,
  runBrokerControlOverInheritedIpc,
  type BrokerControlMessage,
  type BrokerInheritedIpcRuntime,
  type BrokerIpcObserver,
  type BrokerIpcPeer,
  type BrokerIpcSpawnPlan
} from './public.ts';
import { clientOk, type BrokerClientResult } from './result.ts';

const successfulRuntime = () => {
  const sent: BrokerControlMessage[] = [];
  const plans: BrokerIpcSpawnPlan[] = [];
  let disconnects = 0;
  const runtime: BrokerInheritedIpcRuntime = {
    nowMs: () => 1_000,
    newRequestId: () => 'ipc-request-1',
    spawn: (plan, observer): BrokerClientResult<BrokerIpcPeer> => {
      plans.push(plan);
      const peer: BrokerIpcPeer = {
        send: message => {
          sent.push(message);
          queueMicrotask(() => {
            observer.onMessage({
              protocolVersion: BROKER_PROTOCOL_VERSION,
              messageKind: 'progress',
              requestId: plan.requestId,
              sequence: 2,
              sentAtMs: 1_002,
              payload: { phase: 'doctor', detail: 'Broker runtime is ready.' }
            }, peer);
            observer.onMessage({
              protocolVersion: BROKER_PROTOCOL_VERSION,
              messageKind: 'terminal-success',
              requestId: plan.requestId,
              sequence: 3,
              sentAtMs: 1_003,
              payload: { code: 'broker-ready', message: 'Broker runtime is ready.' }
            }, peer);
            observer.onExit(0);
          });
          return clientOk(undefined);
        },
        disconnect: () => { disconnects += 1; },
        terminate: () => undefined
      };
      queueMicrotask(() => observer.onMessage({
        protocolVersion: BROKER_PROTOCOL_VERSION,
        messageKind: 'hello',
        requestId: plan.requestId,
        sequence: 0,
        sentAtMs: 1_000,
        payload: { buildId: 'nebular-test', capabilities: ['doctor'] }
      }, peer));
      return clientOk(peer);
    }
  };
  return { runtime, sent, plans, disconnects: () => disconnects };
};

const request = {
  brokerEntrypoint: 'R:/fixture/broker.js',
  cwd: 'R:/fixture/repository',
  payload: { operation: 'doctor', credentialSlotIds: [] }
} as const;

describe('broker inherited Bun IPC client', () => {
  it('composes hello, one request, progress, terminal, disconnect, and helper exit', async () => {
    const fixture = successfulRuntime();
    const result = await runBrokerControlOverInheritedIpc(request, fixture.runtime);
    expect(result).toEqual(expect.objectContaining({
      value: {
        requestId: 'ipc-request-1',
        progress: [{ phase: 'doctor', detail: 'Broker runtime is ready.' }],
        terminal: { outcome: 'success', code: 'broker-ready', message: 'Broker runtime is ready.' },
        helperExitCode: 0
      }
    }));
    expect(fixture.sent).toEqual([
      expect.objectContaining({ messageKind: 'request', sequence: 1, payload: request.payload })
    ]);
    expect(fixture.plans).toEqual([
      expect.objectContaining({ requestId: 'ipc-request-1', brokerEntrypoint: request.brokerEntrypoint })
    ]);
    expect(fixture.disconnects()).toBe(0);
  });

  it('fails closed when the helper exits without a terminal result', async () => {
    const runtime: BrokerInheritedIpcRuntime = {
      nowMs: () => 1_000,
      newRequestId: () => 'ipc-request-2',
      spawn: (_plan, observer: BrokerIpcObserver) => {
        const peer: BrokerIpcPeer = {
          send: () => clientOk(undefined),
          disconnect: () => undefined,
          terminate: () => undefined
        };
        queueMicrotask(() => observer.onExit(7));
        return clientOk(peer);
      }
    };
    expect(await runBrokerControlOverInheritedIpc(request, runtime)).toEqual(expect.objectContaining({
      error: [expect.objectContaining({ code: 'transport-unavailable' })]
    }));
  });

  it('rejects invalid paths and unbounded deadlines before spawning', async () => {
    const fixture = successfulRuntime();
    const result = await runBrokerControlOverInheritedIpc({
      ...request,
      brokerEntrypoint: '',
      timeoutMs: Number.MAX_SAFE_INTEGER
    }, fixture.runtime);
    expect(result).toEqual(expect.objectContaining({ error: [expect.objectContaining({ code: 'invalid-input' })] }));
    expect(fixture.plans).toEqual([]);
  });
});
