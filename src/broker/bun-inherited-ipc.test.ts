import { describe, expect, it } from 'vitest';

import {
  BROKER_PROTOCOL_VERSION,
  type BrokerControlMessage
} from '../broker-client/public.ts';
import {
  runBrokerInheritedIpcChild,
  type BrokerInheritedIpcChildRuntime,
  type BrokerIpcDeadline,
  type BrokerIpcSubscription,
  type BrokerIpcSubscriptionObserver
} from './bun-inherited-ipc.ts';
import type { BrokerOperationOutcome, BrokerOperationPort } from './operation.ts';
import { brokerOk, type BrokerResult } from './result.ts';

type RuntimeFixtureOptions = Readonly<{
  cancelThrows?: boolean;
  deliverRequest?: boolean;
  disposeThrows?: boolean;
  sendRejects?: boolean;
}>;

const runtimeFixture = (request: unknown, options: RuntimeFixtureOptions = {}) => {
  const sent: BrokerControlMessage[] = [];
  let observer: BrokerIpcSubscriptionObserver | undefined;
  let deadlineAction: (() => void) | undefined;
  let deadlineActive = false;
  let disconnects = 0;
  let cancellations = 0;
  let disposals = 0;
  const runtime: BrokerInheritedIpcChildRuntime = {
    nowMs: () => 1_000,
    subscribe: handler => {
      observer = handler;
      return brokerOk<BrokerIpcSubscription>({
        dispose: () => {
          disposals += 1;
          observer = undefined;
          if (options.disposeThrows === true) throw new Error('private-dispose-detail');
        }
      });
    },
    send: message => {
      sent.push(message);
      if (message.messageKind === 'hello' && options.deliverRequest !== false) {
        queueMicrotask(() => observer?.onMessage(request));
      }
      return options.sendRejects === true
        ? Promise.reject(new Error('private-send-detail'))
        : Promise.resolve(brokerOk(undefined));
    },
    disconnect: (): BrokerResult<void> => {
      disconnects += 1;
      return brokerOk(undefined);
    },
    schedule: (_afterMs, action): BrokerIpcDeadline => {
      deadlineAction = action;
      deadlineActive = true;
      return {
        cancel: () => {
          cancellations += 1;
          deadlineActive = false;
          if (options.cancelThrows === true) throw new Error('private-cancel-detail');
        }
      };
    }
  };
  return {
    runtime,
    sent,
    disconnects: () => disconnects,
    cancellations: () => cancellations,
    disposals: () => disposals,
    deliver: (message: unknown) => observer?.onMessage(message),
    disconnect: () => observer?.onDisconnect(),
    expire: () => { if (deadlineActive) deadlineAction?.(); }
  };
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
    expect(fixture.cancellations()).toBe(1);
    expect(fixture.disposals()).toBe(1);
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
    expect(fixture.cancellations()).toBe(1);
    expect(fixture.disposals()).toBe(1);
  });

  it('rejects an invalid correlation id before installing a listener', async () => {
    const fixture = runtimeFixture(doctorRequest);
    expect(await runBrokerInheritedIpcChild({ requestId: '' }, fixture.runtime)).toEqual(expect.objectContaining({
      error: [expect.objectContaining({ code: 'ipc-invalid' })]
    }));
    expect(fixture.sent).toEqual([]);
    expect(fixture.disconnects()).toBe(0);
    expect(fixture.cancellations()).toBe(0);
    expect(fixture.disposals()).toBe(0);
  });

  it.each([
    ['synchronously throws', (): ReturnType<BrokerOperationPort['execute']> => {
      throw new Error('private-operation-sync-detail');
    }],
    ['rejects', () => Promise.reject(new Error('private-operation-rejection-detail'))]
  ] as const)('redacts an operation port that %s and still finalizes once', async (_case, execute) => {
    const fixture = runtimeFixture(doctorRequest);
    const operations: BrokerOperationPort = { execute };
    const result = await runBrokerInheritedIpcChild(
      { requestId: 'child-request-1' },
      fixture.runtime,
      operations
    );

    expect(result.isOk()).toBe(true);
    expect(fixture.sent.at(-1)).toEqual(expect.objectContaining({
      messageKind: 'terminal-failure',
      payload: {
        code: 'receiver-failed',
        message: 'The broker operation failed at a typed authority boundary.'
      }
    }));
    expect(JSON.stringify(fixture.sent)).not.toContain('private-operation');
    expect(fixture.disconnects()).toBe(1);
    expect(fixture.cancellations()).toBe(1);
    expect(fixture.disposals()).toBe(1);
  });

  it('turns the bounded deadline into one terminal cancellation and finalizes once', async () => {
    const fixture = runtimeFixture(undefined, { deliverRequest: false });
    const serving = runBrokerInheritedIpcChild({ requestId: 'child-request-1' }, fixture.runtime);
    fixture.expire();
    const result = await serving;

    expect(result).toEqual(expect.objectContaining({ error: [expect.objectContaining({ code: 'ipc-invalid' })] }));
    expect(fixture.sent.map(message => message.messageKind)).toEqual(['hello', 'protocol-error']);
    expect(fixture.sent.at(-1)).toEqual(expect.objectContaining({
      messageKind: 'protocol-error',
      payload: expect.objectContaining({ code: 'ipc-timeout' })
    }));
    expect(fixture.disconnects()).toBe(1);
    expect(fixture.cancellations()).toBe(1);
    expect(fixture.disposals()).toBe(1);
  });

  it('retires the request-arrival deadline once execution becomes active', async () => {
    const fixture = runtimeFixture(doctorRequest);
    const control: { complete?: (result: BrokerResult<BrokerOperationOutcome>) => void } = {};
    const operations: BrokerOperationPort = {
      execute: () => new Promise(resolve => { control.complete = resolve; })
    };
    const serving = runBrokerInheritedIpcChild(
      { requestId: 'child-request-1' },
      fixture.runtime,
      operations
    );
    await Promise.resolve();
    expect(control.complete).toBeTypeOf('function');
    fixture.expire();
    control.complete?.(brokerOk({
      outcome: 'success',
      code: 'completed',
      message: 'Execution completed after the request-arrival timer was retired.',
      progress: []
    }));
    const result = await serving;

    expect(result.isOk()).toBe(true);
    expect(fixture.sent.map(message => message.messageKind)).toEqual(['hello', 'terminal-success']);
    expect(fixture.disconnects()).toBe(1);
    expect(fixture.cancellations()).toBe(1);
    expect(fixture.disposals()).toBe(1);
  });

  it('aborts once and emits cancellation terminal only after operation cleanup resolves', async () => {
    const fixture = runtimeFixture(doctorRequest);
    const control: {
      signal?: AbortSignal;
      finishCleanup?: () => void;
    } = {};
    const operations: BrokerOperationPort = {
      execute: (_request, _nowMs, context) => new Promise(resolve => {
        if (context?.signal !== undefined) control.signal = context.signal;
        control.finishCleanup = () => resolve(brokerOk({
          outcome: 'failure',
          code: 'cleanup-finished',
          message: 'Operation cleanup completed after cancellation.',
          progress: []
        }));
      })
    };
    const serving = runBrokerInheritedIpcChild(
      { requestId: 'child-request-1' },
      fixture.runtime,
      operations
    );
    await Promise.resolve();
    expect(control.signal?.aborted).toBe(false);

    const cancellation = {
      protocolVersion: BROKER_PROTOCOL_VERSION,
      messageKind: 'cancel',
      requestId: 'child-request-1',
      sequence: 2,
      sentAtMs: 1_002,
      payload: { expectedGeneration: 0 }
    } as const;
    fixture.deliver(cancellation);
    fixture.deliver(cancellation);
    expect(control.signal?.aborted).toBe(true);
    expect(fixture.sent.map(message => message.messageKind)).toEqual(['hello']);

    control.finishCleanup?.();
    const result = await serving;

    expect(result.isOk()).toBe(true);
    expect(fixture.sent).toEqual([
      expect.objectContaining({ messageKind: 'hello', sequence: 0 }),
      expect.objectContaining({
        messageKind: 'terminal-failure',
        sequence: 3,
        payload: expect.objectContaining({ code: 'request-cancelled' })
      })
    ]);
    expect(fixture.disconnects()).toBe(1);
    expect(fixture.disposals()).toBe(1);
  });

  it('attempts every finalizer once and redacts finalizer defects', async () => {
    const fixture = runtimeFixture(doctorRequest, { cancelThrows: true, disposeThrows: true });
    const result = await runBrokerInheritedIpcChild({ requestId: 'child-request-1' }, fixture.runtime);

    expect(result).toEqual({
      error: [{ code: 'ipc-invalid', message: 'Broker IPC deadline could not be cancelled.' }]
    });
    expect(JSON.stringify(result)).not.toContain('private-');
    expect(fixture.disconnects()).toBe(1);
    expect(fixture.cancellations()).toBe(1);
    expect(fixture.disposals()).toBe(1);
  });

  it('maps a rejected IPC send to a closed result and still releases installed resources', async () => {
    const fixture = runtimeFixture(doctorRequest, { sendRejects: true });
    const result = await runBrokerInheritedIpcChild({ requestId: 'child-request-1' }, fixture.runtime);

    expect(result).toEqual({
      error: [{ code: 'ipc-disconnected', message: 'Broker IPC response could not be sent.' }]
    });
    expect(JSON.stringify(result)).not.toContain('private-send-detail');
    expect(fixture.disconnects()).toBe(1);
    expect(fixture.cancellations()).toBe(1);
    expect(fixture.disposals()).toBe(1);
  });
});
