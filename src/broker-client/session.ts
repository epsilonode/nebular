import { match } from 'ts-pattern';

import type { BrokerControlMessage } from './ipc.ts';
import { parseBrokerSequence, type BrokerRequestId, type BrokerSequence } from './primitives.ts';
import { clientErr, type BrokerClientResult } from './result.ts';

export type BrokerClientSession =
  | Readonly<{ state: 'awaiting-hello'; requestId: BrokerRequestId; nextSequence: BrokerSequence }>
  | Readonly<{ state: 'ready'; requestId: BrokerRequestId; nextSequence: BrokerSequence }>
  | Readonly<{ state: 'active'; requestId: BrokerRequestId; nextSequence: BrokerSequence }>
  | Readonly<{ state: 'terminal'; requestId: BrokerRequestId; nextSequence: BrokerSequence; succeeded: boolean }>;

const advanceOpen = (
  session: BrokerClientSession,
  message: BrokerControlMessage,
  state: 'ready' | 'active'
): BrokerClientResult<BrokerClientSession> =>
  parseBrokerSequence(message.sequence + 1).map((nextSequence): BrokerClientSession => ({
    ...session,
    state,
    nextSequence
  }));

const advanceTerminal = (
  session: BrokerClientSession,
  message: BrokerControlMessage,
  succeeded: boolean
): BrokerClientResult<BrokerClientSession> =>
  parseBrokerSequence(message.sequence + 1).map((nextSequence): BrokerClientSession => ({
    state: 'terminal',
    requestId: session.requestId,
    nextSequence,
    succeeded
  }));

export const reduceBrokerClientSession = (
  session: BrokerClientSession,
  message: BrokerControlMessage
): BrokerClientResult<BrokerClientSession> => {
  if (message.requestId !== session.requestId || message.sequence !== session.nextSequence) {
    return clientErr({ code: 'sequence-invalid', message: 'Broker message correlation or sequence is invalid.' });
  }
  if (session.state === 'terminal') return clientErr({ code: 'session-closed', message: 'Broker session is already terminal.' });
  return match<[BrokerClientSession['state'], BrokerControlMessage['messageKind']]>([session.state, message.messageKind])
    .with(['awaiting-hello', 'hello'], () => advanceOpen(session, message, 'ready'))
    .with(['ready', 'request'], () => advanceOpen(session, message, 'active'))
    .with(['active', 'progress'], () => advanceOpen(session, message, 'active'))
    .with(['active', 'terminal-success'], () => advanceTerminal(session, message, true))
    .with(['active', 'terminal-failure'], ['active', 'protocol-error'], () => advanceTerminal(session, message, false))
    .otherwise(() => clientErr({ code: 'protocol-mismatch', message: 'Broker message is not legal in the current session state.' }));
};
