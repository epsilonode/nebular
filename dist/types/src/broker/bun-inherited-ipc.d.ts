import { type BrokerControlMessage, type BrokerRequestId } from '../broker-client/public.ts';
export { BROKER_IPC_CHILD_ARGUMENT, type BrokerRequestId } from '../broker-client/public.ts';
import { type BrokerOperationPort } from './operation.ts';
import { type BrokerResult } from './result.ts';
export declare const BROKER_BUILD_ID: "epsilonode-nebular-v1";
export declare const BROKER_CHILD_REQUEST_TIMEOUT_MS = 10000;
export declare const BROKER_CHILD_MAX_REQUEST_TIMEOUT_MS = 60000;
export type BrokerIpcSubscription = Readonly<{
    dispose: () => void;
}>;
export type BrokerIpcDeadline = Readonly<{
    cancel: () => void;
}>;
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
export declare const runBrokerInheritedIpcChild: (input: BrokerInheritedIpcChildInput, runtime: BrokerInheritedIpcChildRuntime, operations?: BrokerOperationPort) => Promise<BrokerResult<void>>;
export declare const createBunInheritedIpcChildRuntime: () => BrokerInheritedIpcChildRuntime;
export declare const brokerIpcChildRequestId: (argv: readonly string[]) => BrokerResult<BrokerRequestId | undefined>;
