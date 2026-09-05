import { type BrokerControlMessage, type BrokerRequestPayload } from './ipc.ts';
import { type BrokerClientProgress, type BrokerClientTerminalOutcome } from './exchange.ts';
import { type BrokerRequestId } from './primitives.ts';
import { type BrokerClientResult, type BrokerClientTaskResult } from './result.ts';
export declare const BROKER_IPC_CHILD_ARGUMENT: "--nebular-ipc-child";
export declare const BROKER_DEFAULT_OPERATION_TIMEOUT_MS = 30000;
export declare const BROKER_MAX_OPERATION_TIMEOUT_MS: number;
export declare const BROKER_DEFAULT_CLEANUP_GRACE_MS = 5000;
export declare const BROKER_MAX_CLEANUP_GRACE_MS = 60000;
export declare const BROKER_INHERITED_IPC_GENERATION = 0;
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
export declare const runBrokerControlOverInheritedIpc: (input: BrokerInheritedIpcRequest, runtime: BrokerInheritedIpcRuntime) => BrokerClientTaskResult<BrokerInheritedIpcReceipt>;
export declare const createBunInheritedIpcRuntime: () => BrokerInheritedIpcRuntime;
