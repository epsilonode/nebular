import { createConnection, type Socket } from 'node:net';

import { encodeAmpV1Message } from './amp-v1.ts';
import {
  PM2_MONITOR_MAX_JSON_BYTES,
  projectAndWipePm2MonitorJson,
  projectAndWipePm2SingleProcessJson,
  type Pm2MonitorProjectionFailureCode,
  type Pm2ProjectedProcess
} from './pm2-monitor-projection.ts';
import type { Pm2RpcFailureCode } from './pm2-rpc.ts';
import { brokerTry } from './result.ts';

export const PM2_APPLICATION_MAX_REQUEST_BYTES = 64 * 1_024;
export const PM2_APPLICATION_MAX_FRAME_BYTES = PM2_MONITOR_MAX_JSON_BYTES + 1_024;
export const PM2_APPLICATION_MAX_CORRELATION_BYTES = 128;

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

export type Pm2ApplicationRpcOperation =
  | Readonly<{ method: 'prepare'; config: Pm2ApplicationStartConfig }>
  | Readonly<{ method: 'stopProcessId'; pmId: number; expectedName: string }>
  | Readonly<{ method: 'deleteProcessId'; pmId: number; expectedName: string }>
  | Readonly<{ method: 'getMonitorData'; allowedNames: readonly string[] }>;

export type Pm2ApplicationRpcReply =
  | Readonly<{ method: 'prepare'; process: Pm2ProjectedProcess }>
  | Readonly<{ method: 'stopProcessId'; process: Pm2ProjectedProcess }>
  | Readonly<{ method: 'deleteProcessId'; process: Pm2ProjectedProcess }>
  | Readonly<{ method: 'getMonitorData'; processes: readonly Pm2ProjectedProcess[] }>;

export type Pm2ApplicationRpcFailureCode = Pm2RpcFailureCode | 'pm2-rpc-rejected';

export type Pm2ApplicationRpcResult<T> =
  | Readonly<{ outcome: 'success'; value: T }>
  | Readonly<{ outcome: 'failure'; code: Pm2ApplicationRpcFailureCode }>;

export type Pm2ApplicationRpcRequest = Readonly<{
  endpoint: string;
  timeoutMs: number;
  operation: Pm2ApplicationRpcOperation;
}>;

export type Pm2ApplicationRpcClientPort = Readonly<{
  execute: (request: Pm2ApplicationRpcRequest) => Promise<Pm2ApplicationRpcResult<Pm2ApplicationRpcReply>>;
}>;

export type Pm2ApplicationPrepareOperation = Extract<
  Pm2ApplicationRpcOperation,
  Readonly<{ method: 'prepare' }>
>;

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
  dispatchPrepare: (
    request: Pm2ApplicationPrepareDispatchRequest
  ) => Promise<Pm2ApplicationRpcResult<void>>;
}>;

export type Pm2ApplicationRpcPort = Pm2ApplicationRpcClientPort & Pm2ApplicationPrepareDispatchPort;

export type Pm2EncodedApplicationRequest = Readonly<{
  operation: Pm2ApplicationRpcOperation;
  correlationId: string;
  bytes: Uint8Array;
}>;

type ByteRange = Readonly<{ start: number; end: number }>;

type FrameInspection =
  | Readonly<{ outcome: 'waiting' }>
  | Readonly<{ outcome: 'failure'; code: Pm2ApplicationRpcFailureCode }>
  | Readonly<{ outcome: 'complete'; body: ByteRange; correlation: ByteRange }>;

type SensitiveAccumulator = {
  buffer: Uint8Array;
};

const success = <T>(value: T): Pm2ApplicationRpcResult<T> => ({ outcome: 'success', value });
const failure = <T = never>(code: Pm2ApplicationRpcFailureCode): Pm2ApplicationRpcResult<T> => ({
  outcome: 'failure',
  code
});

const correlationFor = (operation: Pm2ApplicationRpcOperation): string =>
  `nebular-pm2-${operation.method}-v1`;

const operationArgument = (operation: Pm2ApplicationRpcOperation): unknown => {
  switch (operation.method) {
    case 'prepare': return operation.config;
    case 'stopProcessId': return operation.pmId;
    case 'deleteProcessId': return operation.pmId;
    case 'getMonitorData': return {};
  }
};

export const encodePm2ApplicationRpcRequest = (
  operation: Pm2ApplicationRpcOperation
): Pm2ApplicationRpcResult<Pm2EncodedApplicationRequest> => {
  const encodedJson = brokerTry(
    () => JSON.stringify({ type: 'call', method: operation.method, args: [operationArgument(operation)] }),
    { code: 'ipc-invalid', message: 'PM2 application request encoding failed.' }
  );
  if (encodedJson.isErr() || encodedJson.value.length === 0 ||
      new TextEncoder().encode(encodedJson.value).byteLength > PM2_APPLICATION_MAX_REQUEST_BYTES) {
    return failure('pm2-rpc-oversize');
  }
  const correlationId = correlationFor(operation);
  const frame = encodeAmpV1Message([
    new TextEncoder().encode(`j:${encodedJson.value}`),
    new TextEncoder().encode(`s:${correlationId}`)
  ]);
  return frame.outcome === 'failure'
    ? failure(frame.code === 'amp-oversize' ? 'pm2-rpc-oversize' : 'pm2-rpc-malformed')
    : success({ operation, correlationId, bytes: Uint8Array.from(frame.value) });
};

const uint32At = (bytes: Readonly<Uint8Array>, offset: number): number | undefined => {
  const first = bytes.at(offset);
  const second = bytes.at(offset + 1);
  const third = bytes.at(offset + 2);
  const fourth = bytes.at(offset + 3);
  return first === undefined || second === undefined || third === undefined || fourth === undefined
    ? undefined
    : first * 0x1_00_00_00 + second * 0x1_00_00 + third * 0x1_00 + fourth;
};

const inspectFrame = (bytes: Readonly<Uint8Array>): FrameInspection => {
  if (bytes.byteLength > PM2_APPLICATION_MAX_FRAME_BYTES) {
    return { outcome: 'failure', code: 'pm2-rpc-oversize' };
  }
  const metadata = bytes.at(0);
  if (metadata === undefined) return { outcome: 'waiting' };
  if (metadata !== 0x12) return { outcome: 'failure', code: 'pm2-rpc-malformed' };
  const bodyLength = uint32At(bytes, 1);
  if (bodyLength === undefined) return { outcome: 'waiting' };
  if (bodyLength < 2 || bodyLength > PM2_MONITOR_MAX_JSON_BYTES + 2) {
    return { outcome: 'failure', code: 'pm2-rpc-oversize' };
  }
  const body = { start: 5, end: 5 + bodyLength };
  const correlationLength = uint32At(bytes, body.end);
  if (correlationLength === undefined) return { outcome: 'waiting' };
  if (correlationLength < 2 || correlationLength > PM2_APPLICATION_MAX_CORRELATION_BYTES) {
    return { outcome: 'failure', code: 'pm2-rpc-oversize' };
  }
  const correlation = { start: body.end + 4, end: body.end + 4 + correlationLength };
  if (correlation.end > PM2_APPLICATION_MAX_FRAME_BYTES) {
    return { outcome: 'failure', code: 'pm2-rpc-oversize' };
  }
  if (bytes.byteLength < correlation.end) return { outcome: 'waiting' };
  return bytes.byteLength === correlation.end
    ? { outcome: 'complete', body, correlation }
    : { outcome: 'failure', code: 'pm2-rpc-trailing-data' };
};

const packedPrefix = (bytes: Readonly<Uint8Array>, range: ByteRange, first: number): boolean =>
  bytes.at(range.start) === first && bytes.at(range.start + 1) === 0x3a;

const equalCorrelation = (
  bytes: Readonly<Uint8Array>,
  range: ByteRange,
  expected: string
): boolean => {
  if (!packedPrefix(bytes, range, 0x73)) return false;
  const expectedBytes = new TextEncoder().encode(expected);
  return range.end - range.start - 2 === expectedBytes.byteLength && expectedBytes.every(
    (byte, index) => bytes.at(range.start + 2 + index) === byte
  );
};

const projectionFailureCode = (code: Pm2MonitorProjectionFailureCode): Pm2ApplicationRpcFailureCode => {
  switch (code) {
    case 'pm2-monitor-oversize': return 'pm2-rpc-oversize';
    case 'pm2-monitor-rpc-error': return 'pm2-rpc-rejected';
    case 'pm2-monitor-malformed': return 'pm2-rpc-malformed';
  }
};

const decodeApplicationBody = (
  frame: Uint8Array,
  body: ByteRange,
  operation: Pm2ApplicationRpcOperation
): Pm2ApplicationRpcResult<Pm2ApplicationRpcReply> => {
  if (!packedPrefix(frame, body, 0x6a)) return failure('pm2-rpc-malformed');
  const json = frame.subarray(body.start + 2, body.end);
  if (operation.method === 'getMonitorData' || operation.method === 'prepare') {
    const projected = projectAndWipePm2MonitorJson(
      json,
      operation.method === 'prepare' ? [operation.config.name] : operation.allowedNames
    );
    if (projected.outcome === 'failure') return failure(projectionFailureCode(projected.code));
    if (operation.method === 'prepare') {
      const process = projected.value.processes.at(0);
      return process !== undefined && projected.value.processes.length === 1
        ? success({ method: 'prepare', process })
        : failure('pm2-rpc-malformed');
    }
    return success({ method: 'getMonitorData', processes: projected.value.processes });
  }
  const projected = projectAndWipePm2SingleProcessJson(json, operation.expectedName);
  if (projected.outcome === 'failure') return failure(projectionFailureCode(projected.code));
  switch (operation.method) {
    case 'stopProcessId': return success({ method: 'stopProcessId', process: projected.value });
    case 'deleteProcessId': return success({ method: 'deleteProcessId', process: projected.value });
  }
};

const decodeWithoutWipe = (
  encoded: Pm2EncodedApplicationRequest,
  frame: Uint8Array
): Pm2ApplicationRpcResult<Pm2ApplicationRpcReply> => {
  const inspected = inspectFrame(frame);
  if (inspected.outcome === 'waiting') return failure('pm2-rpc-malformed');
  if (inspected.outcome === 'failure') return inspected;
  if (!equalCorrelation(frame, inspected.correlation, encoded.correlationId)) {
    return failure('pm2-rpc-correlation-mismatch');
  }
  return decodeApplicationBody(frame, inspected.body, encoded.operation);
};

export const decodeAndWipePm2ApplicationFrame = (
  encoded: Pm2EncodedApplicationRequest,
  frame: Uint8Array
): Pm2ApplicationRpcResult<Pm2ApplicationRpcReply> => {
  const decoded = brokerTry(
    () => decodeWithoutWipe(encoded, frame),
    { code: 'ipc-invalid', message: 'PM2 application response decoding failed.' }
  );
  frame.fill(0);
  return decoded.isOk() ? decoded.value : failure('pm2-rpc-malformed');
};

const errorCode = (error: unknown): string | undefined =>
  typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
    ? error.code
    : undefined;

const socketFailure = (error: unknown): Pm2ApplicationRpcResult<never> => {
  switch (errorCode(error)) {
    case 'ENOENT':
    case 'ENXIO': return failure('pm2-rpc-unavailable');
    case 'ETIMEDOUT': return failure('pm2-rpc-timeout');
    case undefined:
    default: return failure('pm2-rpc-unreachable');
  }
};

const wipeAccumulator = (accumulator: SensitiveAccumulator): void => {
  accumulator.buffer.fill(0);
};

const appendSensitive = (accumulator: SensitiveAccumulator, chunk: Uint8Array): boolean => {
  if (accumulator.buffer.byteLength + chunk.byteLength > PM2_APPLICATION_MAX_FRAME_BYTES) {
    accumulator.buffer.fill(0);
    chunk.fill(0);
    return false;
  }
  const next = new Uint8Array(accumulator.buffer.byteLength + chunk.byteLength);
  next.set(accumulator.buffer, 0);
  next.set(chunk, accumulator.buffer.byteLength);
  accumulator.buffer.fill(0);
  chunk.fill(0);
  accumulator.buffer = next;
  return true;
};

const socketRequest = (
  input: Pm2ApplicationRpcRequest,
  encoded: Pm2EncodedApplicationRequest,
  onDispatch: (outcome: Pm2ApplicationRpcResult<void>) => void = () => undefined
): Promise<Pm2ApplicationRpcResult<Pm2ApplicationRpcReply>> => new Promise(resolve => {
  const socket: Readonly<Socket> = createConnection({ path: input.endpoint });
  const accumulator: SensitiveAccumulator = { buffer: new Uint8Array() };
  const settleDispatch = (outcome: Pm2ApplicationRpcResult<void>): void => onDispatch(outcome);
  const finish = (outcome: Pm2ApplicationRpcResult<Pm2ApplicationRpcReply>): void => {
    settleDispatch(outcome.outcome === 'success' ? success(undefined) : failure(outcome.code));
    wipeAccumulator(accumulator);
    encoded.bytes.fill(0);
    socket.destroy();
    resolve(outcome);
  };
  const deadline = setTimeout(() => finish(failure('pm2-rpc-timeout')), input.timeoutMs);
  const finishBounded = (outcome: Pm2ApplicationRpcResult<Pm2ApplicationRpcReply>): void => {
    clearTimeout(deadline);
    finish(outcome);
  };
  socket.once('error', (error: unknown) => finishBounded(socketFailure(error)));
  socket.once('connect', () => {
    socket.once('end', () => finishBounded(failure('pm2-rpc-malformed')));
    socket.once('close', () => finishBounded(failure('pm2-rpc-malformed')));
    socket.on('data', (chunk: Buffer) => {
      if (!appendSensitive(accumulator, chunk)) {
        finishBounded(failure('pm2-rpc-oversize'));
        return;
      }
      const inspected = inspectFrame(accumulator.buffer);
      if (inspected.outcome === 'failure') finishBounded(failure(inspected.code));
      else if (inspected.outcome === 'complete') {
        finishBounded(decodeAndWipePm2ApplicationFrame(encoded, accumulator.buffer));
      }
    });
    const written = brokerTry(
      () => socket.write(encoded.bytes, () => {
        encoded.bytes.fill(0);
        settleDispatch(success(undefined));
      }),
      { code: 'ipc-disconnected', message: 'PM2 application request write failed.' }
    );
    if (written.isErr()) finishBounded(failure('pm2-rpc-unreachable'));
  });
});

const dispatchRequest = (
  input: Pm2ApplicationPrepareDispatchRequest,
  encoded: Pm2EncodedApplicationRequest
): Promise<Pm2ApplicationRpcResult<void>> => new Promise(resolve => {
  const response = socketRequest(input, encoded, resolve);
  void response.then(
    () => undefined,
    () => undefined
  );
});

export const createNodeNetPm2ApplicationRpcClient = (): Pm2ApplicationRpcPort => ({
  execute: input => {
    const encoded = encodePm2ApplicationRpcRequest(input.operation);
    if (encoded.outcome === 'failure') return Promise.resolve(encoded);
    return Promise.resolve().then(
      () => socketRequest(input, encoded.value),
      () => failure('pm2-rpc-unreachable')
    ).then(
      outcome => outcome,
      () => failure('pm2-rpc-unreachable')
    );
  },
  dispatchPrepare: input => {
    const encoded = encodePm2ApplicationRpcRequest(input.operation);
    if (encoded.outcome === 'failure') return Promise.resolve(encoded);
    return Promise.resolve().then(
      () => dispatchRequest(input, encoded.value),
      () => failure('pm2-rpc-unreachable')
    ).then(
      outcome => outcome,
      () => failure('pm2-rpc-unreachable')
    );
  }
});
