import { ResultAsync } from 'neverthrow';

import {
  BROKER_BOOTSTRAP_MAX_SECRET_CODE_UNITS,
  BROKER_BOOTSTRAP_MAX_SLOTS,
  BROKER_BOOTSTRAP_PROTOCOL_VERSION,
  decodeBootstrapProtocolMessage,
  type BootstrapAcknowledgementMessage,
  type BootstrapRejectionCode,
  type BootstrapRequestMessage
} from '../broker-client/public.ts';
import {
  validateBootstrapLeaseAuthority,
  type BootstrapLeaseAuthorityPort
} from './bootstrap-authority.ts';
import {
  secretLeaseErr,
  secretLeaseOk,
  secretLeaseTaskErr,
  secretLeaseTaskOk,
  type ActiveSecretLease,
  type AuthorizedSecretLease,
  type SecretLeaseIssues,
  type SecretLeaseResult,
  type SecretLeaseTaskResult
} from './lease.ts';
import {
  activateAuthorizedSecretLease,
  deliverActiveSecretLease,
  type BootstrapSecretContext,
  type BootstrapSecretPort,
  type BootstrapSecretReceipt,
  type BootstrapSecretSink,
  type BootstrapSecretSlot,
  type SecretDeliveryClock,
  type SecretDeliveryTerminal,
  type SecretStoreLeasePort
} from './secret-delivery.ts';

export const BROKER_BOOTSTRAP_BROKER_BUILD_ID = 'epsilonode-nebular-bootstrap-v1' as const;
export const BROKER_BOOTSTRAP_CHILD_MARKER = '--nebular-bootstrap-child' as const;
export const BROKER_BOOTSTRAP_CHILD_TIMEOUT_MS = 15_000;
export const BROKER_BOOTSTRAP_CHILD_MAX_TIMEOUT_MS = 60_000;

export type BrokerBootstrapInheritedIpcRuntime = Readonly<{
  send: (message: unknown) => SecretLeaseTaskResult<void>;
  receive: (timeoutMs: number) => SecretLeaseTaskResult<unknown>;
  disconnect: () => SecretLeaseResult<void>;
}>;

export type BrokerBootstrapChildInput = Readonly<{
  exchangeId: unknown;
  timeoutMs?: number;
  buildId?: string;
}>;

export type BrokerBootstrapChildPorts = Readonly<{
  authority: BootstrapLeaseAuthorityPort;
  clock: SecretDeliveryClock;
  runtime: BrokerBootstrapInheritedIpcRuntime;
  secretStore: SecretStoreLeasePort;
}>;

type StagedSecretSlot = Readonly<{
  slot: BootstrapSecretSlot;
  secretText: string;
}>;

const validExchangeId = (value: unknown): SecretLeaseResult<string> =>
  typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(value)
    ? secretLeaseOk(value)
    : secretLeaseErr({ code: 'bootstrap-rejected', message: 'Bootstrap exchange identity is invalid.' });

const childTimeout = (value: number | undefined): SecretLeaseResult<number> => {
  const timeoutMs = value ?? BROKER_BOOTSTRAP_CHILD_TIMEOUT_MS;
  return Number.isSafeInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= BROKER_BOOTSTRAP_CHILD_MAX_TIMEOUT_MS
    ? secretLeaseOk(timeoutMs)
    : secretLeaseErr({ code: 'bootstrap-rejected', message: 'Bootstrap child deadline is invalid.' });
};

const helloWire = (exchangeId: string, buildId: string): unknown => ({
  protocolVersion: BROKER_BOOTSTRAP_PROTOCOL_VERSION,
  messageKind: 'bootstrap-hello',
  exchangeId,
  payload: {
    buildId,
    capabilities: ['atomic-environment-v1', 'secret-bundle-v1']
  }
});

const rejectedWire = (exchangeId: string, code: BootstrapRejectionCode): unknown => ({
  protocolVersion: BROKER_BOOTSTRAP_PROTOCOL_VERSION,
  messageKind: 'bootstrap-rejected',
  exchangeId,
  payload: { code }
});

const deliveryWire = (
  exchangeId: string,
  context: BootstrapSecretContext,
  slots: readonly StagedSecretSlot[]
): unknown => ({
  protocolVersion: BROKER_BOOTSTRAP_PROTOCOL_VERSION,
  messageKind: 'bootstrap-delivery',
  exchangeId,
  payload: {
    leaseId: context.leaseId.value,
    processAttemptId: context.processAttemptId,
    expiresAtMs: context.expiresAtMs,
    slots: slots.map(({ slot, secretText }) => ({
      slotId: slot.slotId,
      environmentName: slot.environmentName,
      secret: secretText
    }))
  }
});

const mapProtocolFailure = (): SecretLeaseResult<never> => secretLeaseErr({
  code: 'bootstrap-rejected',
  message: 'Secret-bearing bootstrap protocol message is invalid.'
});

const decodeRequest = (wire: unknown, exchangeId: string): SecretLeaseResult<BootstrapRequestMessage> => {
  const decoded = decodeBootstrapProtocolMessage(wire);
  return decoded.isOk() && decoded.value.messageKind === 'bootstrap-request' &&
    decoded.value.exchangeId.value === exchangeId
    ? secretLeaseOk(decoded.value)
    : mapProtocolFailure();
};

const sameAcknowledgedSlots = (
  acknowledgement: BootstrapAcknowledgementMessage,
  context: BootstrapSecretContext
): boolean => acknowledgement.payload.installedSlotCount === context.slots.length &&
  acknowledgement.payload.installedSlotIds.length === context.slots.length &&
  context.slots.every(slot => acknowledgement.payload.installedSlotIds.some(id => id.value === slot.slotId));

const acknowledgementReceipt = (
  wire: unknown,
  exchangeId: string,
  context: BootstrapSecretContext
): SecretLeaseResult<BootstrapSecretReceipt> => {
  const decoded = decodeBootstrapProtocolMessage(wire);
  if (decoded.isErr() || decoded.value.messageKind !== 'bootstrap-acknowledgement') {
    return mapProtocolFailure();
  }
  const acknowledgement = decoded.value;
  return acknowledgement.exchangeId.value === exchangeId &&
    acknowledgement.payload.leaseId.value === context.leaseId.value &&
    acknowledgement.payload.processAttemptId.value === context.processAttemptId &&
    sameAcknowledgedSlots(acknowledgement, context)
    ? secretLeaseOk({
        leaseId: context.leaseId,
        processAttemptId: context.processAttemptId,
        installedSlotIds: context.slots.map(slot => slot.slotId),
        secretsCleared: true
      })
    : mapProtocolFailure();
};

const validStagedSlot = (
  staged: readonly StagedSecretSlot[],
  slot: BootstrapSecretSlot,
  secretText: string
): boolean => staged.length < BROKER_BOOTSTRAP_MAX_SLOTS &&
  secretText.length > 0 && secretText.length <= BROKER_BOOTSTRAP_MAX_SECRET_CODE_UNITS &&
  !secretText.includes('\0') &&
  !staged.some(item => item.slot.slotId === slot.slotId ||
    item.slot.environmentName.toUpperCase() === slot.environmentName.toUpperCase());

const stageSink = (staged: StagedSecretSlot[]): BootstrapSecretSink => ({
  install: (slot, secretText) => {
    if (!validStagedSlot(staged, slot, secretText)) {
      return secretLeaseErr({
        code: 'bootstrap-rejected',
        message: 'Bootstrap secret staging rejected an invalid or duplicate slot.'
      });
    }
    staged.push({ slot, secretText });
    return secretLeaseOk(undefined);
  }
});

const clearStaged = (staged: StagedSecretSlot[]): void => {
  staged.splice(0, staged.length);
};

const createBootstrapSecretPort = (
  exchangeId: string,
  timeoutMs: number,
  runtime: BrokerBootstrapInheritedIpcRuntime
): BootstrapSecretPort => ({
  runWithSecrets: (context, install) => {
    const staged: StagedSecretSlot[] = [];
    const exchanged = install(stageSink(staged))
      .andThen(() => runtime.send(deliveryWire(exchangeId, context, staged)))
      .andThen(() => runtime.receive(timeoutMs))
      .andThen(wire => acknowledgementReceipt(wire, exchangeId, context));
    return exchanged
      .map(receipt => {
        clearStaged(staged);
        return receipt;
      })
      .mapErr(issues => {
        clearStaged(staged);
        return issues;
      });
  }
});

const rejectionCode = (issues: SecretLeaseIssues): BootstrapRejectionCode => {
  switch (issues[0].code) {
    case 'grant-expired': return 'grant-expired';
    case 'grant-revoked': return 'grant-revoked';
    case 'secret-unavailable': return 'secret-unavailable';
    case 'slot-not-authorized': return 'slot-not-authorized';
    case 'bootstrap-rejected':
    case 'lease-expired':
    case 'lease-invalid':
    case 'lease-transition-invalid':
    case 'secret-input-invalid':
    case 'secret-store-failed': return 'authority-denied';
  }
};

const rejectAuthority = <Value>(
  runtime: BrokerBootstrapInheritedIpcRuntime,
  exchangeId: string,
  issues: SecretLeaseIssues
): SecretLeaseTaskResult<Value> => runtime.send(rejectedWire(exchangeId, rejectionCode(issues)))
  .andThen(() => secretLeaseTaskErr(issues[0], ...issues.slice(1)));

const revokeResolvedLease = <Value>(
  lease: AuthorizedSecretLease,
  atMs: number,
  ports: BrokerBootstrapChildPorts,
  issues: SecretLeaseIssues
): SecretLeaseTaskResult<Value> => ports.authority.transitionLease({
  leaseId: lease.facts.id,
  expectedState: 'authorized',
  nextState: 'revoked',
  atMs
}).andThen(() => secretLeaseTaskErr(issues[0], ...issues.slice(1)));

const validateResolvedLease = (
  request: BootstrapRequestMessage,
  lease: AuthorizedSecretLease,
  ports: BrokerBootstrapChildPorts
): SecretLeaseTaskResult<AuthorizedSecretLease> => {
  const validated = validateBootstrapLeaseAuthority(request, lease);
  return validated.isOk()
    ? secretLeaseTaskOk(validated.value)
    : revokeResolvedLease(lease, ports.clock.nowMs(), ports, validated.error);
};

const activateResolvedLease = (
  lease: AuthorizedSecretLease,
  ports: BrokerBootstrapChildPorts
): SecretLeaseTaskResult<ActiveSecretLease> => {
  const atMs = ports.clock.nowMs();
  const activated = activateAuthorizedSecretLease(lease, atMs);
  return activated.isErr()
    ? revokeResolvedLease<ActiveSecretLease>(lease, atMs, ports, activated.error)
    : ports.authority.transitionLease({
        leaseId: lease.facts.id,
        expectedState: 'authorized',
        nextState: 'active',
        atMs
      }).map(() => activated.value);
};

const persistDeliveryTerminal = (
  terminal: SecretDeliveryTerminal,
  ports: BrokerBootstrapChildPorts
): SecretLeaseTaskResult<SecretDeliveryTerminal> => ports.authority.transitionLease({
  leaseId: terminal.leaseId,
  expectedState: 'active',
  nextState: terminal.outcome === 'completed' ? 'consumed' : 'revoked',
  atMs: terminal.outcome === 'completed' ? terminal.lease.completedAtMs : terminal.lease.revokedAtMs
}).map(() => terminal);

const revokeActiveDeliveryFailure = (
  active: ActiveSecretLease,
  ports: BrokerBootstrapChildPorts,
  issues: SecretLeaseIssues
): SecretLeaseTaskResult<SecretDeliveryTerminal> => ports.authority.transitionLease({
  leaseId: active.facts.id,
  expectedState: 'active',
  nextState: 'revoked',
  atMs: ports.clock.nowMs()
}).andThen(() => secretLeaseTaskErr(issues[0], ...issues.slice(1)));

const resolveAndDeliver = (
  request: BootstrapRequestMessage,
  exchangeId: string,
  timeoutMs: number,
  ports: BrokerBootstrapChildPorts
): SecretLeaseTaskResult<SecretDeliveryTerminal> => ports.authority.resolveAuthorizedLease(request)
  .andThen(lease => validateResolvedLease(request, lease, ports))
  .andThen(lease => activateResolvedLease(lease, ports))
  .orElse(issues => rejectAuthority<ActiveSecretLease>(ports.runtime, exchangeId, issues))
  .andThen(active => deliverActiveSecretLease(active, {
    clock: ports.clock,
    secretStore: ports.secretStore,
    bootstrap: createBootstrapSecretPort(exchangeId, timeoutMs, ports.runtime)
  }).andThen(terminal => persistDeliveryTerminal(terminal, ports))
    .orElse(issues => revokeActiveDeliveryFailure(active, ports, issues)));

const disconnectAfter = <Value>(
  operation: SecretLeaseTaskResult<Value>,
  runtime: BrokerBootstrapInheritedIpcRuntime
): SecretLeaseTaskResult<Value> => {
  const finalized: Promise<SecretLeaseResult<Value>> = Promise.resolve(operation).then(outcome => {
    const disconnected = runtime.disconnect();
    return outcome.isErr() || disconnected.isOk()
      ? outcome
      : secretLeaseErr(disconnected.error[0], ...disconnected.error.slice(1));
  });
  return ResultAsync.fromSafePromise(finalized).andThen(result => result);
};

const runPreparedChild = (
  input: BrokerBootstrapChildInput,
  ports: BrokerBootstrapChildPorts,
  exchangeId: string,
  timeoutMs: number
): SecretLeaseTaskResult<SecretDeliveryTerminal> => {
  const operation = ports.runtime.send(helloWire(
    exchangeId,
    input.buildId ?? BROKER_BOOTSTRAP_BROKER_BUILD_ID
  )).andThen(() => ports.runtime.receive(timeoutMs)).andThen(wire => {
    const request = decodeRequest(wire, exchangeId);
    return request.isErr()
      ? ports.runtime.send(rejectedWire(exchangeId, 'protocol-invalid'))
        .andThen(() => secretLeaseTaskErr(request.error[0], ...request.error.slice(1)))
      : resolveAndDeliver(request.value, exchangeId, timeoutMs, ports);
  });
  return disconnectAfter(operation, ports.runtime);
};

export const runBrokerBootstrapInheritedIpcChild = (
  input: BrokerBootstrapChildInput,
  ports: BrokerBootstrapChildPorts
): SecretLeaseTaskResult<SecretDeliveryTerminal> => {
  const prepared = validExchangeId(input.exchangeId).andThen(exchangeId =>
    childTimeout(input.timeoutMs).map(timeoutMs => ({ exchangeId, timeoutMs }))
  );
  return prepared.isErr()
    ? secretLeaseTaskErr(prepared.error[0], ...prepared.error.slice(1))
    : runPreparedChild(input, ports, prepared.value.exchangeId, prepared.value.timeoutMs);
};

export const createBunBootstrapInheritedIpcChildRuntime = (): BrokerBootstrapInheritedIpcRuntime => ({
  send: message => {
    if (typeof process.send !== 'function') {
      return secretLeaseTaskErr({ code: 'bootstrap-rejected', message: 'Bootstrap inherited IPC is unavailable.' });
    }
    const sent = new Promise<SecretLeaseResult<void>>(resolve => {
      process.send?.(message, error => resolve(error === null
        ? secretLeaseOk(undefined)
        : secretLeaseErr({ code: 'bootstrap-rejected', message: 'Bootstrap IPC send failed.' })
      ));
    });
    return ResultAsync.fromSafePromise(sent).andThen(result => result);
  },
  receive: timeoutMs => {
    const received = new Promise<SecretLeaseResult<unknown>>(resolve => {
      const state = { settled: false };
      const finish = (result: SecretLeaseResult<unknown>): void => {
        if (state.settled) return;
        state.settled = true;
        clearTimeout(timer);
        process.off('message', onMessage);
        process.off('disconnect', onDisconnect);
        resolve(result);
      };
      const onMessage = (message: unknown): void => finish(secretLeaseOk(message));
      const onDisconnect = (): void => finish(secretLeaseErr({
        code: 'bootstrap-rejected',
        message: 'Bootstrap IPC disconnected before the expected message.'
      }));
      const timer = setTimeout(() => finish(secretLeaseErr({
        code: 'bootstrap-rejected',
        message: 'Bootstrap IPC receive exceeded its bounded deadline.'
      })), timeoutMs);
      process.once('message', onMessage);
      process.once('disconnect', onDisconnect);
    });
    return ResultAsync.fromSafePromise(received).andThen(result => result);
  },
  disconnect: () => {
    if (!process.connected) return secretLeaseOk(undefined);
    process.disconnect?.();
    return secretLeaseOk(undefined);
  }
});

export const brokerBootstrapChildExchangeId = (
  argv: readonly string[]
): SecretLeaseResult<string | undefined> => {
  const markerIndex = argv.indexOf(BROKER_BOOTSTRAP_CHILD_MARKER);
  return markerIndex < 0
    ? secretLeaseOk(undefined)
    : validExchangeId(argv[markerIndex + 1]);
};
