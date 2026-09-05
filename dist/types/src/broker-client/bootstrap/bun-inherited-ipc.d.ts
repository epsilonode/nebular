import type { CooperativeBootstrapTransportPort } from './cooperative.ts';
import { type BrokerClientResult } from '../result.ts';
export declare const BROKER_BOOTSTRAP_CHILD_ARGUMENT: "--nebular-bootstrap-child";
export declare const BROKER_BOOTSTRAP_BUILD_ID: "epsilonode-nebular-bootstrap-v1";
export declare const BROKER_BOOTSTRAP_DEFAULT_TIMEOUT_MS = 15000;
export declare const BROKER_BOOTSTRAP_MAX_TIMEOUT_MS = 60000;
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
    spawn: (plan: BunBootstrapIpcSpawnPlan, observer: BunBootstrapIpcObserver) => BrokerClientResult<BunBootstrapIpcPeer>;
}>;
export declare const createBunCooperativeBootstrapTransportPort: (options: BunBootstrapTransportOptions, runtime?: BunBootstrapInheritedIpcRuntime) => CooperativeBootstrapTransportPort;
export declare const createBunBootstrapInheritedIpcRuntime: () => BunBootstrapInheritedIpcRuntime;
