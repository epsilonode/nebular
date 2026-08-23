import { match } from 'ts-pattern';

import {
  BROKER_PROTOCOL_VERSION,
  BROKER_REQUEST_CANCELLED_CODE,
  parseBrokerSequence,
  type BrokerAttemptId,
  type BrokerCancelMessage,
  type BrokerControlMessage,
  type BrokerHelloMessage,
  type BrokerProgressMessage,
  type BrokerRequestId,
  type BrokerRequestMessage,
  type BrokerSequence,
  type BrokerTerminalMessage,
  type BrokerTimestampMs
} from '../broker-client/public.ts';
import type { AuthorizedExecution } from './authority.ts';
import { brokerErr, brokerOk, type BrokerResult } from './result.ts';

export const BROKER_AUTHORITY_PROGRESS_PHASE = 'authority-admitted' as const;

export type BrokerControlAuthority = Readonly<{
  authorizeExecution: (request: BrokerRequestMessage, nowMs: number) => BrokerResult<AuthorizedExecution>;
}>;

type BrokerControlIdentity = Readonly<{
  requestId: BrokerRequestId;
  nextSequence: BrokerSequence;
  generation: number;
}>;

export type BrokerControlTerminalOutcome =
  | Readonly<{ outcome: 'success'; code: string }>
  | Readonly<{ outcome: 'failure'; code: string }>
  | Readonly<{ outcome: 'cancelled'; code: typeof BROKER_REQUEST_CANCELLED_CODE }>
  | Readonly<{ outcome: 'disconnected'; reason: BrokerControlDisconnectReason }>;

export type BrokerControlSession =
  | (BrokerControlIdentity & Readonly<{ state: 'awaiting-request' }>)
  | (BrokerControlIdentity & Readonly<{ state: 'active'; authorized: AuthorizedExecution }>)
  | (BrokerControlIdentity & Readonly<{ state: 'terminal'; terminal: BrokerControlTerminalOutcome }>);

export type BrokerControlDisconnectReason = 'channel-closed' | 'peer-exit' | 'transport-error';

export type BrokerControlTransition = Readonly<{
  session: BrokerControlSession;
  outbound: readonly BrokerControlMessage[];
}>;

export type BrokerControlOpen = Readonly<{
  session: BrokerControlSession;
  hello: BrokerHelloMessage;
}>;

export type BrokerControlCompletion =
  | Readonly<{ outcome: 'success'; code: string; message: string }>
  | Readonly<{ outcome: 'failure'; code: string; message: string }>;

const nextSequence = (sequence: BrokerSequence): BrokerResult<BrokerSequence> => {
  const parsed = parseBrokerSequence(sequence + 1);
  return parsed.isErr()
    ? brokerErr({ code: 'ipc-invalid', message: 'Broker control sequence cannot advance.' })
    : brokerOk(parsed.value);
};

const initialSequence = (): BrokerResult<BrokerSequence> => {
  const parsed = parseBrokerSequence(0);
  return parsed.isErr()
    ? brokerErr({ code: 'ipc-invalid', message: 'Broker control sequence cannot be initialized.' })
    : brokerOk(parsed.value);
};

const validText = (value: string, maximumLength: number, allowEmpty: boolean): boolean =>
  value.length <= maximumLength && (allowEmpty || value.length > 0) && !value.includes('\0');

const validCapabilities = (capabilities: readonly string[]): boolean =>
  capabilities.length <= 64 &&
  new Set(capabilities).size === capabilities.length &&
  capabilities.every(capability => validText(capability, 128, false));

const responseIdentity = (request: BrokerRequestMessage): Readonly<{ attemptId?: BrokerAttemptId }> =>
  request.attemptId === undefined ? {} : { attemptId: request.attemptId };

export const openBrokerControlSession = (
  requestId: BrokerRequestId,
  sentAtMs: BrokerTimestampMs,
  buildId: string,
  capabilities: readonly string[]
): BrokerResult<BrokerControlOpen> => {
  if (!validText(buildId, 128, false) || !validCapabilities(capabilities)) {
    return brokerErr({ code: 'ipc-invalid', message: 'Broker handshake metadata is invalid.' });
  }
  return initialSequence().andThen(sequence => nextSequence(sequence).map((next): BrokerControlOpen => ({
    session: {
      state: 'awaiting-request',
      requestId,
      nextSequence: next,
      generation: 0
    },
    hello: {
      protocolVersion: BROKER_PROTOCOL_VERSION,
      messageKind: 'hello',
      requestId,
      sequence,
      sentAtMs,
      payload: { buildId, capabilities }
    }
  })));
};

const hasExpectedCorrelation = (session: BrokerControlSession, message: BrokerControlMessage): boolean =>
  session.requestId === message.requestId && session.nextSequence === message.sequence;

const authorityFailureTransition = (
  session: Extract<BrokerControlSession, { state: 'awaiting-request' }>,
  request: BrokerRequestMessage,
  sentAtMs: BrokerTimestampMs,
  code: string
): BrokerResult<BrokerControlTransition> =>
  nextSequence(request.sequence).andThen(terminalSequence => nextSequence(terminalSequence).map((next): BrokerControlTransition => {
    const terminal: BrokerTerminalMessage = {
      protocolVersion: BROKER_PROTOCOL_VERSION,
      messageKind: 'terminal-failure',
      requestId: session.requestId,
      sequence: terminalSequence,
      sentAtMs,
      ...responseIdentity(request),
      payload: { code, message: 'The privileged broker denied repository-scoped authority.' }
    };
    return {
      session: {
        state: 'terminal',
        requestId: session.requestId,
        nextSequence: next,
        generation: session.generation,
        terminal: { outcome: 'failure', code }
      },
      outbound: [terminal]
    };
  }));

const authoritySuccessTransition = (
  session: Extract<BrokerControlSession, { state: 'awaiting-request' }>,
  request: BrokerRequestMessage,
  sentAtMs: BrokerTimestampMs,
  authorized: AuthorizedExecution
): BrokerResult<BrokerControlTransition> =>
  nextSequence(request.sequence).andThen(progressSequence => nextSequence(progressSequence).map((next): BrokerControlTransition => {
    const progress: BrokerProgressMessage = {
      protocolVersion: BROKER_PROTOCOL_VERSION,
      messageKind: 'progress',
      requestId: session.requestId,
      sequence: progressSequence,
      sentAtMs,
      ...responseIdentity(request),
      payload: {
        phase: BROKER_AUTHORITY_PROGRESS_PHASE,
        detail: 'Repository-scoped recipe authority admitted.'
      }
    };
    return {
      session: {
        state: 'active',
        requestId: session.requestId,
        nextSequence: next,
        generation: session.generation,
        authorized
      },
      outbound: [progress]
    };
  }));

const handleRequest = (
  session: BrokerControlSession,
  message: BrokerControlMessage,
  nowMs: number,
  responseSentAtMs: BrokerTimestampMs,
  authority: BrokerControlAuthority
): BrokerResult<BrokerControlTransition> => {
  if (session.state !== 'awaiting-request' || message.messageKind !== 'request') {
    return brokerErr({ code: 'ipc-invalid', message: 'Broker request is not legal in the current control state.' });
  }
  return authority.authorizeExecution(message, nowMs).match(
    authorized => authoritySuccessTransition(session, message, responseSentAtMs, authorized),
    issues => authorityFailureTransition(session, message, responseSentAtMs, issues[0].code)
  );
};

const handleCancel = (
  session: BrokerControlSession,
  message: BrokerControlMessage,
  responseSentAtMs: BrokerTimestampMs
): BrokerResult<BrokerControlTransition> => {
  if (session.state !== 'active' || message.messageKind !== 'cancel') {
    return brokerErr({ code: 'ipc-invalid', message: 'Broker cancellation is not legal in the current control state.' });
  }
  if (message.payload.expectedGeneration !== session.generation) {
    return brokerErr({ code: 'ipc-invalid', message: 'Broker cancellation generation is stale.' });
  }
  return nextSequence(message.sequence).andThen(terminalSequence => nextSequence(terminalSequence).map((next): BrokerControlTransition => {
    const terminal: BrokerTerminalMessage = {
      protocolVersion: BROKER_PROTOCOL_VERSION,
      messageKind: 'terminal-failure',
      requestId: session.requestId,
      sequence: terminalSequence,
      sentAtMs: responseSentAtMs,
      ...(message.attemptId === undefined ? {} : { attemptId: message.attemptId }),
      payload: {
        code: BROKER_REQUEST_CANCELLED_CODE,
        message: 'Broker execution cancellation was accepted.'
      }
    };
    return {
      session: {
        state: 'terminal',
        requestId: session.requestId,
        nextSequence: next,
        generation: session.generation,
        terminal: { outcome: 'cancelled', code: BROKER_REQUEST_CANCELLED_CODE }
      },
      outbound: [terminal]
    };
  }));
};

export const handleBrokerControlInput = (
  session: BrokerControlSession,
  message: BrokerRequestMessage | BrokerCancelMessage,
  nowMs: number,
  responseSentAtMs: BrokerTimestampMs,
  authority: BrokerControlAuthority
): BrokerResult<BrokerControlTransition> => {
  if (!hasExpectedCorrelation(session, message)) {
    return brokerErr({ code: 'ipc-invalid', message: 'Broker control correlation or sequence is invalid.' });
  }
  return match<
    readonly [BrokerControlSession['state'], BrokerRequestMessage['messageKind'] | BrokerCancelMessage['messageKind']],
    BrokerResult<BrokerControlTransition>
  >([session.state, message.messageKind])
    .with(['awaiting-request', 'request'], () => handleRequest(session, message, nowMs, responseSentAtMs, authority))
    .with(['active', 'cancel'], () => handleCancel(session, message, responseSentAtMs))
    .otherwise(() => brokerErr({ code: 'ipc-invalid', message: 'Broker control input is not legal in the current state.' }));
};

export const completeBrokerControlSession = (
  session: BrokerControlSession,
  completion: BrokerControlCompletion,
  sentAtMs: BrokerTimestampMs
): BrokerResult<BrokerControlTransition> => {
  if (session.state !== 'active') {
    return brokerErr({ code: 'process-state-invalid', message: 'Broker control session cannot emit another terminal result.' });
  }
  if (!validText(completion.code, 128, false) || !validText(completion.message, 2048, true)) {
    return brokerErr({ code: 'ipc-invalid', message: 'Broker completion metadata is invalid.' });
  }
  return nextSequence(session.nextSequence).map((next): BrokerControlTransition => {
    const terminal: BrokerTerminalMessage = {
      protocolVersion: BROKER_PROTOCOL_VERSION,
      messageKind: completion.outcome === 'success' ? 'terminal-success' : 'terminal-failure',
      requestId: session.requestId,
      sequence: session.nextSequence,
      sentAtMs,
      ...(session.authorized.request.attemptId === undefined ? {} : { attemptId: session.authorized.request.attemptId }),
      payload: { code: completion.code, message: completion.message }
    };
    return {
      session: {
        state: 'terminal',
        requestId: session.requestId,
        nextSequence: next,
        generation: session.generation,
        terminal: { outcome: completion.outcome, code: completion.code }
      },
      outbound: [terminal]
    };
  });
};

export const disconnectBrokerControlSession = (
  session: BrokerControlSession,
  reason: BrokerControlDisconnectReason
): BrokerResult<BrokerControlTransition> =>
  session.state === 'terminal'
    ? brokerErr({ code: 'process-state-invalid', message: 'Broker control session already has a terminal outcome.' })
    : brokerOk({
        session: {
          state: 'terminal',
          requestId: session.requestId,
          nextSequence: session.nextSequence,
          generation: session.generation,
          terminal: { outcome: 'disconnected', reason }
        },
        outbound: []
      });
