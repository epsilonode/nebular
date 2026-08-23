import { describe, expect, it } from 'vitest';

import {
  BROKER_PROTOCOL_VERSION,
  type BrokerControlMessage
} from '../broker-client/public.ts';
import {
  runBrokerInheritedIpcChild,
  type BrokerInheritedIpcChildRuntime,
  type BrokerIpcDeadline,
  type BrokerIpcSubscription
} from './bun-inherited-ipc.ts';
import { brokerOk, brokerTaskOk, type BrokerResult } from './result.ts';

const runtimeFixture = (request: unknown) => {
  const sent: BrokerControlMessage[] = [];
  let receive: ((message: unknown) => void) | undefined;
  let disconnects = 0;
  const runtime: BrokerInheritedIpcChildRuntime = {
    nowMs: () => 1_000,
    listenOnce: handler => {
      receive = handler;
      return brokerOk<BrokerIpcSubscription>({ dispose: () => { receive = undefined; } });
    },
    send: message => {
      sent.push(message);
      if (message.messageKind === 'hello') queueMicrotask(() => receive?.(request));
      return brokerTaskOk(undefined);
    },
    disconnect: (): BrokerResult<void> => {
      disconnects += 1;
      return brokerOk(undefined);
    },
    schedule: (): BrokerIpcDeadline => ({ cancel: () => undefined })
  };
  return { runtime, sent, disconnects: () => disconnects };
};

const doctorRequest = {
  protocolVersion: BROKER_PROTOCOL_VERSION,
  messageKind: 'request',
  requestId: 'child-request-1',
  sequence: 1,
  sentAtMs: 1_001,
  payload: { operation: 'doctor', credentialSlotIds: [] }
} as const;

describe('broker inherited IPC child', () => {
  it('serves one bounded doctor request and closes its inherited channel', async () => {
    const fixture = runtimeFixture(doctorRequest);
    const result = await runBrokerInheritedIpcChild({ requestId: 'child-request-1' }, fixture.runtime);
    expect(result.isOk()).toBe(true);
    expect(fixture.sent.map(message => message.messageKind)).toEqual([
      'hello',
      'progress',
      'terminal-success'
    ]);
    expect(fixture.disconnects()).toBe(1);
  });

  it('emits a correlated protocol error for malformed input and exits typed', async () => {
    const fixture = runtimeFixture({ ...doctorRequest, secret: 'must-not-cross-control-ipc' });
    const result = await runBrokerInheritedIpcChild({ requestId: 'child-request-1' }, fixture.runtime);
    expect(result).toEqual(expect.objectContaining({ error: [expect.objectContaining({ code: 'ipc-invalid' })] }));
    expect(fixture.sent.at(-1)).toEqual(expect.objectContaining({
      messageKind: 'protocol-error',
      requestId: 'child-request-1',
      sequence: 1
    }));
    expect(fixture.disconnects()).toBe(1);
  });

  it('rejects an invalid correlation id before installing a listener', async () => {
    const fixture = runtimeFixture(doctorRequest);
    expect(await runBrokerInheritedIpcChild({ requestId: '' }, fixture.runtime)).toEqual(expect.objectContaining({
      error: [expect.objectContaining({ code: 'ipc-invalid' })]
    }));
    expect(fixture.sent).toEqual([]);
  });
});
