import { type BrokerControlMessage, type BrokerProgressMessage } from './ipc.ts';
import { type BrokerAttemptId, type BrokerRequestId, type BrokerSequence } from './primitives.ts';
import { type BrokerClientResult } from './result.ts';
export declare const BROKER_REQUEST_CANCELLED_CODE: "request-cancelled";
export declare const BROKER_MAX_DISCONNECT_DETAIL_LENGTH = 2048;
export type BrokerExchangeDirection = 'broker-to-client' | 'client-to-broker';
export type BrokerClientProgress = BrokerProgressMessage['payload'];
export type BrokerClientTerminalOutcome = Readonly<{
    outcome: 'success';
    code: string;
    message: string;
    attemptId?: BrokerAttemptId;
}> | Readonly<{
    outcome: 'failure';
    code: string;
    message: string;
    attemptId?: BrokerAttemptId;
}> | Readonly<{
    outcome: 'cancelled';
    code: typeof BROKER_REQUEST_CANCELLED_CODE;
    message: string;
    attemptId?: BrokerAttemptId;
}> | Readonly<{
    outcome: 'protocol-error';
    code: string;
    message: string;
    attemptId?: BrokerAttemptId;
}> | Readonly<{
    outcome: 'disconnected';
    reason: BrokerDisconnectReason;
    detail: string;
}>;
type BrokerExchangeIdentity = Readonly<{
    requestId: BrokerRequestId;
    nextSequence: BrokerSequence;
}>;
export type BrokerClientExchange = (BrokerExchangeIdentity & Readonly<{
    state: 'awaiting-hello';
}>) | (BrokerExchangeIdentity & Readonly<{
    state: 'ready';
}>) | (BrokerExchangeIdentity & Readonly<{
    state: 'active';
    progress: readonly BrokerClientProgress[];
}>) | (BrokerExchangeIdentity & Readonly<{
    state: 'cancellation-requested';
    progress: readonly BrokerClientProgress[];
}>) | (BrokerExchangeIdentity & Readonly<{
    state: 'terminal';
    progress: readonly BrokerClientProgress[];
    terminal: BrokerClientTerminalOutcome;
}>);
export type BrokerDisconnectReason = 'channel-closed' | 'peer-exit' | 'transport-error';
export type BrokerClientExchangeEvent = Readonly<{
    eventKind: 'control';
    direction: BrokerExchangeDirection;
    message: BrokerControlMessage;
}> | Readonly<{
    eventKind: 'disconnect';
    reason: BrokerDisconnectReason;
    detail: string;
}>;
export declare const openBrokerClientExchange: (requestId: BrokerRequestId) => BrokerClientResult<BrokerClientExchange>;
export declare const reduceBrokerClientExchange: (exchange: BrokerClientExchange, event: BrokerClientExchangeEvent) => BrokerClientResult<BrokerClientExchange>;
export {};
