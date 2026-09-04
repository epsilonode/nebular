import { createConnection, type Socket } from 'node:net';

import {
  decodeAmpV1Chunk,
  emptyAmpV1StreamState,
  encodeAmpV1Message,
  type AmpV1FailureCode,
  type AmpV1Message,
  type AmpV1StreamState
} from './amp-v1.ts';
import type {
  Pm2PrerequisiteRuntimePort,
  Pm2SocketProbeObservation,
  Pm2SocketProbeRequest
} from './pm2-prerequisite.ts';
import { brokerTry } from './result.ts';

export const PM2_WINDOWS_RPC_PIPE = '\\\\.\\pipe\\rpc.sock';
export const PM2_REQUIRED_RECEIVER_METHODS = [
  'prepare',
  'getMonitorData',
  'stopProcessId',
  'deleteProcessId'
] as const;
export const PM2_ADMITTED_VERSIONS = ['5.4.3'] as const;
export const PM2_RPC_MAX_METHODS = 512;
export const PM2_RPC_MAX_METHOD_NAME_BYTES = 128;
export const PM2_RPC_MAX_PARAMETERS = 64;
export const PM2_RPC_MAX_PARAMETER_BYTES = 128;
export const PM2_RPC_MAX_JSON_BYTES = 256 * 1_024;

export type Pm2ReadOnlyRequestKind = 'methods' | 'getVersion';

export type Pm2RpcFailureCode =
  | 'pm2-rpc-correlation-mismatch'
  | 'pm2-rpc-malformed'
  | 'pm2-rpc-oversize'
  | 'pm2-rpc-timeout'
  | 'pm2-rpc-trailing-data'
  | 'pm2-rpc-unavailable'
  | 'pm2-rpc-unreachable';

export type Pm2RpcResult<T> =
  | Readonly<{ outcome: 'success'; value: T }>
  | Readonly<{ outcome: 'failure'; code: Pm2RpcFailureCode }>;

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

export type Pm2ReadOnlyReply =
  | Readonly<{ kind: 'methods'; compatibility: Pm2MethodsCompatibility }>
  | Readonly<{ kind: 'getVersion'; compatibility: Pm2VersionCompatibility }>;

export type Pm2ReplyDecoderState = Readonly<{
  amp: AmpV1StreamState;
}>;

export type Pm2ReplyDecodeStep =
  | Readonly<{ outcome: 'waiting'; state: Pm2ReplyDecoderState }>
  | Readonly<{ outcome: 'complete'; reply: Pm2ReadOnlyReply }>
  | Readonly<{ outcome: 'failure'; code: Pm2RpcFailureCode }>;

export type Pm2ReadOnlyRpcRequest = Readonly<{
  endpoint: string;
  timeoutMs: number;
  request: Pm2EncodedReadOnlyRequest;
}>;

export type Pm2ReadOnlyRpcClientPort = Readonly<{
  request: (request: Pm2ReadOnlyRpcRequest) => Promise<Pm2RpcResult<Pm2ReadOnlyReply>>;
}>;

const success = <T>(value: T): Pm2RpcResult<T> => ({ outcome: 'success', value });
const failure = <T = never>(code: Pm2RpcFailureCode): Pm2RpcResult<T> => ({ outcome: 'failure', code });

const ampFailure = (code: AmpV1FailureCode): Pm2RpcFailureCode =>
  code === 'amp-oversize' ? 'pm2-rpc-oversize' : 'pm2-rpc-malformed';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const equalBytes = (left: Readonly<Uint8Array>, right: Readonly<Uint8Array>): boolean =>
  left.byteLength === right.byteLength && left.every((byte, index) => right.at(index) === byte);

const decodeCanonicalUtf8 = (bytes: Readonly<Uint8Array>): Pm2RpcResult<string> => {
  if (bytes.byteLength > PM2_RPC_MAX_JSON_BYTES) return failure('pm2-rpc-oversize');
  const text = textDecoder.decode(Uint8Array.from(bytes));
  const canonical: Readonly<Uint8Array> = textEncoder.encode(text);
  return equalBytes(bytes, canonical) && !text.includes('\0')
    ? success(text)
    : failure('pm2-rpc-malformed');
};

const decodePackedText = (
  bytes: Readonly<Uint8Array>,
  prefix: 'j:' | 's:'
): Pm2RpcResult<string> => {
  const decoded = decodeCanonicalUtf8(bytes);
  if (decoded.outcome === 'failure') return decoded;
  return decoded.value.startsWith(prefix)
    ? success(decoded.value.slice(prefix.length))
    : failure('pm2-rpc-malformed');
};

const requestJson = (kind: Pm2ReadOnlyRequestKind): string => kind === 'methods'
  ? '{"type":"methods"}'
  : '{"type":"call","method":"getVersion","args":[{}]}';

const correlationFor = (kind: Pm2ReadOnlyRequestKind): string =>
  kind === 'methods' ? 'nebular-pm2-methods-v1' : 'nebular-pm2-version-v1';

export const encodePm2ReadOnlyRequest = (
  kind: Pm2ReadOnlyRequestKind
): Pm2RpcResult<Pm2EncodedReadOnlyRequest> => {
  const correlationId = correlationFor(kind);
  const frame = encodeAmpV1Message([
    textEncoder.encode(`j:${requestJson(kind)}`),
    textEncoder.encode(`s:${correlationId}`)
  ]);
  return frame.outcome === 'failure'
    ? failure(ampFailure(frame.code))
    : success({ kind, correlationId, bytes: Uint8Array.from(frame.value) });
};

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const boundedText = (value: unknown, maximumLength: number): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= maximumLength && !value.includes('\0');

const validParameterList = (value: unknown): boolean => Array.isArray(value) &&
  value.length <= PM2_RPC_MAX_PARAMETERS &&
  value.every(parameter => boundedText(parameter, PM2_RPC_MAX_PARAMETER_BYTES));

const validMethodDescriptor = (name: string, value: unknown): boolean =>
  isRecord(value) && value['name'] === name && validParameterList(value['params']);

export const decodePm2MethodsCompatibility = (value: unknown): Pm2RpcResult<Pm2MethodsCompatibility> => {
  if (!isRecord(value) || !isRecord(value['methods'])) return failure('pm2-rpc-malformed');
  const entries: readonly (readonly [string, unknown])[] = Object.entries(value['methods']);
  if (entries.length === 0 || entries.length > PM2_RPC_MAX_METHODS || entries.some(entry =>
    !boundedText(entry[0], PM2_RPC_MAX_METHOD_NAME_BYTES) || !validMethodDescriptor(entry[0], entry[1])
  )) return failure('pm2-rpc-malformed');
  return success({
    status: PM2_REQUIRED_RECEIVER_METHODS.every(method => entries.some(entry => entry[0] === method))
      ? 'required-methods-present'
      : 'missing-required-methods'
  });
};

const validSemver = (value: string): boolean =>
  /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u.test(value);

export const decodePm2VersionCompatibility = (value: unknown): Pm2RpcResult<Pm2VersionCompatibility> => {
  if (!isRecord(value)) return failure('pm2-rpc-malformed');
  const arguments_: unknown = value['args'];
  if (!Array.isArray(arguments_) || arguments_.length !== 1) return failure('pm2-rpc-malformed');
  const version: unknown = arguments_.at(0);
  if (!boundedText(version, 64) || !validSemver(version)) return failure('pm2-rpc-malformed');
  return success({ status: PM2_ADMITTED_VERSIONS.some(admitted => admitted === version)
    ? 'admitted-version'
    : 'unsupported-version' });
};

const parseJson = (source: string): Pm2RpcResult<unknown> => {
  const parsed = brokerTry<unknown>(
    () => JSON.parse(source) as unknown,
    { code: 'ipc-invalid', message: 'PM2 returned malformed JSON.' }
  );
  return parsed.isOk() ? success(parsed.value) : failure('pm2-rpc-malformed');
};

const decodeMessage = (
  message: AmpV1Message,
  request: Pm2EncodedReadOnlyRequest
): Pm2RpcResult<Pm2ReadOnlyReply> => {
  if (message.arguments.length !== 2) return failure('pm2-rpc-malformed');
  const bodyBytes = message.arguments.at(0);
  const correlationBytes = message.arguments.at(1);
  if (bodyBytes === undefined || correlationBytes === undefined) return failure('pm2-rpc-malformed');
  const correlation = decodePackedText(correlationBytes, 's:');
  if (correlation.outcome === 'failure') return correlation;
  if (correlation.value !== request.correlationId) return failure('pm2-rpc-correlation-mismatch');
  const body = decodePackedText(bodyBytes, 'j:');
  if (body.outcome === 'failure') return body;
  const parsed = parseJson(body.value);
  if (parsed.outcome === 'failure') return parsed;
  if (request.kind === 'methods') {
    const compatibility = decodePm2MethodsCompatibility(parsed.value);
    return compatibility.outcome === 'failure'
      ? compatibility
      : success({ kind: 'methods', compatibility: compatibility.value });
  }
  const compatibility = decodePm2VersionCompatibility(parsed.value);
  return compatibility.outcome === 'failure'
    ? compatibility
    : success({ kind: 'getVersion', compatibility: compatibility.value });
};

export const createPm2ReplyDecoderState = (): Pm2ReplyDecoderState => ({
  amp: emptyAmpV1StreamState()
});

export const decodePm2ReadOnlyReplyChunk = (
  state: Pm2ReplyDecoderState,
  chunk: Readonly<Uint8Array>,
  request: Pm2EncodedReadOnlyRequest
): Pm2ReplyDecodeStep => {
  const decoded = decodeAmpV1Chunk(state.amp, chunk);
  if (decoded.outcome === 'failure') return { outcome: 'failure', code: ampFailure(decoded.code) };
  if (decoded.value.messages.length === 0) {
    return { outcome: 'waiting', state: { amp: decoded.value.state } };
  }
  if (decoded.value.messages.length !== 1 || decoded.value.state.pending.byteLength !== 0) {
    return { outcome: 'failure', code: 'pm2-rpc-trailing-data' };
  }
  const message = decoded.value.messages[0];
  if (message === undefined) return { outcome: 'failure', code: 'pm2-rpc-malformed' };
  const reply = decodeMessage(message, request);
  return reply.outcome === 'failure'
    ? reply
    : { outcome: 'complete', reply: reply.value };
};

const errorCode = (error: unknown): string | undefined =>
  typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
    ? error.code
    : undefined;

const socketFailure = (error: unknown): Pm2RpcResult<never> => {
  switch (errorCode(error)) {
    case undefined:
      return failure('pm2-rpc-unreachable');
    case 'ENOENT':
    case 'ENXIO':
      return failure('pm2-rpc-unavailable');
    case 'ETIMEDOUT':
      return failure('pm2-rpc-timeout');
    default:
      return failure('pm2-rpc-unreachable');
  }
};

const receiveReply = (
  socket: Readonly<Socket>,
  state: Pm2ReplyDecoderState,
  request: Pm2EncodedReadOnlyRequest,
  finish: (result: Pm2RpcResult<Pm2ReadOnlyReply>) => void
): void => {
  socket.once('data', (chunk: Readonly<Uint8Array>) => {
    const decoded = decodePm2ReadOnlyReplyChunk(state, chunk, request);
    if (decoded.outcome === 'waiting') receiveReply(socket, decoded.state, request, finish);
    else if (decoded.outcome === 'complete') finish(success(decoded.reply));
    else finish(failure(decoded.code));
  });
};

const socketRequest = (input: Pm2ReadOnlyRpcRequest): Promise<Pm2RpcResult<Pm2ReadOnlyReply>> =>
  new Promise(resolve => {
    const socket: Readonly<Socket> = createConnection({ path: input.endpoint });
    const deadline = setTimeout(() => {
      socket.destroy();
      resolve(failure('pm2-rpc-timeout'));
    }, input.timeoutMs);
    const finish = (result: Pm2RpcResult<Pm2ReadOnlyReply>): void => {
      clearTimeout(deadline);
      socket.destroy();
      resolve(result);
    };
    socket.once('error', (error: unknown) => finish(socketFailure(error)));
    socket.once('connect', () => {
      socket.once('end', () => finish(failure('pm2-rpc-malformed')));
      socket.once('close', () => finish(failure('pm2-rpc-malformed')));
      receiveReply(socket, createPm2ReplyDecoderState(), input.request, finish);
      const written = brokerTry(
        () => socket.write(Uint8Array.from(input.request.bytes)),
        { code: 'ipc-disconnected', message: 'PM2 request write failed.' }
      );
      if (written.isErr()) finish(failure('pm2-rpc-unreachable'));
    });
  });

export const createNodeNetPm2ReadOnlyRpcClient = (): Pm2ReadOnlyRpcClientPort => ({
  request: input => Promise.resolve().then(
    () => socketRequest(input),
    () => failure('pm2-rpc-unreachable')
  ).then(
    result => result,
    () => failure('pm2-rpc-unreachable')
  )
});

const observationFromFailures = (
  failures: readonly Pm2RpcFailureCode[]
): Pm2SocketProbeObservation => {
  if (failures.includes('pm2-rpc-timeout')) return { status: 'timeout' };
  if (failures.includes('pm2-rpc-unavailable')) return { status: 'unavailable' };
  if (failures.includes('pm2-rpc-unreachable')) return { status: 'unreachable' };
  return { status: 'incompatible' };
};

const compatibilityObservation = (
  replies: readonly Pm2RpcResult<Pm2ReadOnlyReply>[]
): Pm2SocketProbeObservation => {
  const failures: readonly Pm2RpcFailureCode[] = replies.flatMap(
    (reply): readonly Pm2RpcFailureCode[] => reply.outcome === 'failure' ? [reply.code] : []
  );
  if (failures.length > 0) return observationFromFailures(failures);
  const methods = replies.find(reply => reply.outcome === 'success' && reply.value.kind === 'methods');
  const version = replies.find(reply => reply.outcome === 'success' && reply.value.kind === 'getVersion');
  return methods?.outcome === 'success' && methods.value.kind === 'methods' &&
    version?.outcome === 'success' && version.value.kind === 'getVersion' &&
    methods.value.compatibility.status === 'required-methods-present' &&
    version.value.compatibility.status === 'admitted-version'
    ? { status: 'compatible' }
    : { status: 'incompatible' };
};

const probeCompatibility = (
  request: Pm2SocketProbeRequest,
  client: Pm2ReadOnlyRpcClientPort
): Promise<Pm2SocketProbeObservation> => {
  const methods = encodePm2ReadOnlyRequest('methods');
  const version = encodePm2ReadOnlyRequest('getVersion');
  if (methods.outcome === 'failure' || version.outcome === 'failure') {
    return Promise.resolve({ status: 'incompatible' });
  }
  return Promise.all([
    client.request({ endpoint: request.endpoint, timeoutMs: request.timeoutMs, request: methods.value }),
    client.request({ endpoint: request.endpoint, timeoutMs: request.timeoutMs, request: version.value })
  ]).then(
    compatibilityObservation,
    () => ({ status: 'unreachable' })
  );
};

export const createPm2ProtocolCompatibilityRuntimePort = (
  platform: NodeJS.Platform = process.platform,
  client: Pm2ReadOnlyRpcClientPort = createNodeNetPm2ReadOnlyRpcClient()
): Pm2PrerequisiteRuntimePort => ({
  supportsEndpointKind: kind => platform === 'win32' ? kind === 'named-pipe' : kind === 'unix-socket',
  probeSocket: request => probeCompatibility(request, client)
});
