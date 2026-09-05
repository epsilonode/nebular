export declare const PM2_PREREQUISITE_MAX_TIMEOUT_MS = 10000;
export type Pm2ControlSurface = Readonly<{
    kind: 'unconfigured';
}> | Readonly<{
    kind: 'named-pipe';
    endpoint: string;
}> | Readonly<{
    kind: 'unix-socket';
    endpoint: string;
}>;
export type Pm2PrerequisiteConfig = Readonly<{
    controlSurface: Pm2ControlSurface;
    timeoutMs: number;
}>;
export type Pm2SocketProbeRequest = Readonly<{
    endpointKind: Exclude<Pm2ControlSurface['kind'], 'unconfigured'>;
    endpoint: string;
    timeoutMs: number;
}>;
export type Pm2SocketProbeObservation = Readonly<{
    status: 'compatible';
}> | Readonly<{
    status: 'unavailable';
}> | Readonly<{
    status: 'unreachable';
}> | Readonly<{
    status: 'incompatible';
}> | Readonly<{
    status: 'timeout';
}> | Readonly<{
    status: 'reachable-unverified';
}>;
export type Pm2PrerequisiteRuntimePort = Readonly<{
    supportsEndpointKind: (kind: Pm2SocketProbeRequest['endpointKind']) => boolean;
    probeSocket: (request: Pm2SocketProbeRequest) => Promise<unknown>;
}>;
export type Pm2PrerequisiteStatus = Readonly<{
    status: 'compatible';
    code: 'pm2-compatible';
    message: 'The host PM2 control surface is protocol-compatible with this runtime.';
}> | Readonly<{
    status: 'unavailable';
    code: 'pm2-unavailable';
    message: 'The host PM2 control surface is not available.';
}> | Readonly<{
    status: 'unreachable';
    code: 'pm2-unreachable';
    message: 'The host PM2 control surface could not be reached.';
}> | Readonly<{
    status: 'incompatible';
    code: 'pm2-incompatible';
    message: 'The configured PM2 control surface is incompatible with this runtime.';
}> | Readonly<{
    status: 'timeout';
    code: 'pm2-timeout';
    message: 'The host PM2 control surface did not respond before the bounded deadline.';
}> | Readonly<{
    status: 'reachable-unverified';
    code: 'pm2-compatibility-unverified';
    message: 'The host PM2 control surface is reachable, but PM2 protocol compatibility is unverified.';
}>;
export declare const probePm2Prerequisite: (config: Pm2PrerequisiteConfig, runtime: Pm2PrerequisiteRuntimePort) => Promise<Pm2PrerequisiteStatus>;
export declare const createSocketPm2PrerequisiteRuntimePort: (platform?: NodeJS.Platform) => Pm2PrerequisiteRuntimePort;
