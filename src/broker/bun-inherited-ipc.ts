import {
  BROKER_IPC_CHILD_ARGUMENT,
  BROKER_PROTOCOL_VERSION,
  BROKER_REQUEST_CANCELLED_CODE,
  decodeBrokerControlMessage,
  parseBrokerRequestId,
  parseBrokerSequence,
  parseBrokerTimestampMs,
  type BrokerCancelMessage,
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
  brokerTry,
  type BrokerIssue,
  type BrokerIssues,
  type BrokerResult
} from './result.ts';

export const BROKER_BUILD_ID = 'epsilonode-nebular-v1' as const;
export const BROKER_CHILD_REQUEST_TIMEOUT_MS = 10_000;
export const BROKER_CHILD_MAX_REQUEST_TIMEOUT_MS = 60_000;

export type BrokerIpcSubscription = Readonly<{ dispose: () => void }>;
export type BrokerIpcDeadline = Readonly<{ cancel: () => void }>;
export type BrokerIpcSubscriptionObserver = Readonly<{
  onMessage: (message: unknown) => void;
  onDisconnect: () => void;
}>;

export type BrokerInheritedIpcChildRuntime = Readonly<{
  nowMs: () => number;
  subscribe: (observer: BrokerIpcSubscriptionObserver) => BrokerResult<BrokerIpcSubscription>;
  send: (message: BrokerControlMessage) => Promise<BrokerResult<void>>;
  disconnect: () => BrokerResult<void>;
  schedule: (afterMs: number, action: () => void) => BrokerIpcDeadline;
}>;

export type BrokerInheritedIpcChildInput = Readonly<{
  requestId: unknown;
  timeoutMs?: number;
  buildId?: string;
}>;

type BrokerIpcResourceState = Readonly<{
  deadline: () => BrokerIpcDeadline | undefined;
  clearDeadline: () => void;
  installDeadline: (deadline: BrokerIpcDeadline) => void;
  installSubscription: (subscription: BrokerIpcSubscription) => void;
  subscription: () => BrokerIpcSubscription | undefined;
}>;

const createBrokerIpcResourceState = (): BrokerIpcResourceState => {
  let deadline: BrokerIpcDeadline | undefined;
  let subscription: BrokerIpcSubscription | undefined;
  return {
    deadline: () => deadline,
    clearDeadline: () => { deadline = undefined; },
    installDeadline: value => { deadline = value; },
    installSubscription: value => { subscription = value; },
    subscription: () => subscription
  };
};

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

const ipcIssue = (code: 'ipc-disconnected' | 'ipc-invalid', message: string): BrokerIssue => ({ code, message });

const invokeResultPort = <T>(
  effect: () => BrokerResult<T>,
  issue: BrokerIssue
): BrokerResult<T> => brokerTry(effect, issue).andThen(result => result);

const invokeValuePort = <T>(
  effect: () => T,
  issue: BrokerIssue
): BrokerResult<T> => brokerTry(effect, issue);

const invokeTaskPort = <T>(
  effect: () => Promise<BrokerResult<T>>,
  issue: BrokerIssue
): Promise<BrokerResult<T>> => {
  const invoked = brokerTry(effect, issue);
  return invoked.isErr()
    ? Promise.resolve(brokerErr(invoked.error[0], ...invoked.error.slice(1)))
    : invoked.value.then(
        result => result,
        () => brokerErr(issue)
      );
};

const sendMessage = (
  runtime: BrokerInheritedIpcChildRuntime,
  message: BrokerControlMessage
): Promise<BrokerResult<void>> => invokeTaskPort(
  () => runtime.send(message),
  ipcIssue('ipc-disconnected', 'Broker IPC response could not be sent.')
);

const sendMessages = (
  runtime: BrokerInheritedIpcChildRuntime,
  messages: readonly BrokerControlMessage[]
): Promise<BrokerResult<void>> => messages.reduce<Promise<BrokerResult<void>>>(
  (sent, message) => sent.then(result => result.isErr() ? result : sendMessage(runtime, message)),
  Promise.resolve(brokerOk(undefined))
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

const checkedCancel = (
  wire: unknown,
  request: BrokerRequestMessage,
  expectedSequence: number
): BrokerResult<BrokerCancelMessage> => {
  const decoded = decodeBrokerControlMessage(wire);
  if (decoded.isErr()) return brokerErr({ code: 'ipc-invalid', message: 'Broker received an invalid control frame.' });
  const message = decoded.value;
  return message.messageKind === 'cancel' && message.requestId === request.requestId &&
    message.sequence === expectedSequence && message.payload.expectedGeneration === 0 &&
    message.attemptId === request.attemptId
    ? brokerOk(message)
    : brokerErr({ code: 'ipc-invalid', message: 'Broker received a stale or uncorrelated cancellation.' });
};

const cancelledTerminalMessage = (
  request: BrokerRequestMessage,
  cancel: BrokerCancelMessage,
  sentAtMs: BrokerTimestampMs
): BrokerResult<BrokerTerminalMessage> => brokerSequence(cancel.sequence + 1).map(sequence => ({
  protocolVersion: BROKER_PROTOCOL_VERSION,
  messageKind: 'terminal-failure',
  requestId: request.requestId,
  sequence,
  sentAtMs,
  ...(request.attemptId === undefined ? {} : { attemptId: request.attemptId }),
  payload: {
    code: BROKER_REQUEST_CANCELLED_CODE,
    message: 'Broker execution cleanup completed after cancellation.'
  }
}));

const executeChild = (
  input: BrokerInheritedIpcChildInput,
  runtime: BrokerInheritedIpcChildRuntime,
  operations: BrokerOperationPort,
  timeoutMs: number,
  requestId: BrokerRequestId
): Promise<BrokerResult<void>> => new Promise(resolve => {
  let settled = false;
  let closing = false;
  let phase: 'awaiting-request' | 'active' | 'cancellation-requested' = 'awaiting-request';
  let activeRequest: BrokerRequestMessage | undefined;
  let acceptedCancel: BrokerCancelMessage | undefined;
  let operationCancellation: AbortController | undefined;
  const resources = createBrokerIpcResourceState();

  const cancelRequestDeadline = (): BrokerResult<void> => {
    const deadline = resources.deadline();
    if (deadline === undefined) return brokerOk(undefined);
    resources.clearDeadline();
    return invokeValuePort(
      () => deadline.cancel(),
      ipcIssue('ipc-invalid', 'Broker IPC deadline could not be cancelled.')
    );
  };

  const finalizeResources = (): BrokerResult<void> => {
    const cancelled = cancelRequestDeadline();
    const subscription = resources.subscription();
    const disposed = subscription === undefined
      ? brokerOk(undefined)
      : invokeValuePort(
          () => subscription.dispose(),
          ipcIssue('ipc-disconnected', 'Broker IPC listener could not be released.')
        );
    return cancelled.andThen(() => disposed);
  };

  const settle = (result: BrokerResult<void>): void => {
    if (settled) return;
    settled = true;
    const finalized = finalizeResources();
    resolve(result.andThen(() => finalized));
  };

  const finish = (result: BrokerResult<void>): void => {
    const disconnected = invokeResultPort(
      () => runtime.disconnect(),
      ipcIssue('ipc-disconnected', 'Broker IPC channel could not be closed.')
    );
    settle(result.andThen(() => disconnected));
  };

  const claimCompletion = (): boolean => {
    if (closing || settled) return false;
    closing = true;
    return true;
  };

  const completionClaimed = (): boolean => closing || settled;

  const abortOperation = (): void => {
    if (operationCancellation !== undefined && !operationCancellation.signal.aborted) {
      operationCancellation.abort();
    }
  };

  const sendProtocolError = (sequence: number, code: string, message: string): void => {
    if (!claimCompletion()) return;
    abortOperation();
    const nowMs = invokeValuePort(
      () => runtime.nowMs(),
      ipcIssue('ipc-invalid', 'Broker clock could not be read.')
    );
    if (nowMs.isErr()) {
      finish(brokerErr(...nowMs.error));
      return;
    }
    const projected = protocolErrorMessage(requestId, sequence, nowMs.value, code, message);
    if (projected.isErr()) {
      finish(brokerErr(...projected.error));
      return;
    }
    void sendMessage(runtime, projected.value).then(sent =>
      finish(sent.isErr() ? sent : brokerErr({ code: 'ipc-invalid', message }))
    );
  };

  const completeOperation = (outcome: BrokerResult<BrokerOperationOutcome>): void => {
    if (completionClaimed()) return;
    const request = activeRequest;
    if (request === undefined) {
      sendProtocolError(2, 'ipc-invalid', 'Broker operation completed without an active request.');
      return;
    }
    const nowMs = invokeValuePort(
      () => runtime.nowMs(),
      ipcIssue('ipc-invalid', 'Broker clock could not be read.')
    );
    const timestamp = nowMs.andThen(brokerTimestamp);
    if (timestamp.isErr()) {
      sendProtocolError(phase === 'cancellation-requested' ? 3 : 2, 'ipc-invalid',
        'Broker clock produced an invalid completion timestamp.');
      return;
    }
    if (phase === 'cancellation-requested') {
      const cancel = acceptedCancel;
      if (cancel === undefined || !claimCompletion()) return;
      const terminal = cancelledTerminalMessage(request, cancel, timestamp.value);
      if (terminal.isErr()) {
        finish(brokerErr(...terminal.error));
        return;
      }
      void sendMessage(runtime, terminal.value).then(finish);
      return;
    }
    if (phase !== 'active' || !claimCompletion()) return;
    const projected = projectBrokerOperationMessages(
      request,
      outcome.isErr() ? operationFailure(outcome.error) : outcome.value,
      timestamp.value
    );
    if (projected.isErr()) {
      finish(brokerErr(...projected.error));
      return;
    }
    void sendMessages(runtime, projected.value).then(finish);
  };

  const beginOperation = (request: BrokerRequestMessage): void => {
    const deadlineCancelled = cancelRequestDeadline();
    if (deadlineCancelled.isErr()) {
      sendProtocolError(2, deadlineCancelled.error[0].code, deadlineCancelled.error[0].message);
      return;
    }
    const nowMs = invokeValuePort(
      () => runtime.nowMs(),
      ipcIssue('ipc-invalid', 'Broker clock could not be read.')
    );
    const timestamp = nowMs.andThen(brokerTimestamp);
    if (timestamp.isErr()) {
      sendProtocolError(2, 'ipc-invalid', 'Broker clock produced an invalid timestamp.');
      return;
    }
    const cancellation = new AbortController();
    activeRequest = request;
    operationCancellation = cancellation;
    phase = 'active';
    void invokeTaskPort(
      () => operations.execute(request, timestamp.value, { signal: cancellation.signal }),
      { code: 'receiver-failed', message: 'Broker operation execution failed.' }
    ).then(completeOperation);
  };

  const receive = (wire: unknown): void => {
    if (closing || settled) return;
    if (phase === 'awaiting-request') {
      const request = checkedRequest(wire, requestId, 1);
      if (request.isErr()) {
        sendProtocolError(1, request.error[0].code, request.error[0].message);
        return;
      }
      beginOperation(request.value);
      return;
    }
    if (phase === 'cancellation-requested') {
      // Once exact cancellation is accepted, duplicate/stale frames cannot
      // alter the single cleanup-gated terminal outcome.
      return;
    }
    const request = activeRequest;
    if (request === undefined) {
      sendProtocolError(2, 'ipc-invalid', 'Broker cancellation arrived without an active request.');
      return;
    }
    const cancel = checkedCancel(wire, request, request.sequence + 1);
    if (cancel.isErr()) {
      sendProtocolError(request.sequence + 1, cancel.error[0].code, cancel.error[0].message);
      return;
    }
    acceptedCancel = cancel.value;
    phase = 'cancellation-requested';
    abortOperation();
  };

  const disconnected = (): void => {
    if (!claimCompletion()) return;
    abortOperation();
    settle(brokerErr({ code: 'ipc-disconnected', message: 'Broker IPC channel disconnected during execution.' }));
  };

  const nowMs = invokeValuePort(
    () => runtime.nowMs(),
    ipcIssue('ipc-invalid', 'Broker clock could not be read.')
  );
  const timestamp = nowMs.andThen(brokerTimestamp);
  if (timestamp.isErr()) {
    settle(brokerErr({ code: 'ipc-invalid', message: 'Broker clock produced an invalid handshake timestamp.' }));
    return;
  }
  const opened = invokeResultPort(
    () => openBrokerControlSession(
      requestId,
      timestamp.value,
      input.buildId ?? BROKER_BUILD_ID,
      ['doctor', 'one-request', 'bounded-ipc', 'cooperative-cancel']
    ),
    ipcIssue('ipc-invalid', 'Broker IPC control session could not be opened.')
  );
  if (opened.isErr()) {
    settle(brokerErr(...opened.error));
    return;
  }
  const subscription = invokeResultPort(
    () => runtime.subscribe({ onMessage: receive, onDisconnect: disconnected }),
    ipcIssue('ipc-disconnected', 'Broker IPC listener could not be installed.')
  );
  if (subscription.isErr()) {
    settle(brokerErr(...subscription.error));
    return;
  }
  resources.installSubscription(subscription.value);
  const deadline = invokeValuePort(
    () => runtime.schedule(timeoutMs, () =>
      sendProtocolError(1, 'ipc-timeout', 'Broker IPC request did not arrive before its bounded deadline.')
    ),
    ipcIssue('ipc-invalid', 'Broker IPC deadline could not be scheduled.')
  );
  if (deadline.isErr()) {
    if (claimCompletion()) finish(brokerErr(...deadline.error));
    return;
  }
  resources.installDeadline(deadline.value);
  if (completionClaimed()) return;
  void sendMessage(runtime, opened.value.hello).then(helloSent => {
    if (helloSent.isErr() && claimCompletion()) finish(brokerErr(...helloSent.error));
  });
});

export const runBrokerInheritedIpcChild = (
  input: BrokerInheritedIpcChildInput,
  runtime: BrokerInheritedIpcChildRuntime,
  operations: BrokerOperationPort = createDefaultBrokerOperationPort()
): Promise<BrokerResult<void>> => {
  const prepared = requestTimeout(input.timeoutMs).andThen(timeoutMs =>
    brokerRequestId(input.requestId).map(requestId => ({ timeoutMs, requestId }))
  );
  return prepared.isErr()
    ? Promise.resolve(brokerErr(...prepared.error))
    : invokeTaskPort(
        () => executeChild(input, runtime, operations, prepared.value.timeoutMs, prepared.value.requestId),
        ipcIssue('ipc-disconnected', 'Broker inherited IPC child failed.')
      );
};

export const createBunInheritedIpcChildRuntime = (): BrokerInheritedIpcChildRuntime => ({
  nowMs: () => Date.now(),
  subscribe: observer => brokerTry(() => {
    const listener = (message: unknown): void => observer.onMessage(message);
    const disconnect = (): void => observer.onDisconnect();
    process.on('message', listener);
    process.once('disconnect', disconnect);
    return { dispose: (): void => {
      process.off('message', listener);
      process.off('disconnect', disconnect);
    } };
  }, { code: 'ipc-disconnected', message: 'Broker IPC listener could not be installed.' }),
  send: message => {
    if (typeof process.send !== 'function') {
      return Promise.resolve(brokerErr({
        code: 'ipc-disconnected',
        message: 'Broker inherited IPC channel is unavailable.'
      }));
    }
    const delivery = new Promise<BrokerResult<void>>(resolve => {
      const completeDelivery = (error: Readonly<Error> | null): void => resolve(error === null
        ? brokerOk(undefined)
        : brokerErr({ code: 'ipc-disconnected', message: 'Broker IPC response could not be sent.' })
      );
      const started = brokerTry(
        () => process.send?.(message, completeDelivery),
        { code: 'ipc-disconnected', message: 'Broker IPC response could not be sent.' }
      );
      if (started.isErr()) resolve(brokerErr(...started.error));
    });
    return delivery;
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
