import {
  BROKER_BOOTSTRAP_PROTOCOL_VERSION,
  decodeBootstrapProtocolMessage,
  type BootstrapAcknowledgementMessage,
  type BootstrapHelloMessage,
  type BootstrapRequestMessage,
  type BootstrapResponseMessage
} from './protocol.ts';
import type {
  BootstrapExchangeCompletion,
  CooperativeBootstrapTransportPort
} from './cooperative.ts';
import {
  clientErr,
  clientOk,
  clientTry,
  type BrokerClientIssues,
  type BrokerClientResult
} from '../result.ts';

export const BROKER_BOOTSTRAP_CHILD_ARGUMENT = '--nebular-bootstrap-child' as const;
export const BROKER_BOOTSTRAP_BUILD_ID = 'epsilonode-nebular-bootstrap-v1' as const;
export const BROKER_BOOTSTRAP_DEFAULT_TIMEOUT_MS = 15_000;
export const BROKER_BOOTSTRAP_MAX_TIMEOUT_MS = 60_000;

export type BunBootstrapTransportOptions = Readonly<{
  brokerEntrypoint: string;
  cwd: string;
  timeoutMs?: number;
  expectedBuildId?: string;
}>;

export type BunBootstrapIpcPeer = Readonly<{
  send: (message: unknown) => BrokerClientResult<void>;
  disconnect: () => void;
  terminate: () => void;
}>;

export type BunBootstrapIpcObserver = Readonly<{
  onMessage: (message: unknown, peer: BunBootstrapIpcPeer) => void;
  onDisconnect: () => void;
  onExit: (exitCode: number) => void;
}>;

export type BunBootstrapIpcSpawnPlan = Readonly<{
  brokerEntrypoint: string;
  cwd: string;
  exchangeId: string;
}>;

export type BunBootstrapInheritedIpcRuntime = Readonly<{
  spawn: (
    plan: BunBootstrapIpcSpawnPlan,
    observer: BunBootstrapIpcObserver
  ) => BrokerClientResult<BunBootstrapIpcPeer>;
}>;

const validPath = (value: string, maximumLength: number): boolean =>
  value.length > 0 && value.length <= maximumLength && !value.includes('\0');

const timeout = (value: number | undefined): BrokerClientResult<number> => {
  const timeoutMs = value ?? BROKER_BOOTSTRAP_DEFAULT_TIMEOUT_MS;
  return Number.isSafeInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= BROKER_BOOTSTRAP_MAX_TIMEOUT_MS
    ? clientOk(timeoutMs)
    : clientErr({ code: 'invalid-input', message: 'Bootstrap IPC timeout is invalid.' });
};

const requestWire = (request: BootstrapRequestMessage): unknown => ({
  protocolVersion: BROKER_BOOTSTRAP_PROTOCOL_VERSION,
  messageKind: 'bootstrap-request',
  exchangeId: request.exchangeId.value,
  payload: {
    authority: {
      repository: request.payload.authority.repository.value,
      recipeRevision: request.payload.authority.recipeRevision.value,
      grantId: request.payload.authority.grantId.value,
      grantGeneration: request.payload.authority.grantGeneration
    },
    attempt: {
      receiverId: request.payload.attempt.receiverId.value,
      processAttemptId: request.payload.attempt.processAttemptId.value
    },
    slots: request.payload.slots.map(slot => ({
      slotId: slot.slotId.value,
      environmentName: slot.environmentName
    }))
  }
});

const acknowledgementWire = (acknowledgement: BootstrapAcknowledgementMessage): unknown => ({
  protocolVersion: BROKER_BOOTSTRAP_PROTOCOL_VERSION,
  messageKind: 'bootstrap-acknowledgement',
  exchangeId: acknowledgement.exchangeId.value,
  payload: {
    leaseId: acknowledgement.payload.leaseId.value,
    processAttemptId: acknowledgement.payload.processAttemptId.value,
    installedSlotIds: acknowledgement.payload.installedSlotIds.map(slot => slot.value),
    installedSlotCount: acknowledgement.payload.installedSlotCount
  }
});

const validHello = (
  hello: BootstrapHelloMessage,
  request: BootstrapRequestMessage,
  expectedBuildId: string
): boolean => hello.exchangeId.value === request.exchangeId.value && hello.payload.buildId === expectedBuildId;

const executeExchange = <Value>(
  request: BootstrapRequestMessage,
  consume: (
    response: BootstrapResponseMessage
  ) => Promise<BrokerClientResult<BootstrapExchangeCompletion<Value>>>,
  options: BunBootstrapTransportOptions,
  runtime: BunBootstrapInheritedIpcRuntime,
  timeoutMs: number
): Promise<BrokerClientResult<BootstrapExchangeCompletion<Value>>> => new Promise(resolve => {
  let phase: 'awaiting-hello' | 'awaiting-response' | 'consuming' | 'awaiting-exit' = 'awaiting-hello';
  let settled = false;
  let finalizing = false;
  let completion: BootstrapExchangeCompletion<Value> | undefined;
  let pendingFailure: BrokerClientIssues | undefined;
  const peerState: { current?: BunBootstrapIpcPeer } = {};

  const settle = (result: BrokerClientResult<BootstrapExchangeCompletion<Value>>): void => {
    if (settled) return;
    settled = true;
    clearTimeout(deadline);
    resolve(result);
  };

  const settleFailure = (issues: BrokerClientIssues): void => {
    if (settled || finalizing) return;
    if (completion === undefined) {
      settle(clientErr(issues[0], ...issues.slice(1)));
      return;
    }
    finalizing = true;
    void completion.cleanup.rollback().then(
      rolledBack => settle(rolledBack.isOk()
        ? clientErr(issues[0], ...issues.slice(1))
        : clientErr({
            code: 'environment-invalid',
            message: 'Bootstrap helper failed and the installed environment could not be rolled back.'
          })),
      () => settle(clientErr({
        code: 'environment-invalid',
        message: 'Bootstrap helper failed and the installed environment could not be rolled back.'
      }))
    );
  };

  const fail = (issues: BrokerClientIssues): void => {
    peerState.current?.terminate();
    if (phase === 'consuming' && completion === undefined) {
      pendingFailure ??= issues;
      return;
    }
    settleFailure(issues);
  };

  const receiveResponse = (response: BootstrapResponseMessage, target: BunBootstrapIpcPeer): void => {
    phase = 'consuming';
    void consume(response).then(consumed => {
      if (consumed.isErr()) {
        settleFailure(pendingFailure ?? consumed.error);
        return;
      }
      completion = consumed.value;
      if (pendingFailure !== undefined) {
        settleFailure(pendingFailure);
        return;
      }
      const sent = target.send(acknowledgementWire(consumed.value.acknowledgement));
      if (sent.isErr()) return fail(sent.error);
      phase = 'awaiting-exit';
    }, () => settleFailure(pendingFailure ?? [{
      code: 'transport-unavailable',
      message: 'Bootstrap response consumption failed outside the typed outcome channel.'
    }]));
  };

  const observer: BunBootstrapIpcObserver = {
    onMessage: (wire, target) => {
      if (settled || finalizing || pendingFailure !== undefined) return;
      const decoded = decodeBootstrapProtocolMessage(wire);
      if (decoded.isErr()) return fail(decoded.error);
      const message = decoded.value;
      if (phase === 'awaiting-hello' && message.messageKind === 'bootstrap-hello') {
        if (!validHello(message, request, options.expectedBuildId ?? BROKER_BOOTSTRAP_BUILD_ID)) {
          return fail([{ code: 'protocol-mismatch', message: 'Bootstrap helper handshake is incompatible.' }]);
        }
        const sent = target.send(requestWire(request));
        if (sent.isErr()) return fail(sent.error);
        phase = 'awaiting-response';
        return;
      }
      if (phase === 'awaiting-response' &&
          (message.messageKind === 'bootstrap-delivery' || message.messageKind === 'bootstrap-rejected')) {
        receiveResponse(message, target);
        return;
      }
      fail([{ code: 'protocol-mismatch', message: 'Bootstrap IPC message is illegal in the current phase.' }]);
    },
    onDisconnect: () => {
      if (!settled && phase !== 'awaiting-exit') {
        fail([{
          code: 'transport-unavailable',
          message: 'Bootstrap IPC disconnected before acknowledgement.'
        }]);
      }
    },
    onExit: exitCode => {
      if (settled || finalizing) return;
      if (phase === 'awaiting-exit' && completion !== undefined && exitCode === 0) {
        settle(clientOk(completion));
        return;
      }
      fail([{
        code: 'transport-unavailable',
        message: 'Bootstrap helper exited without a successful acknowledged exchange.'
      }]);
    }
  };

  const deadline = setTimeout(() => {
    fail([{
      code: 'transport-unavailable',
      message: 'Bootstrap IPC exchange exceeded its bounded deadline.'
    }]);
  }, timeoutMs);

  const spawned = runtime.spawn({
    brokerEntrypoint: options.brokerEntrypoint,
    cwd: options.cwd,
    exchangeId: request.exchangeId.value
  }, observer);
  if (spawned.isErr()) return settle(clientErr(spawned.error[0], ...spawned.error.slice(1)));
  peerState.current = spawned.value;
});

export const createBunCooperativeBootstrapTransportPort = (
  options: BunBootstrapTransportOptions,
  runtime: BunBootstrapInheritedIpcRuntime = createBunBootstrapInheritedIpcRuntime()
): CooperativeBootstrapTransportPort => ({
  exchange: (request, consume) => {
    if (!validPath(options.brokerEntrypoint, 4096) || !validPath(options.cwd, 4096)) {
      return Promise.resolve(clientErr({
        code: 'invalid-input',
        message: 'Bootstrap broker entrypoint or repository directory is invalid.'
      }));
    }
    const bounded = timeout(options.timeoutMs);
    return bounded.isErr()
      ? Promise.resolve(clientErr(bounded.error[0], ...bounded.error.slice(1)))
      : executeExchange(request, consume, options, runtime, bounded.value);
  }
});

const allowedHelperEnvironmentNames = [
  'APPDATA',
  'LOCALAPPDATA',
  'PATH',
  'PATHEXT',
  'SYSTEMROOT',
  'TEMP',
  'TMP',
  'USERPROFILE',
  'WINDIR'
] as const;

const bootstrapHelperEnvironment = (): Readonly<Record<string, string>> =>
  Object.fromEntries(allowedHelperEnvironmentNames.flatMap(name => {
    const value = process.env[name];
    return value === undefined || value.includes('\0') ? [] : [[name, value] as const];
  }));

export const createBunBootstrapInheritedIpcRuntime = (): BunBootstrapInheritedIpcRuntime => ({
  spawn: (plan, observer) => clientTry(() => {
    const subprocess = Bun.spawn({
      cmd: [
        process.execPath,
        plan.brokerEntrypoint,
        BROKER_BOOTSTRAP_CHILD_ARGUMENT,
        plan.exchangeId
      ],
      cwd: plan.cwd,
      env: bootstrapHelperEnvironment(),
      stdin: 'ignore',
      stdout: 'ignore',
      stderr: 'ignore',
      serialization: 'json',
      ipc: (message: unknown, child) => observer.onMessage(message, {
        send: outbound => clientTry(
          () => child.send(outbound),
          { code: 'transport-unavailable', message: 'Bootstrap IPC send failed.' }
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
        { code: 'transport-unavailable', message: 'Bootstrap IPC send failed.' }
      ).map(() => undefined),
      disconnect: () => subprocess.disconnect(),
      terminate: () => subprocess.kill()
    };
  }, {
    code: 'transport-unavailable',
    message: 'Bootstrap broker helper could not be started.'
  })
});
