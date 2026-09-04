import { ResultAsync } from 'neverthrow';

import {
  BROKER_PROTOCOL_VERSION,
  decodeBrokerControlMessage,
  type BrokerCancelMessage,
  type BrokerControlMessage,
  type BrokerRequestMessage,
  type BrokerRequestPayload
} from './ipc.ts';
import {
  openBrokerClientExchange,
  reduceBrokerClientExchange,
  type BrokerClientExchange,
  type BrokerClientProgress,
  type BrokerClientTerminalOutcome
} from './exchange.ts';
import {
  parseBrokerRequestId,
  parseBrokerTimestampMs,
  type BrokerRequestId
} from './primitives.ts';
import {
  clientErr,
  clientOk,
  clientTry,
  type BrokerClientIssues,
  type BrokerClientResult,
  type BrokerClientTaskResult
} from './result.ts';

export const BROKER_IPC_CHILD_ARGUMENT = '--nebular-ipc-child' as const;
export const BROKER_DEFAULT_OPERATION_TIMEOUT_MS = 30_000;
export const BROKER_MAX_OPERATION_TIMEOUT_MS = 5 * 60_000;
export const BROKER_DEFAULT_CLEANUP_GRACE_MS = 5_000;
export const BROKER_MAX_CLEANUP_GRACE_MS = 60_000;
export const BROKER_INHERITED_IPC_GENERATION = 0;

export type BrokerInheritedIpcRequest = Readonly<{
  brokerEntrypoint: string;
  cwd: string;
  payload: BrokerRequestPayload;
  timeoutMs?: number;
  cleanupGraceMs?: number;
}>;

export type BrokerInheritedIpcReceipt = Readonly<{
  requestId: BrokerRequestId;
  progress: readonly BrokerClientProgress[];
  terminal: BrokerClientTerminalOutcome;
  helperExitCode: number;
}>;

export type BrokerIpcPeer = Readonly<{
  send: (message: BrokerControlMessage) => BrokerClientResult<void>;
  disconnect: () => void;
  terminate: () => void;
}>;

export type BrokerIpcObserver = Readonly<{
  onMessage: (message: unknown, peer: BrokerIpcPeer) => void;
  onDisconnect: () => void;
  onExit: (exitCode: number) => void;
}>;

export type BrokerIpcSpawnPlan = Readonly<{
  brokerEntrypoint: string;
  cwd: string;
  requestId: BrokerRequestId;
}>;

export type BrokerInheritedIpcRuntime = Readonly<{
  nowMs: () => number;
  newRequestId: () => string;
  spawn: (plan: BrokerIpcSpawnPlan, observer: BrokerIpcObserver) => BrokerClientResult<BrokerIpcPeer>;
}>;

const validPath = (value: string, maximumLength: number): boolean =>
  value.length > 0 && value.length <= maximumLength && !value.includes('\0');

const operationTimeout = (value: number | undefined): BrokerClientResult<number> => {
  const timeoutMs = value ?? BROKER_DEFAULT_OPERATION_TIMEOUT_MS;
  return Number.isSafeInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= BROKER_MAX_OPERATION_TIMEOUT_MS
    ? clientOk(timeoutMs)
    : clientErr({ code: 'invalid-input', message: 'Broker operation timeout is invalid.' });
};

const cleanupGrace = (value: number | undefined): BrokerClientResult<number> => {
  const cleanupGraceMs = value ?? BROKER_DEFAULT_CLEANUP_GRACE_MS;
  return Number.isSafeInteger(cleanupGraceMs) && cleanupGraceMs > 0 &&
    cleanupGraceMs <= BROKER_MAX_CLEANUP_GRACE_MS
    ? clientOk(cleanupGraceMs)
    : clientErr({ code: 'invalid-input', message: 'Broker cleanup grace is invalid.' });
};

const requestMessage = (
  exchange: Extract<BrokerClientExchange, { state: 'ready' }>,
  payload: BrokerRequestPayload,
  nowMs: number
): BrokerClientResult<BrokerRequestMessage> =>
  parseBrokerTimestampMs(nowMs).andThen(sentAtMs =>
    decodeBrokerControlMessage({
      protocolVersion: BROKER_PROTOCOL_VERSION,
      messageKind: 'request',
      requestId: exchange.requestId,
      sequence: exchange.nextSequence,
      sentAtMs,
      payload
    }).andThen(message => message.messageKind === 'request'
      ? clientOk(message)
      : clientErr({ code: 'protocol-mismatch', message: 'Broker request projection produced the wrong message kind.' }))
  );

const cancelMessage = (
  exchange: Extract<BrokerClientExchange, { state: 'active' }>,
  nowMs: number
): BrokerClientResult<BrokerCancelMessage> => parseBrokerTimestampMs(nowMs).andThen(sentAtMs =>
  decodeBrokerControlMessage({
    protocolVersion: BROKER_PROTOCOL_VERSION,
    messageKind: 'cancel',
    requestId: exchange.requestId,
    sequence: exchange.nextSequence,
    sentAtMs,
    payload: { expectedGeneration: BROKER_INHERITED_IPC_GENERATION }
  }).andThen(message => message.messageKind === 'cancel'
    ? clientOk(message)
    : clientErr({ code: 'protocol-mismatch', message: 'Broker cancel projection produced the wrong message kind.' }))
);

type ActiveExchange = Readonly<{
  exchange: BrokerClientExchange;
  terminal?: Extract<BrokerClientExchange, { state: 'terminal' }>;
  exitCode?: number;
  disconnected: boolean;
}>;

const terminalReceipt = (state: ActiveExchange): BrokerClientResult<BrokerInheritedIpcReceipt> => {
  const terminal = state.terminal;
  const exitCode = state.exitCode;
  if (terminal === undefined || exitCode === undefined) {
    return clientErr({ code: 'transport-unavailable', message: 'Broker IPC did not reach a terminal exit.' });
  }
  if (terminal.terminal.outcome === 'success' && exitCode !== 0) {
    return clientErr({ code: 'transport-unavailable', message: 'Broker helper exited unsuccessfully after reporting success.' });
  }
  return clientOk({
    requestId: terminal.requestId,
    progress: terminal.progress,
    terminal: terminal.terminal,
    helperExitCode: exitCode
  });
};

const executeExchange = (
  input: BrokerInheritedIpcRequest,
  runtime: BrokerInheritedIpcRuntime,
  timeoutMs: number,
  cleanupGraceMs: number,
  requestId: BrokerRequestId,
  initial: BrokerClientExchange
): Promise<BrokerClientResult<BrokerInheritedIpcReceipt>> => new Promise(resolve => {
  let state: ActiveExchange = { exchange: initial, disconnected: false };
  let settled = false;
  let cleanupTimer: ReturnType<typeof setTimeout> | undefined;
  const peerCell: { current?: BrokerIpcPeer } = {};

  const clearTimers = (): void => {
    clearTimeout(operationTimer);
    if (cleanupTimer !== undefined) clearTimeout(cleanupTimer);
  };

  const settle = (result: BrokerClientResult<BrokerInheritedIpcReceipt>): void => {
    if (settled) return;
    settled = true;
    clearTimers();
    resolve(result);
  };

  const settleIfComplete = (): void => {
    if (state.terminal !== undefined && state.exitCode !== undefined) settle(terminalReceipt(state));
  };

  const fail = (issues: BrokerClientIssues): void => {
    peerCell.current?.terminate();
    settle(clientErr(...issues));
  };

  const beginCleanupGrace = (): void => {
    if (settled || cleanupTimer !== undefined) return;
    cleanupTimer = setTimeout(() => {
      peerCell.current?.terminate();
      settle(clientErr({
        code: 'transport-unavailable',
        message: 'Broker IPC cancellation cleanup exceeded its bounded grace.'
      }));
    }, cleanupGraceMs);
  };

  const advance = (message: BrokerControlMessage): BrokerClientResult<BrokerClientExchange> =>
    reduceBrokerClientExchange(state.exchange, {
      eventKind: 'control',
      direction: 'broker-to-client',
      message
    });

  const sendRequest = (ready: Extract<BrokerClientExchange, { state: 'ready' }>, target: BrokerIpcPeer): void => {
    const prepared = requestMessage(ready, input.payload, runtime.nowMs());
    if (prepared.isErr()) return fail(prepared.error);
    const active = reduceBrokerClientExchange(ready, {
      eventKind: 'control',
      direction: 'client-to-broker',
      message: prepared.value
    });
    if (active.isErr()) return fail(active.error);
    state = { ...state, exchange: active.value };
    const sent = target.send(prepared.value);
    if (sent.isErr()) return fail(sent.error);
  };

  const requestCancellation = (active: Extract<BrokerClientExchange, { state: 'active' }>): void => {
    const prepared = cancelMessage(active, runtime.nowMs());
    if (prepared.isErr()) return fail(prepared.error);
    const cancelling = reduceBrokerClientExchange(active, {
      eventKind: 'control',
      direction: 'client-to-broker',
      message: prepared.value
    });
    if (cancelling.isErr()) return fail(cancelling.error);
    state = { ...state, exchange: cancelling.value };
    const sent = peerCell.current?.send(prepared.value);
    if (sent === undefined) {
      fail([{ code: 'transport-unavailable', message: 'Broker IPC helper was unavailable for cancellation.' }]);
      return;
    }
    if (sent.isErr()) return fail(sent.error);
    beginCleanupGrace();
  };

  const observer: BrokerIpcObserver = {
    onMessage: (wire, target) => {
      if (settled) return;
      const decoded = decodeBrokerControlMessage(wire);
      if (decoded.isErr()) return fail(decoded.error);
      const advanced = advance(decoded.value);
      if (advanced.isErr()) return fail(advanced.error);
      state = {
        ...state,
        exchange: advanced.value,
        ...(advanced.value.state === 'terminal' ? { terminal: advanced.value } : {})
      };
      if (advanced.value.state === 'ready') sendRequest(advanced.value, target);
      settleIfComplete();
    },
    onDisconnect: () => {
      state = { ...state, disconnected: true };
    },
    onExit: exitCode => {
      state = { ...state, exitCode };
      queueMicrotask(() => {
        if (state.terminal === undefined) {
          settle(clientErr({
            code: 'transport-unavailable',
            message: state.disconnected
              ? `Broker IPC disconnected before a terminal result while ${state.exchange.state}.`
              : `Broker helper exited before a terminal result while ${state.exchange.state}.`
          }));
          return;
        }
        settleIfComplete();
      });
    }
  };

  const operationTimer = setTimeout(() => {
    if (settled) return;
    if (state.exchange.state === 'active') {
      requestCancellation(state.exchange);
      return;
    }
    if (state.exchange.state === 'cancellation-requested' || state.exchange.state === 'terminal') {
      beginCleanupGrace();
      return;
    }
    fail([{
      code: 'transport-unavailable',
      message: 'Broker IPC operation exceeded its bounded deadline before activation.'
    }]);
  }, timeoutMs);

  const spawned = runtime.spawn({ brokerEntrypoint: input.brokerEntrypoint, cwd: input.cwd, requestId }, observer);
  if (spawned.isErr()) {
    settle(clientErr(...spawned.error));
    return;
  }
  peerCell.current = spawned.value;
});

export const runBrokerControlOverInheritedIpc = (
  input: BrokerInheritedIpcRequest,
  runtime: BrokerInheritedIpcRuntime
): BrokerClientTaskResult<BrokerInheritedIpcReceipt> => {
  if (!validPath(input.brokerEntrypoint, 4096) || !validPath(input.cwd, 4096)) {
    return ResultAsync.fromSafePromise(Promise.resolve(clientErr({
      code: 'invalid-input',
      message: 'Broker entrypoint or working directory is invalid.'
    }))).andThen(result => result);
  }
  const prepared = operationTimeout(input.timeoutMs).andThen(timeoutMs => cleanupGrace(input.cleanupGraceMs)
    .andThen(cleanupGraceMs => parseBrokerRequestId(runtime.newRequestId()).map(requestId => ({
      timeoutMs,
      cleanupGraceMs,
      requestId
    })))).andThen(({ timeoutMs, cleanupGraceMs, requestId }) => openBrokerClientExchange(requestId).map(initial => ({
      timeoutMs,
      cleanupGraceMs,
      requestId,
      initial
    })));
  return prepared.isErr()
    ? ResultAsync.fromSafePromise(Promise.resolve(clientErr(...prepared.error))).andThen(result => result)
    : ResultAsync.fromSafePromise(executeExchange(
        input,
        runtime,
        prepared.value.timeoutMs,
        prepared.value.cleanupGraceMs,
        prepared.value.requestId,
        prepared.value.initial
      ))
      .andThen(result => result);
};

const allowedEnvironmentNames = [
  'APPDATA',
  'LOCALAPPDATA',
  'PATH',
  'PATHEXT',
  'PM2_HOME',
  'SYSTEMROOT',
  'TEMP',
  'TMP',
  'USERPROFILE',
  'WINDIR'
] as const;

const brokerHelperEnvironment = (): Readonly<Record<string, string>> =>
  Object.fromEntries(allowedEnvironmentNames.flatMap(name => {
    const value = process.env[name];
    return value === undefined || value.includes('\0') ? [] : [[name, value] as const];
  }));

export const createBunInheritedIpcRuntime = (): BrokerInheritedIpcRuntime => ({
  nowMs: () => Date.now(),
  newRequestId: () => crypto.randomUUID(),
  spawn: (plan, observer) => clientTry(() => {
    const subprocess = Bun.spawn({
      cmd: [process.execPath, plan.brokerEntrypoint, BROKER_IPC_CHILD_ARGUMENT, plan.requestId],
      cwd: plan.cwd,
      env: brokerHelperEnvironment(),
      stdin: 'ignore',
      stdout: 'ignore',
      stderr: 'ignore',
      serialization: 'json',
      ipc: (message: unknown, child) => observer.onMessage(message, {
        send: outbound => clientTry(
          () => child.send(outbound),
          { code: 'transport-unavailable', message: 'Broker IPC send failed.' }
        ).map(() => undefined),
        disconnect: () => child.disconnect(),
        terminate: () => child.kill()
      }),
      onDisconnect: () => observer.onDisconnect(),
      onExit: (_child, exitCode) => observer.onExit(exitCode ?? 1)
    });
    return {
      send: outbound => clientTry(
        () => subprocess.send(outbound),
        { code: 'transport-unavailable', message: 'Broker IPC send failed.' }
      ).map(() => undefined),
      disconnect: () => subprocess.disconnect(),
      terminate: () => subprocess.kill()
    };
  }, { code: 'transport-unavailable', message: 'Broker IPC helper could not be started.' })
});
