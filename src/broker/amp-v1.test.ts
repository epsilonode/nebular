import { describe, expect, it } from 'vitest';

import {
  AMP_V1_MAX_ARGUMENT_BYTES,
  AMP_V1_MAX_ARGUMENTS,
  decodeAmpV1Chunk,
  emptyAmpV1StreamState,
  encodeAmpV1Message,
  finishAmpV1Stream,
  type AmpV1Result
} from './amp-v1.ts';

const unwrap = <T>(result: AmpV1Result<T>): T => {
  if (result.outcome === 'failure') throw new Error(result.code);
  return result.value;
};

describe('bounded AMP v1 codec', () => {
  it('encodes the exact AMP v1 metadata and big-endian length layout', () => {
    const encoded = unwrap(encodeAmpV1Message([
      Uint8Array.of(0x61),
      Uint8Array.of(0x62, 0x63)
    ]));

    expect(Array.from(encoded)).toEqual([
      0x12,
      0, 0, 0, 1, 0x61,
      0, 0, 0, 2, 0x62, 0x63
    ]);
  });

  it('decodes an arbitrarily split message without aliasing caller bytes', () => {
    const encoded = Uint8Array.from(unwrap(encodeAmpV1Message([
      Uint8Array.of(1, 2, 3),
      Uint8Array.of(4)
    ])));
    const first = unwrap(decodeAmpV1Chunk(emptyAmpV1StreamState(), encoded.slice(0, 3)));
    expect(first.messages).toEqual([]);
    const secondChunk = encoded.slice(3);
    const second = unwrap(decodeAmpV1Chunk(first.state, secondChunk));
    secondChunk.fill(0xff);

    expect(second.messages.map(message => message.arguments.map(argument => Array.from(argument))))
      .toEqual([[[1, 2, 3], [4]]]);
    expect(finishAmpV1Stream(second.state)).toEqual({ outcome: 'success', value: true });
  });

  it('decodes multiple complete frames while preserving a final partial frame', () => {
    const first = unwrap(encodeAmpV1Message([Uint8Array.of(1)]));
    const second = unwrap(encodeAmpV1Message([Uint8Array.of(2)]));
    const third = unwrap(encodeAmpV1Message([Uint8Array.of(3)]));
    const bytes = Uint8Array.from([...first, ...second, ...third.slice(0, 2)]);
    const decoded = unwrap(decodeAmpV1Chunk(emptyAmpV1StreamState(), bytes));

    expect(decoded.messages.map(message => Array.from(message.arguments[0] ?? []))).toEqual([[1], [2]]);
    expect(decoded.state.pending.byteLength).toBe(2);
    expect(finishAmpV1Stream(decoded.state)).toEqual({ outcome: 'failure', code: 'amp-malformed' });
  });

  it.each([
    [Uint8Array.of(0x20), 'amp-version-unsupported'],
    [Uint8Array.of(0x10), 'amp-malformed'],
    [Uint8Array.of(0x11, 0, 4, 0, 1), 'amp-oversize']
  ] as const)('rejects unsupported, zero-argument, and announced oversize frames', (bytes, code) => {
    expect(decodeAmpV1Chunk(emptyAmpV1StreamState(), bytes)).toEqual({ outcome: 'failure', code });
  });

  it('rejects invalid encoder arity and oversize arguments before allocation', () => {
    expect(encodeAmpV1Message([])).toEqual({ outcome: 'failure', code: 'amp-malformed' });
    expect(encodeAmpV1Message(Array.from(
      { length: AMP_V1_MAX_ARGUMENTS + 1 },
      () => new Uint8Array()
    ))).toEqual({ outcome: 'failure', code: 'amp-malformed' });
    expect(encodeAmpV1Message([
      new Uint8Array(AMP_V1_MAX_ARGUMENT_BYTES + 1)
    ])).toEqual({ outcome: 'failure', code: 'amp-oversize' });
  });
});
