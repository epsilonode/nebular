import { BROKER_REQUEST_CANCELLED_CODE, type BrokerAttemptId, type BrokerCancelMessage, type BrokerControlMessage, type BrokerHelloMessage, type BrokerRequestId, type BrokerRequestMessage, type BrokerSequence, type BrokerTimestampMs } from '../broker-client/public.ts';
import type { AuthorizedExecution } from './authority.ts';
import { type BrokerResult } from './result.ts';
export declare const BROKER_AUTHORITY_PROGRESS_PHASE: "authority-admitted";
export type BrokerControlAuthority = Readonly<{
    authorizeExecution: (request: BrokerRequestMessage, nowMs: number) => BrokerResult<AuthorizedExecution>;
}>;
type BrokerControlIdentity = Readonly<{
    requestId: BrokerRequestId;
    nextSequence: BrokerSequence;
    generation: number;
}>;
export type BrokerControlTerminalOutcome = Readonly<{
    outcome: 'success';
    code: string;
}> | Readonly<{
    outcome: 'failure';
    code: string;
}> | Readonly<{
    outcome: 'cancelled';
    code: typeof BROKER_REQUEST_CANCELLED_CODE;
}> | Readonly<{
    outcome: 'disconnected';
    reason: BrokerControlDisconnectReason;
}>;
export type BrokerControlSession = (BrokerControlIdentity & Readonly<{
    state: 'awaiting-request';
}>) | (BrokerControlIdentity & Readonly<{
    state: 'active';
    authorized: AuthorizedExecution;
}>) | (BrokerControlIdentity & Readonly<{
    state: 'terminal';
    terminal: BrokerControlTerminalOutcome;
}>);
export type BrokerControlDisconnectReason = 'channel-closed' | 'peer-exit' | 'transport-error';
export type BrokerControlTransition = Readonly<{
    session: BrokerControlSession;
    outbound: readonly BrokerControlMessage[];
}>;
export type BrokerControlOpen = Readonly<{
    session: BrokerControlSession;
    hello: BrokerHelloMessage;
}>;
export type BrokerControlCompletion = Readonly<{
    outcome: 'success';
    code: string;
    message: string;
    attemptId?: BrokerAttemptId;
}> | Readonly<{
    outcome: 'failure';
    code: string;
    message: string;
    attemptId?: BrokerAttemptId;
}>;
export declare const openBrokerControlSession: (requestId: BrokerRequestId, sentAtMs: BrokerTimestampMs, buildId: string, capabilities: readonly string[]) => BrokerResult<BrokerControlOpen>;
export declare const handleBrokerControlInput: (session: BrokerControlSession, message: BrokerRequestMessage | BrokerCancelMessage, nowMs: number, responseSentAtMs: BrokerTimestampMs, authority: BrokerControlAuthority) => BrokerResult<BrokerControlTransition>;
export declare const completeBrokerControlSession: (session: BrokerControlSession, completion: BrokerControlCompletion, sentAtMs: BrokerTimestampMs) => BrokerResult<BrokerControlTransition>;
export declare const disconnectBrokerControlSession: (session: BrokerControlSession, reason: BrokerControlDisconnectReason) => BrokerResult<BrokerControlTransition>;
export {};
