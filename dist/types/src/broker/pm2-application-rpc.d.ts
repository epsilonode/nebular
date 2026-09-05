import { type Pm2ProjectedProcess } from './pm2-monitor-projection.ts';
import type { Pm2RpcFailureCode } from './pm2-rpc.ts';
export declare const PM2_APPLICATION_MAX_REQUEST_BYTES: number;
export declare const PM2_APPLICATION_MAX_FRAME_BYTES: number;
export declare const PM2_APPLICATION_MAX_CORRELATION_BYTES = 128;
export type Pm2ApplicationStartConfig = Readonly<{
    name: string;
    namespace: string;
    pm_exec_path: string;
    pm_cwd: string;
    args: readonly string[];
    exec_mode: 'fork_mode';
    exec_interpreter: 'none';
    env: Readonly<Record<string, string>>;
    autorestart: false;
    autostart: true;
    treekill: true;
    windowsHide: true;
    merge_logs: true;
    pm_out_log_path: string;
    pm_err_log_path: string;
    pm_pid_path: string;
    vizion: false;
    watch: false;
    kill_retry_time: number;
}>;
export type Pm2ApplicationRpcOperation = Readonly<{
    method: 'prepare';
    config: Pm2ApplicationStartConfig;
}> | Readonly<{
    method: 'stopProcessId';
    pmId: number;
    expectedName: string;
}> | Readonly<{
    method: 'deleteProcessId';
    pmId: number;
    expectedName: string;
}> | Readonly<{
    method: 'getMonitorData';
    allowedNames: readonly string[];
}>;
export type Pm2ApplicationRpcReply = Readonly<{
    method: 'prepare';
    process: Pm2ProjectedProcess;
}> | Readonly<{
    method: 'stopProcessId';
    process: Pm2ProjectedProcess;
}> | Readonly<{
    method: 'deleteProcessId';
    process: Pm2ProjectedProcess;
}> | Readonly<{
    method: 'getMonitorData';
    processes: readonly Pm2ProjectedProcess[];
}>;
export type Pm2ApplicationRpcFailureCode = Pm2RpcFailureCode | 'pm2-rpc-rejected';
export type Pm2ApplicationRpcResult<T> = Readonly<{
    outcome: 'success';
    value: T;
}> | Readonly<{
    outcome: 'failure';
    code: Pm2ApplicationRpcFailureCode;
}>;
export type Pm2ApplicationRpcRequest = Readonly<{
    endpoint: string;
    timeoutMs: number;
    operation: Pm2ApplicationRpcOperation;
}>;
export type Pm2ApplicationRpcClientPort = Readonly<{
    execute: (request: Pm2ApplicationRpcRequest) => Promise<Pm2ApplicationRpcResult<Pm2ApplicationRpcReply>>;
}>;
export type Pm2ApplicationPrepareOperation = Extract<Pm2ApplicationRpcOperation, Readonly<{
    method: 'prepare';
}>>;
export type Pm2ApplicationPrepareDispatchRequest = Readonly<{
    endpoint: string;
    timeoutMs: number;
    operation: Pm2ApplicationPrepareOperation;
}>;
/**
 * Dispatch acknowledgement is intentionally separate from PM2's eventual
 * prepare response. Exact-name observation remains the authoritative launch
 * confirmation, so a cooperatively bootstrapping child cannot deadlock while
 * PM2 holds its prepare callback open.
 */
export type Pm2ApplicationPrepareDispatchPort = Readonly<{
    dispatchPrepare: (request: Pm2ApplicationPrepareDispatchRequest) => Promise<Pm2ApplicationRpcResult<void>>;
}>;
export type Pm2ApplicationRpcPort = Pm2ApplicationRpcClientPort & Pm2ApplicationPrepareDispatchPort;
export type Pm2EncodedApplicationRequest = Readonly<{
    operation: Pm2ApplicationRpcOperation;
    correlationId: string;
    bytes: Uint8Array;
}>;
export declare const encodePm2ApplicationRpcRequest: (operation: Pm2ApplicationRpcOperation) => Pm2ApplicationRpcResult<Pm2EncodedApplicationRequest>;
export declare const decodeAndWipePm2ApplicationFrame: (encoded: Pm2EncodedApplicationRequest, frame: Uint8Array) => Pm2ApplicationRpcResult<Pm2ApplicationRpcReply>;
export declare const createNodeNetPm2ApplicationRpcClient: () => Pm2ApplicationRpcPort;
