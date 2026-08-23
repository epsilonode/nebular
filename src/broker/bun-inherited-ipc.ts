import { ResultAsync } from 'neverthrow';

import {
  BROKER_IPC_CHILD_ARGUMENT,
  BROKER_PROTOCOL_VERSION,
  decodeBrokerControlMessage,
  parseBrokerRequestId,
  parseBrokerSequence,
  parseBrokerTimestampMs,
  type BrokerControlMessage,
  type BrokerRequestId,
  type BrokerRequestMessage,
  type BrokerSequence,
  type BrokerTerminalMessage,
  type BrokerTimestampMs
} from '../broker-client/public.ts';

export { BROKER_IPC_CHILD_ARGUMENT, type BrokerRequestId } from '../broker-client/public.ts';
import { openBrokerControlSession } from './control-handler.ts';
import {
  createDefaultBrokerOperationPort,
  projectBrokerOperationMessages,
  type BrokerOperationOutcome,
  type BrokerOperationPort
} from './operation.ts';
import {
  brokerErr,
  brokerOk,
  brokerTaskErr,
  brokerTaskOk,
  brokerTry,
  type BrokerIssues,
  type BrokerResult,
  type BrokerTaskResult
} from './result.ts';

export const BROKER_BUILD_ID = 'epsilonode-nebular-v1' as const;
export const BROKER_CHILD_REQUEST_TIMEOUT_MS = 10_000;
export const BROKER_CHILD_MAX_REQUEST_TIMEOUT_MS = 60_000;

export type BrokerIpcSubscription = Readonly<{ dispose: () => void }>;
export type BrokerIpcDeadline = Readonly<{ cancel: () => void }>;

export type BrokerInheritedIpcChildRuntime = Readonly<{
  nowMs: () => number;
  listenOnce: (receive: (message: unknown) => void) => BrokerResult<BrokerIpcSubscription>;
  send: (message: BrokerControlMessage) => BrokerTaskResult<void>;
  disconnect: () => BrokerResult<void>;
  schedule: (afterMs: number, action: () => void) => BrokerIpcDeadline;
}>;

export type BrokerInheritedIpcChildInput = Readonly<{
  requestId: unknown;
  timeoutMs?: number;
  buildId?: string;
}>;

const brokerRequestId = (value: unknown): BrokerResult<BrokerRequestId> => {
  const parsed = parseBrokerRequestId(value);
  return parsed.isErr()
    ? brokerErr({ code: 'ipc-invalid', message: 'Broker IPC request id is invalid.' })
    : brokerOk(parsed.value);
};

const brokerSequence = (value: unknown): BrokerResult<BrokerSequence> => {
  const parsed = parseBrokerSequence(value);
  return parsed.isErr()
    ? brokerErr({ code: 'ipc-invalid', message: 'Broker IPC sequence is invalid.' })
    : brokerOk(parsed.value);
};

const brokerTimestamp = (value: unknown): BrokerResult<BrokerTimestampMs> => {
  const parsed = parseBrokerTimestampMs(value);
  return parsed.isErr()
    ? brokerErr({ code: 'ipc-invalid', message: 'Broker IPC timestamp is invalid.' })
    : brokerOk(parsed.value);
};

const requestTimeout = (value: number | undefined): BrokerResult<number> => {
  const timeoutMs = value ?? BROKER_CHILD_REQUEST_TIMEOUT_MS;
  return Number.isSafeInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= BROKER_CHILD_MAX_REQUEST_TIMEOUT_MS
    ? brokerOk(timeoutMs)
    : brokerErr({ code: 'request-invalid', message: 'Broker child request deadline is invalid.' });
};

const operationFailure = (issues: BrokerIssues): BrokerOperationOutcome => ({
  outcome: 'failure',
  code: issues[0].code,
  message: 'The broker operation failed at a typed authority boundary.',
  progress: []
});

const sendMessages = (
  runtime: BrokerInheritedIpcChildRuntime,
  messages: readonly BrokerControlMessage[]
): BrokerTaskResult<void> => messages.reduce<BrokerTaskResult<void>>(
  (sent, message) => sent.andThen(() => runtime.send(message)),
  brokerTaskOk(undefined)
);

const protocolErrorMessage = (
  requestId: BrokerRequestId,
  sequenceValue: number,
  sentAtValue: number,
  code: string,
  message: string
): BrokerResult<BrokerTerminalMessage> =>
  brokerSequence(sequenceValue).andThen(sequence =>
    brokerTimestamp(sentAtValue).map((sentAtMs): BrokerTerminalMessage => ({
      protocolVersion: BROKER_PROTOCOL_VERSION,
      messageKind: 'protocol-error',
      requestId,
      sequence,
      sentAtMs,
      payload: { code, message }
    }))
  );

const checkedRequest = (
  wire: unknown,
  requestId: BrokerRequestId,
  expectedSequence: number
): BrokerResult<BrokerRequestMessage> => {
  const decoded = decodeBrokerControlMessage(wire);
  if (decoded.isErr()) return brokerErr({ code: 'ipc-invalid', message: 'Broker received an invalid control frame.' });
  return decoded.value.messageKind === 'request' &&
    decoded.value.requestId === requestId &&
    decoded.value.sequence === expectedSequence
    ? brokerOk(decoded.value)
    : brokerErr({ code: 'ipc-invalid', message: 'Broker received an uncorrelated or out-of-order request.' });
};

const executeChild = (
  input: BrokerInheritedIpcChildInput,
  runtime: BrokerInheritedIpcChildRuntime,
  operations: BrokerOperationPort,
  timeoutMs: number,
  requestId: BrokerRequestId
): Promise<BrokerResult<void>> => new Promise(resolve => {
  let settled = false;
  const resources: { subscription?: BrokerIpcSubscription; deadline?: BrokerIpcDeadline } = {};

  const settle = (result: BrokerResult<void>): void => {
    if (settled) return;
    settled = true;
    resources.deadline?.cancel();
    resources.subscription?.dispose();
    resolve(result);
  };

  const finish = (result: BrokerResult<void>): void => {
    const disconnected = runtime.disconnect();
    settle(result.andThen(() => disconnected));
  };

  const sendProtocolError = (sequence: number, code: string, message: string): void => {
    const projected = protocolErrorMessage(requestId, sequence, runtime.nowMs(), code, message);
    if (projected.isErr()) {
      finish(brokerErr(...projected.error));
      return;
    }
    void runtime.send(projected.value).then(sent =>
      finish(sent.isErr() ? sent : brokerErr({ code: 'ipc-invalid', message }))
    );
  };

  const receive = (wire: unknown): void => {
    const request = checkedRequest(wire, requestId, 1);
    if (request.isErr()) {
      sendProtocolError(1, request.error[0].code, request.error[0].message);
      return;
    }
    const timestamp = brokerTimestamp(runtime.nowMs());
    if (timestamp.isErr()) {
      sendProtocolError(2, 'ipc-invalid', 'Broker clock produced an invalid timestamp.');
      return;
    }
    void operations.execute(request.value, runtime.nowMs()).then(outcome => {
      const projected = projectBrokerOperationMessages(
        request.value,
        outcome.isErr() ? operationFailure(outcome.error) : outcome.value,
        timestamp.value
      );
      if (projected.isErr()) {
        finish(brokerErr(...projected.error));
        return;
      }
      void sendMessages(runtime, projected.value).then(finish);
    });
  };

  const timestamp = brokerTimestamp(runtime.nowMs());
  if (timestamp.isErr()) {
    settle(brokerErr({ code: 'ipc-invalid', message: 'Broker clock produced an invalid handshake timestamp.' }));
    return;
  }
  const opened = openBrokerControlSession(
    requestId,
    timestamp.value,
    input.buildId ?? BROKER_BUILD_ID,
    ['doctor', 'one-request', 'bounded-ipc']
  );
  if (opened.isErr()) {
    settle(brokerErr(...opened.error));
    return;
  }
  const subscription = runtime.listenOnce(receive);
  if (subscription.isErr()) {
    settle(brokerErr(...subscription.error));
    return;
  }
  resources.subscription = subscription.value;
  resources.deadline = runtime.schedule(timeoutMs, () =>
    sendProtocolError(1, 'ipc-timeout', 'Broker IPC request did not arrive before its bounded deadline.')
  );
  void runtime.send(opened.value.hello).then(helloSent => {
    if (helloSent.isErr()) settle(brokerErr(...helloSent.error));
  });
});

export const runBrokerInheritedIpcChild = (
  input: BrokerInheritedIpcChildInput,
  runtime: BrokerInheritedIpcChildRuntime,
  operations: BrokerOperationPort = createDefaultBrokerOperationPort()
): BrokerTaskResult<void> => {
  const prepared = requestTimeout(input.timeoutMs).andThen(timeoutMs =>
    brokerRequestId(input.requestId).map(requestId => ({ timeoutMs, requestId }))
  );
  return prepared.isErr()
    ? ResultAsync.fromSafePromise(Promise.resolve(brokerErr(...prepared.error))).andThen(result => result)
    : ResultAsync.fromSafePromise(executeChild(input, runtime, operations, prepared.value.timeoutMs, prepared.value.requestId))
      .andThen(result => result);
};

export const createBunInheritedIpcChildRuntime = (): BrokerInheritedIpcChildRuntime => ({
  nowMs: () => Date.now(),
  listenOnce: receive => brokerTry(() => {
    const listener = (message: unknown): void => receive(message);
    process.once('message', listener);
    return { dispose: () => process.off('message', listener) };
  }, { code: 'ipc-disconnected', message: 'Broker IPC listener could not be installed.' }),
  send: message => {
    if (typeof process.send !== 'function') {
      return brokerTaskErr({ code: 'ipc-disconnected', message: 'Broker inherited IPC channel is unavailable.' });
    }
    const delivery = new Promise<BrokerResult<void>>(resolve => {
      const started = brokerTry(() => process.send?.(message, error => resolve(error === null
        ? brokerOk(undefined)
        : brokerErr({ code: 'ipc-disconnected', message: 'Broker IPC response could not be sent.' })
      )), { code: 'ipc-disconnected', message: 'Broker IPC response could not be sent.' });
      if (started.isErr()) resolve(brokerErr(...started.error));
    });
    return ResultAsync.fromSafePromise(delivery).andThen(result => result);
  },
  disconnect: () => brokerTry(() => {
    if (process.connected) process.disconnect?.();
  }, { code: 'ipc-disconnected', message: 'Broker IPC channel could not be closed.' }),
  schedule: (afterMs, action) => {
    const timer = setTimeout(action, afterMs);
    return { cancel: () => clearTimeout(timer) };
  }
});

export const brokerIpcChildRequestId = (argv: readonly string[]): BrokerResult<BrokerRequestId | undefined> => {
  const markerIndex = argv.indexOf(BROKER_IPC_CHILD_ARGUMENT);
  if (markerIndex < 0) return brokerOk(undefined);
  return brokerRequestId(argv[markerIndex + 1]);
};
