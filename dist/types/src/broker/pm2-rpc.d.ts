import { type AmpV1StreamState } from './amp-v1.ts';
import type { Pm2PrerequisiteRuntimePort } from './pm2-prerequisite.ts';
export declare const PM2_WINDOWS_RPC_PIPE = "\\\\.\\pipe\\rpc.sock";
export declare const PM2_REQUIRED_RECEIVER_METHODS: readonly ["prepare", "getMonitorData", "stopProcessId", "deleteProcessId"];
export declare const PM2_ADMITTED_VERSIONS: readonly ["5.4.3"];
export declare const PM2_RPC_MAX_METHODS = 512;
export declare const PM2_RPC_MAX_METHOD_NAME_BYTES = 128;
export declare const PM2_RPC_MAX_PARAMETERS = 64;
export declare const PM2_RPC_MAX_PARAMETER_BYTES = 128;
export declare const PM2_RPC_MAX_JSON_BYTES: number;
export type Pm2ReadOnlyRequestKind = 'methods' | 'getVersion';
export type Pm2RpcFailureCode = 'pm2-rpc-correlation-mismatch' | 'pm2-rpc-malformed' | 'pm2-rpc-oversize' | 'pm2-rpc-timeout' | 'pm2-rpc-trailing-data' | 'pm2-rpc-unavailable' | 'pm2-rpc-unreachable';
export type Pm2RpcResult<T> = Readonly<{
    outcome: 'success';
    value: T;
}> | Readonly<{
    outcome: 'failure';
    code: Pm2RpcFailureCode;
}>;
export type Pm2EncodedReadOnlyRequest = Readonly<{
    kind: Pm2ReadOnlyRequestKind;
    correlationId: string;
    bytes: Readonly<Uint8Array>;
}>;
export type Pm2MethodsCompatibility = Readonly<{
    status: 'required-methods-present' | 'missing-required-methods';
}>;
export type Pm2VersionCompatibility = Readonly<{
    status: 'admitted-version' | 'unsupported-version';
}>;
export type Pm2ReadOnlyReply = Readonly<{
    kind: 'methods';
    compatibility: Pm2MethodsCompatibility;
}> | Readonly<{
    kind: 'getVersion';
    compatibility: Pm2VersionCompatibility;
}>;
export type Pm2ReplyDecoderState = Readonly<{
    amp: AmpV1StreamState;
}>;
export type Pm2ReplyDecodeStep = Readonly<{
    outcome: 'waiting';
    state: Pm2ReplyDecoderState;
}> | Readonly<{
    outcome: 'complete';
    reply: Pm2ReadOnlyReply;
}> | Readonly<{
    outcome: 'failure';
    code: Pm2RpcFailureCode;
}>;
export type Pm2ReadOnlyRpcRequest = Readonly<{
    endpoint: string;
    timeoutMs: number;
    request: Pm2EncodedReadOnlyRequest;
}>;
export type Pm2ReadOnlyRpcClientPort = Readonly<{
    request: (request: Pm2ReadOnlyRpcRequest) => Promise<Pm2RpcResult<Pm2ReadOnlyReply>>;
}>;
export declare const encodePm2ReadOnlyRequest: (kind: Pm2ReadOnlyRequestKind) => Pm2RpcResult<Pm2EncodedReadOnlyRequest>;
export declare const decodePm2MethodsCompatibility: (value: unknown) => Pm2RpcResult<Pm2MethodsCompatibility>;
export declare const decodePm2VersionCompatibility: (value: unknown) => Pm2RpcResult<Pm2VersionCompatibility>;
export declare const createPm2ReplyDecoderState: () => Pm2ReplyDecoderState;
export declare const decodePm2ReadOnlyReplyChunk: (state: Pm2ReplyDecoderState, chunk: Readonly<Uint8Array>, request: Pm2EncodedReadOnlyRequest) => Pm2ReplyDecodeStep;
export declare const createNodeNetPm2ReadOnlyRpcClient: () => Pm2ReadOnlyRpcClientPort;
export declare const createPm2ProtocolCompatibilityRuntimePort: (platform?: NodeJS.Platform, client?: Pm2ReadOnlyRpcClientPort) => Pm2PrerequisiteRuntimePort;
