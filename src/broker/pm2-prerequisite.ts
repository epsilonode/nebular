import { createConnection, type Socket } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';

export const PM2_PREREQUISITE_MAX_TIMEOUT_MS = 10_000;

export type Pm2ControlSurface =
  | Readonly<{ kind: 'unconfigured' }>
  | Readonly<{ kind: 'named-pipe'; endpoint: string }>
  | Readonly<{ kind: 'unix-socket'; endpoint: string }>;

export type Pm2PrerequisiteConfig = Readonly<{
  controlSurface: Pm2ControlSurface;
  timeoutMs: number;
}>;

export type Pm2SocketProbeRequest = Readonly<{
  endpointKind: Exclude<Pm2ControlSurface['kind'], 'unconfigured'>;
  endpoint: string;
  timeoutMs: number;
}>;

export type Pm2SocketProbeObservation =
  | Readonly<{ status: 'compatible' }>
  | Readonly<{ status: 'unavailable' }>
  | Readonly<{ status: 'unreachable' }>
  | Readonly<{ status: 'incompatible' }>
  | Readonly<{ status: 'timeout' }>
  | Readonly<{ status: 'reachable-unverified' }>;

export type Pm2PrerequisiteRuntimePort = Readonly<{
  supportsEndpointKind: (kind: Pm2SocketProbeRequest['endpointKind']) => boolean;
  probeSocket: (request: Pm2SocketProbeRequest) => Promise<unknown>;
}>;

export type Pm2PrerequisiteStatus =
  | Readonly<{
      status: 'compatible';
      code: 'pm2-compatible';
      message: 'The host PM2 control surface is protocol-compatible with this runtime.';
    }>
  | Readonly<{
      status: 'unavailable';
      code: 'pm2-unavailable';
      message: 'The host PM2 control surface is not available.';
    }>
  | Readonly<{
      status: 'unreachable';
      code: 'pm2-unreachable';
      message: 'The host PM2 control surface could not be reached.';
    }>
  | Readonly<{
      status: 'incompatible';
      code: 'pm2-incompatible';
      message: 'The configured PM2 control surface is incompatible with this runtime.';
    }>
  | Readonly<{
      status: 'timeout';
      code: 'pm2-timeout';
      message: 'The host PM2 control surface did not respond before the bounded deadline.';
    }>
  | Readonly<{
      status: 'reachable-unverified';
      code: 'pm2-compatibility-unverified';
      message: 'The host PM2 control surface is reachable, but PM2 protocol compatibility is unverified.';
    }>;

const unavailable = (): Pm2PrerequisiteStatus => ({
  status: 'unavailable',
  code: 'pm2-unavailable',
  message: 'The host PM2 control surface is not available.'
});

const compatible = (): Pm2PrerequisiteStatus => ({
  status: 'compatible',
  code: 'pm2-compatible',
  message: 'The host PM2 control surface is protocol-compatible with this runtime.'
});

const unreachable = (): Pm2PrerequisiteStatus => ({
  status: 'unreachable',
  code: 'pm2-unreachable',
  message: 'The host PM2 control surface could not be reached.'
});

const incompatible = (): Pm2PrerequisiteStatus => ({
  status: 'incompatible',
  code: 'pm2-incompatible',
  message: 'The configured PM2 control surface is incompatible with this runtime.'
});

const timeout = (): Pm2PrerequisiteStatus => ({
  status: 'timeout',
  code: 'pm2-timeout',
  message: 'The host PM2 control surface did not respond before the bounded deadline.'
});

const reachableUnverified = (): Pm2PrerequisiteStatus => ({
  status: 'reachable-unverified',
  code: 'pm2-compatibility-unverified',
  message: 'The host PM2 control surface is reachable, but PM2 protocol compatibility is unverified.'
});

const statusFromObservation = (observation: Pm2SocketProbeObservation): Pm2PrerequisiteStatus => {
  switch (observation.status) {
    case 'compatible': return compatible();
    case 'unavailable': return unavailable();
    case 'unreachable': return unreachable();
    case 'incompatible': return incompatible();
    case 'timeout': return timeout();
    case 'reachable-unverified': return reachableUnverified();
  }
};

const decodeObservation = (value: unknown): Pm2SocketProbeObservation => {
  if (typeof value !== 'object' || value === null || !('status' in value)) return { status: 'incompatible' };
  switch (value.status) {
    case 'compatible': return { status: 'compatible' };
    case 'unavailable': return { status: 'unavailable' };
    case 'unreachable': return { status: 'unreachable' };
    case 'incompatible': return { status: 'incompatible' };
    case 'timeout': return { status: 'timeout' };
    case 'reachable-unverified': return { status: 'reachable-unverified' };
    default: return { status: 'incompatible' };
  }
};

const validTimeout = (timeoutMs: number): boolean =>
  Number.isSafeInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= PM2_PREREQUISITE_MAX_TIMEOUT_MS;

const validEndpoint = (surface: Exclude<Pm2ControlSurface, { kind: 'unconfigured' }>): boolean => {
  const endpointValid = surface.endpoint.length > 0 && surface.endpoint.length <= 1_024 && !surface.endpoint.includes('\0');
  return endpointValid && (surface.kind === 'named-pipe'
    ? /^\\\\\.\\pipe\\[^\\]+(?:\\[^\\]+)*$/.test(surface.endpoint)
    : surface.endpoint.startsWith('/'));
};

export const probePm2Prerequisite = async (
  config: Pm2PrerequisiteConfig,
  runtime: Pm2PrerequisiteRuntimePort
): Promise<Pm2PrerequisiteStatus> => {
  if (!validTimeout(config.timeoutMs)) return incompatible();
  if (config.controlSurface.kind === 'unconfigured') return unavailable();
  if (!validEndpoint(config.controlSurface)) return incompatible();
  const request: Pm2SocketProbeRequest = {
    endpointKind: config.controlSurface.kind,
    endpoint: config.controlSurface.endpoint,
    timeoutMs: config.timeoutMs
  };
  const runtimeProbe = Promise.resolve().then(
    () => runtime.supportsEndpointKind(request.endpointKind) === true
      ? runtime.probeSocket(request)
      : ({ status: 'incompatible' } as const)
  ).then(
    decodeObservation,
    () => ({ status: 'unreachable' } as const)
  );
  const cancellation: Readonly<AbortController> = new AbortController();
  const outerDeadline = delay(
    config.timeoutMs,
    { status: 'timeout' } as const,
    { signal: cancellation.signal }
  ).then(
    observation => observation,
    () => ({ status: 'unreachable' } as const)
  );
  return Promise.race([runtimeProbe, outerDeadline]).then(observation => {
    cancellation.abort();
    return statusFromObservation(observation);
  }, () => {
    cancellation.abort();
    return unreachable();
  });
};

const errorCode = (error: unknown): string | undefined =>
  typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
    ? error.code
    : undefined;

const observationFromSocketError = (error: unknown): Pm2SocketProbeObservation => {
  switch (errorCode(error)) {
    case undefined:
      return { status: 'unreachable' };
    case 'ENOENT':
    case 'ENXIO':
      return { status: 'unavailable' };
    case 'ETIMEDOUT':
      return { status: 'timeout' };
    case 'EAFNOSUPPORT':
    case 'EINVAL':
    case 'EPROTONOSUPPORT':
    case 'EPROTOTYPE':
      return { status: 'incompatible' };
    default:
      return { status: 'unreachable' };
  }
};

const probeSocket = (request: Pm2SocketProbeRequest): Promise<Pm2SocketProbeObservation> =>
  new Promise(resolve => {
    const socket: Readonly<Socket> = createConnection({ path: request.endpoint });
    const deadline = setTimeout(() => {
      socket.destroy();
      resolve({ status: 'timeout' });
    }, request.timeoutMs);
    const finish = (observation: Pm2SocketProbeObservation): void => {
      clearTimeout(deadline);
      socket.destroy();
      resolve(observation);
    };
    socket.once('connect', () => finish({ status: 'reachable-unverified' }));
    socket.once('error', (error: unknown) => finish(observationFromSocketError(error)));
  });

export const createSocketPm2PrerequisiteRuntimePort = (
  platform: NodeJS.Platform = process.platform
): Pm2PrerequisiteRuntimePort => ({
  supportsEndpointKind: kind => platform === 'win32' ? kind === 'named-pipe' : kind === 'unix-socket',
  probeSocket: request => Promise.resolve().then(
    () => probeSocket(request),
    observationFromSocketError
  ).then(
    observation => observation,
    observationFromSocketError
  )
});
