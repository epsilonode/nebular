import { match } from 'ts-pattern';

import {
  type BrokerControlMessage,
  type BrokerProgressMessage,
  type BrokerTerminalMessage
} from './ipc.ts';
import {
  parseBrokerSequence,
  type BrokerAttemptId,
  type BrokerRequestId,
  type BrokerSequence
} from './primitives.ts';
import { clientErr, clientOk, type BrokerClientResult } from './result.ts';

export const BROKER_REQUEST_CANCELLED_CODE = 'request-cancelled' as const;
export const BROKER_MAX_DISCONNECT_DETAIL_LENGTH = 2048;

export type BrokerExchangeDirection = 'broker-to-client' | 'client-to-broker';

export type BrokerClientProgress = BrokerProgressMessage['payload'];

export type BrokerClientTerminalOutcome =
  | Readonly<{ outcome: 'success'; code: string; message: string; attemptId?: BrokerAttemptId }>
  | Readonly<{ outcome: 'failure'; code: string; message: string; attemptId?: BrokerAttemptId }>
  | Readonly<{
      outcome: 'cancelled';
      code: typeof BROKER_REQUEST_CANCELLED_CODE;
      message: string;
      attemptId?: BrokerAttemptId;
    }>
  | Readonly<{ outcome: 'protocol-error'; code: string; message: string; attemptId?: BrokerAttemptId }>
  | Readonly<{ outcome: 'disconnected'; reason: BrokerDisconnectReason; detail: string }>;

type BrokerExchangeIdentity = Readonly<{
  requestId: BrokerRequestId;
  nextSequence: BrokerSequence;
}>;

export type BrokerClientExchange =
  | (BrokerExchangeIdentity & Readonly<{ state: 'awaiting-hello' }>)
  | (BrokerExchangeIdentity & Readonly<{ state: 'ready' }>)
  | (BrokerExchangeIdentity & Readonly<{ state: 'active'; progress: readonly BrokerClientProgress[] }>)
  | (BrokerExchangeIdentity & Readonly<{ state: 'cancellation-requested'; progress: readonly BrokerClientProgress[] }>)
  | (BrokerExchangeIdentity & Readonly<{
      state: 'terminal';
      progress: readonly BrokerClientProgress[];
      terminal: BrokerClientTerminalOutcome;
    }>);

export type BrokerDisconnectReason = 'channel-closed' | 'peer-exit' | 'transport-error';

export type BrokerClientExchangeEvent =
  | Readonly<{
      eventKind: 'control';
      direction: BrokerExchangeDirection;
      message: BrokerControlMessage;
    }>
  | Readonly<{
      eventKind: 'disconnect';
      reason: BrokerDisconnectReason;
      detail: string;
    }>;

const nextSequence = (sequence: BrokerSequence): BrokerClientResult<BrokerSequence> =>
  parseBrokerSequence(sequence + 1);

export const openBrokerClientExchange = (
  requestId: BrokerRequestId
): BrokerClientResult<BrokerClientExchange> =>
  parseBrokerSequence(0).map(nextSequenceValue => ({
    state: 'awaiting-hello',
    requestId,
    nextSequence: nextSequenceValue
  }));

const transitionHello = (
  exchange: BrokerClientExchange,
  message: BrokerControlMessage
): BrokerClientResult<BrokerClientExchange> =>
  nextSequence(message.sequence).map(sequence => ({
    state: 'ready',
    requestId: exchange.requestId,
    nextSequence: sequence
  }));

const transitionRequest = (
  exchange: BrokerClientExchange,
  message: BrokerControlMessage
): BrokerClientResult<BrokerClientExchange> =>
  nextSequence(message.sequence).map(sequence => ({
    state: 'active',
    requestId: exchange.requestId,
    nextSequence: sequence,
    progress: []
  }));

const transitionProgress = (
  exchange: BrokerClientExchange,
  message: BrokerControlMessage
): BrokerClientResult<BrokerClientExchange> => {
  if ((exchange.state !== 'active' && exchange.state !== 'cancellation-requested') || message.messageKind !== 'progress') {
    return clientErr({ code: 'protocol-mismatch', message: 'Progress is not legal in the current broker exchange state.' });
  }
  return nextSequence(message.sequence).map(sequence => ({
    state: exchange.state,
    requestId: exchange.requestId,
    nextSequence: sequence,
    progress: [...exchange.progress, message.payload]
  }));
};

const transitionCancel = (
  exchange: BrokerClientExchange,
  message: BrokerControlMessage
): BrokerClientResult<BrokerClientExchange> => {
  if (exchange.state !== 'active') {
    return clientErr({ code: 'protocol-mismatch', message: 'Cancellation is not legal in the current broker exchange state.' });
  }
  return nextSequence(message.sequence).map(sequence => ({
    state: 'cancellation-requested',
    requestId: exchange.requestId,
    nextSequence: sequence,
    progress: exchange.progress
  }));
};

const terminalOutcome = (message: BrokerTerminalMessage): BrokerClientTerminalOutcome =>
  match<BrokerTerminalMessage['messageKind'], BrokerClientTerminalOutcome>(message.messageKind)
    .with('terminal-success', (): BrokerClientTerminalOutcome => ({
      outcome: 'success',
      code: message.payload.code,
      message: message.payload.message,
      ...(message.attemptId === undefined ? {} : { attemptId: message.attemptId })
    }))
    .with('terminal-failure', (): BrokerClientTerminalOutcome => message.payload.code === BROKER_REQUEST_CANCELLED_CODE
      ? {
          outcome: 'cancelled',
          code: BROKER_REQUEST_CANCELLED_CODE,
          message: message.payload.message,
          ...(message.attemptId === undefined ? {} : { attemptId: message.attemptId })
        }
      : {
          outcome: 'failure',
          code: message.payload.code,
          message: message.payload.message,
          ...(message.attemptId === undefined ? {} : { attemptId: message.attemptId })
        })
    .with('protocol-error', (): BrokerClientTerminalOutcome => ({
      outcome: 'protocol-error',
      code: message.payload.code,
      message: message.payload.message,
      ...(message.attemptId === undefined ? {} : { attemptId: message.attemptId })
    }))
    .exhaustive();

const isTerminalMessage = (message: BrokerControlMessage): message is BrokerTerminalMessage =>
  message.messageKind === 'terminal-success' ||
  message.messageKind === 'terminal-failure' ||
  message.messageKind === 'protocol-error';

const transitionTerminal = (
  exchange: BrokerClientExchange,
  message: BrokerControlMessage
): BrokerClientResult<BrokerClientExchange> => {
  if ((exchange.state !== 'active' && exchange.state !== 'cancellation-requested') || !isTerminalMessage(message)) {
    return clientErr({ code: 'protocol-mismatch', message: 'A terminal result is not legal in the current broker exchange state.' });
  }
  if (exchange.state === 'cancellation-requested' &&
      (message.messageKind !== 'terminal-failure' || message.payload.code !== BROKER_REQUEST_CANCELLED_CODE)) {
    return clientErr({
      code: 'protocol-mismatch',
      message: 'Only cleanup-gated cancellation may complete an accepted broker cancellation.'
    });
  }
  return nextSequence(message.sequence).map(sequence => ({
    state: 'terminal',
    requestId: exchange.requestId,
    nextSequence: sequence,
    progress: exchange.progress,
    terminal: terminalOutcome(message)
  }));
};

const transitionProtocolError = (
  exchange: BrokerClientExchange,
  message: BrokerControlMessage
): BrokerClientResult<BrokerClientExchange> => {
  if (!isTerminalMessage(message) || message.messageKind !== 'protocol-error') {
    return clientErr({ code: 'protocol-mismatch', message: 'The broker protocol-error result is invalid.' });
  }
  const progress: readonly BrokerClientProgress[] =
    exchange.state === 'active' || exchange.state === 'cancellation-requested' ? exchange.progress : [];
  return nextSequence(message.sequence).map(sequence => ({
    state: 'terminal',
    requestId: exchange.requestId,
    nextSequence: sequence,
    progress,
    terminal: terminalOutcome(message)
  }));
};

const reduceControlFrame = (
  exchange: BrokerClientExchange,
  direction: BrokerExchangeDirection,
  message: BrokerControlMessage
): BrokerClientResult<BrokerClientExchange> => {
  if (message.requestId !== exchange.requestId || message.sequence !== exchange.nextSequence) {
    return clientErr({ code: 'sequence-invalid', message: 'Broker exchange correlation or sequence is invalid.' });
  }
  return match<
    readonly [BrokerClientExchange['state'], BrokerExchangeDirection, BrokerControlMessage['messageKind']],
    BrokerClientResult<BrokerClientExchange>
  >([exchange.state, direction, message.messageKind])
    .with(['awaiting-hello', 'broker-to-client', 'hello'], () => transitionHello(exchange, message))
    .with(['ready', 'client-to-broker', 'request'], () => transitionRequest(exchange, message))
    .with(['active', 'broker-to-client', 'progress'], () => transitionProgress(exchange, message))
    .with(['active', 'client-to-broker', 'cancel'], () => transitionCancel(exchange, message))
    .with(['active', 'broker-to-client', 'terminal-success'], () => transitionTerminal(exchange, message))
    .with(['active', 'broker-to-client', 'terminal-failure'], () => transitionTerminal(exchange, message))
    .with(['cancellation-requested', 'broker-to-client', 'terminal-failure'], () => transitionTerminal(exchange, message))
    .with(['awaiting-hello', 'broker-to-client', 'protocol-error'], () => transitionProtocolError(exchange, message))
    .with(['ready', 'broker-to-client', 'protocol-error'], () => transitionProtocolError(exchange, message))
    .with(['active', 'broker-to-client', 'protocol-error'], () => transitionProtocolError(exchange, message))
    .with(['cancellation-requested', 'broker-to-client', 'protocol-error'], () => transitionProtocolError(exchange, message))
    .otherwise(() => clientErr({
      code: 'protocol-mismatch',
      message: 'Broker control direction or message kind is not legal in the current exchange state.'
    }));
};

const reduceInFlightCompletionThatWonCancelRace = (
  exchange: Extract<BrokerClientExchange, { state: 'cancellation-requested' }>,
  direction: BrokerExchangeDirection,
  message: BrokerControlMessage
): BrokerClientResult<BrokerClientExchange> | undefined => {
  const completionFrame = message.messageKind === 'progress' || message.messageKind === 'terminal-success' ||
    message.messageKind === 'terminal-failure' || message.messageKind === 'protocol-error';
  if (direction !== 'broker-to-client' || !completionFrame || message.sequence + 1 !== exchange.nextSequence) {
    return undefined;
  }
  // The broker may have committed sequence N immediately before the client
  // emitted cancel sequence N. In that sole collision, the already-in-flight
  // broker completion wins and the ordinary active transition is replayed.
  return reduceControlFrame({
    state: 'active',
    requestId: exchange.requestId,
    nextSequence: message.sequence,
    progress: exchange.progress
  }, direction, message);
};

const reduceDisconnect = (
  exchange: BrokerClientExchange,
  event: Extract<BrokerClientExchangeEvent, { eventKind: 'disconnect' }>
): BrokerClientResult<BrokerClientExchange> => {
  if (event.detail.length === 0 || event.detail.length > BROKER_MAX_DISCONNECT_DETAIL_LENGTH) {
    return clientErr({ code: 'invalid-input', message: 'Broker disconnect detail is invalid.' });
  }
  const progress: readonly BrokerClientProgress[] =
    exchange.state === 'active' || exchange.state === 'cancellation-requested' ? exchange.progress : [];
  return clientOk({
    state: 'terminal',
    requestId: exchange.requestId,
    nextSequence: exchange.nextSequence,
    progress,
    terminal: { outcome: 'disconnected', reason: event.reason, detail: event.detail }
  });
};

export const reduceBrokerClientExchange = (
  exchange: BrokerClientExchange,
  event: BrokerClientExchangeEvent
): BrokerClientResult<BrokerClientExchange> => {
  if (exchange.state === 'terminal') {
    return clientErr({ code: 'session-closed', message: 'Broker exchange already has its single terminal outcome.' });
  }
  if (event.eventKind === 'control' && exchange.state === 'cancellation-requested') {
    const raced = reduceInFlightCompletionThatWonCancelRace(exchange, event.direction, event.message);
    if (raced !== undefined) return raced;
  }
  return event.eventKind === 'disconnect'
    ? reduceDisconnect(exchange, event)
    : reduceControlFrame(exchange, event.direction, event.message);
};
