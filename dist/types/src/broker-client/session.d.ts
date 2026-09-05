import type { BrokerControlMessage } from './ipc.ts';
import { type BrokerRequestId, type BrokerSequence } from './primitives.ts';
import { type BrokerClientResult } from './result.ts';
export type BrokerClientSession = Readonly<{
    state: 'awaiting-hello';
    requestId: BrokerRequestId;
    nextSequence: BrokerSequence;
}> | Readonly<{
    state: 'ready';
    requestId: BrokerRequestId;
    nextSequence: BrokerSequence;
}> | Readonly<{
    state: 'active';
    requestId: BrokerRequestId;
    nextSequence: BrokerSequence;
}> | Readonly<{
    state: 'terminal';
    requestId: BrokerRequestId;
    nextSequence: BrokerSequence;
    succeeded: boolean;
}>;
export declare const reduceBrokerClientSession: (session: BrokerClientSession, message: BrokerControlMessage) => BrokerClientResult<BrokerClientSession>;
