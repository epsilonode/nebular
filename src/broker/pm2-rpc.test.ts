import { describe, expect, it } from 'vitest';

import {
  decodeAmpV1Chunk,
  emptyAmpV1StreamState,
  encodeAmpV1Message,
  type AmpV1Result
} from './amp-v1.ts';
import {
  PM2_REQUIRED_RECEIVER_METHODS,
  createPm2ProtocolCompatibilityRuntimePort,
  createPm2ReplyDecoderState,
  decodePm2MethodsCompatibility,
  decodePm2ReadOnlyReplyChunk,
  decodePm2VersionCompatibility,
  encodePm2ReadOnlyRequest,
  type Pm2EncodedReadOnlyRequest,
  type Pm2ReadOnlyReply,
  type Pm2ReadOnlyRpcClientPort,
  type Pm2RpcResult
} from './pm2-rpc.ts';

const unwrapAmp = <T>(result: AmpV1Result<T>): T => {
  if (result.outcome === 'failure') throw new Error(result.code);
  return result.value;
};

const unwrapRpc = <T>(result: Pm2RpcResult<T>): T => {
  if (result.outcome === 'failure') throw new Error(result.code);
  return result.value;
};

const packed = (prefix: 'j:' | 's:', value: string): Uint8Array =>
  new TextEncoder().encode(`${prefix}${value}`);

const replyFrame = (
  request: Pm2EncodedReadOnlyRequest,
  value: unknown,
  correlationId: string = request.correlationId
): Readonly<Uint8Array> => unwrapAmp(encodeAmpV1Message([
  packed('j:', JSON.stringify(value)),
  packed('s:', correlationId)
]));

const methodDescriptor = (name: string) => ({ name, params: ['opts', 'cb'] });

const methodsReply = (missing?: string): unknown => ({
  methods: Object.fromEntries(
    PM2_REQUIRED_RECEIVER_METHODS
      .filter(method => method !== missing)
      .map(method => [method, methodDescriptor(method)])
  )
});

describe('read-only PM2 RPC protocol', () => {
  it('encodes only the methods inventory and getVersion calls with distinct correlations', () => {
    const methods = unwrapRpc(encodePm2ReadOnlyRequest('methods'));
    const version = unwrapRpc(encodePm2ReadOnlyRequest('getVersion'));
    const decodeArguments = (request: Pm2EncodedReadOnlyRequest): readonly string[] => {
      const decoded = unwrapAmp(decodeAmpV1Chunk(emptyAmpV1StreamState(), request.bytes));
      return (decoded.messages[0]?.arguments ?? []).map(argument => new TextDecoder().decode(argument));
    };

    expect(decodeArguments(methods)).toEqual([
      'j:{"type":"methods"}',
      's:nebular-pm2-methods-v1'
    ]);
    expect(decodeArguments(version)).toEqual([
      'j:{"type":"call","method":"getVersion","args":[{}]}',
      's:nebular-pm2-version-v1'
    ]);
    expect(version.correlationId).not.toBe(methods.correlationId);
  });

  it('projects the methods inventory to the exact required receiver capability decision', () => {
    expect(decodePm2MethodsCompatibility(methodsReply())).toEqual({
      outcome: 'success',
      value: { status: 'required-methods-present' }
    });
    expect(decodePm2MethodsCompatibility(methodsReply('prepare'))).toEqual({
      outcome: 'success',
      value: { status: 'missing-required-methods' }
    });
    expect(decodePm2MethodsCompatibility({ methods: { prepare: { name: 'prepare', params: 'cb' } } }))
      .toEqual({ outcome: 'failure', code: 'pm2-rpc-malformed' });
  });

  it('admits only the explicitly tested host PM2 version', () => {
    expect(decodePm2VersionCompatibility({ args: ['5.4.3'] })).toEqual({
      outcome: 'success',
      value: { status: 'admitted-version' }
    });
    expect(decodePm2VersionCompatibility({ args: ['5.4.4'] })).toEqual({
      outcome: 'success',
      value: { status: 'unsupported-version' }
    });
    expect(decodePm2VersionCompatibility({ args: [null, '5.4.3'] }))
      .toEqual({ outcome: 'failure', code: 'pm2-rpc-malformed' });
  });

  it('accepts exactly one valid correlated reply and projects no raw method inventory', () => {
    const request = unwrapRpc(encodePm2ReadOnlyRequest('methods'));
    const frame = replyFrame(request, methodsReply());
    const first = decodePm2ReadOnlyReplyChunk(
      createPm2ReplyDecoderState(),
      frame.slice(0, 7),
      request
    );
    expect(first.outcome).toBe('waiting');
    if (first.outcome !== 'waiting') return;
    const second = decodePm2ReadOnlyReplyChunk(first.state, frame.slice(7), request);

    expect(second).toEqual({
      outcome: 'complete',
      reply: { kind: 'methods', compatibility: { status: 'required-methods-present' } }
    });
    expect(JSON.stringify(second)).not.toContain('stopProcessId');
  });

  it.each([
    ['correlation', (request: Pm2EncodedReadOnlyRequest) => replyFrame(request, methodsReply(), 'wrong-id'), 'pm2-rpc-correlation-mismatch'],
    ['malformed JSON', (request: Pm2EncodedReadOnlyRequest) => unwrapAmp(encodeAmpV1Message([
      packed('j:', '{invalid'),
      packed('s:', request.correlationId)
    ])), 'pm2-rpc-malformed'],
    ['trailing frame', (request: Pm2EncodedReadOnlyRequest) => {
      const frame = replyFrame(request, methodsReply());
      return Uint8Array.from([...frame, ...frame]);
    }, 'pm2-rpc-trailing-data'],
    ['trailing partial data', (request: Pm2EncodedReadOnlyRequest) =>
      Uint8Array.from([...replyFrame(request, methodsReply()), 0x11]), 'pm2-rpc-trailing-data'],
    ['oversize announcement', (_request: Pm2EncodedReadOnlyRequest) =>
      Uint8Array.of(0x11, 0, 4, 0, 1), 'pm2-rpc-oversize']
  ] as const)('closes %s without returning frame or JSON content', (_case, makeBytes, code) => {
    const request = unwrapRpc(encodePm2ReadOnlyRequest('methods'));
    const outcome = decodePm2ReadOnlyReplyChunk(createPm2ReplyDecoderState(), makeBytes(request), request);

    expect(outcome).toEqual({ outcome: 'failure', code });
    expect(JSON.stringify(outcome)).not.toContain('wrong-id');
  });

  it('declares compatibility only after both closed, correlated read-only replies', async () => {
    const calls: string[] = [];
    const client: Pm2ReadOnlyRpcClientPort = {
      request: async input => {
        calls.push(input.request.kind);
        const reply: Pm2ReadOnlyReply = input.request.kind === 'methods'
          ? { kind: 'methods', compatibility: { status: 'required-methods-present' } }
          : { kind: 'getVersion', compatibility: { status: 'admitted-version' } };
        return { outcome: 'success', value: reply };
      }
    };
    const runtime = createPm2ProtocolCompatibilityRuntimePort('win32', client);
    const outcome = await runtime.probeSocket({
      endpointKind: 'named-pipe',
      endpoint: '\\\\.\\pipe\\rpc.sock',
      timeoutMs: 250
    });

    expect(calls.toSorted()).toEqual(['getVersion', 'methods']);
    expect(outcome).toEqual({ status: 'compatible' });
  });

  it.each([
    [{ outcome: 'failure', code: 'pm2-rpc-timeout' }, 'timeout'],
    [{ outcome: 'failure', code: 'pm2-rpc-unavailable' }, 'unavailable'],
    [{ outcome: 'failure', code: 'pm2-rpc-unreachable' }, 'unreachable'],
    [{ outcome: 'failure', code: 'pm2-rpc-correlation-mismatch' }, 'incompatible']
  ] as const)('maps a redacted client failure to the closed prerequisite observation', async (failureResult, status) => {
    const client: Pm2ReadOnlyRpcClientPort = { request: async () => failureResult };
    const outcome = await createPm2ProtocolCompatibilityRuntimePort('win32', client).probeSocket({
      endpointKind: 'named-pipe',
      endpoint: '\\\\.\\pipe\\rpc.sock',
      timeoutMs: 250
    });

    expect(outcome).toEqual({ status });
  });
});
