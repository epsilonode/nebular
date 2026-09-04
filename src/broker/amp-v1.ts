export const AMP_V1_VERSION = 1;
export const AMP_V1_MAX_ARGUMENTS = 15;
export const AMP_V1_MAX_ARGUMENT_BYTES = 256 * 1_024;
export const AMP_V1_MAX_MESSAGE_BYTES = 512 * 1_024;
export const AMP_V1_MAX_STREAM_BYTES = AMP_V1_MAX_MESSAGE_BYTES * 2;
export const AMP_V1_MAX_MESSAGES_PER_CHUNK = 16;

export type AmpV1FailureCode =
  | 'amp-malformed'
  | 'amp-oversize'
  | 'amp-version-unsupported';

export type AmpV1Result<T> =
  | Readonly<{ outcome: 'success'; value: T }>
  | Readonly<{ outcome: 'failure'; code: AmpV1FailureCode }>;

export type AmpV1Message = Readonly<{
  arguments: readonly Readonly<Uint8Array>[];
}>;

export type AmpV1StreamState = Readonly<{
  pending: Readonly<Uint8Array>;
}>;

export type AmpV1StreamDecode = Readonly<{
  state: AmpV1StreamState;
  messages: readonly AmpV1Message[];
}>;

type AmpV1FrameParse =
  | Readonly<{ outcome: 'complete'; message: AmpV1Message; nextOffset: number }>
  | Readonly<{ outcome: 'incomplete' }>
  | Readonly<{ outcome: 'failure'; code: AmpV1FailureCode }>;

const success = <T>(value: T): AmpV1Result<T> => ({ outcome: 'success', value });
const failure = <T = never>(code: AmpV1FailureCode): AmpV1Result<T> => ({ outcome: 'failure', code });

const numbersFrom = (bytes: Readonly<Uint8Array>): readonly number[] => Array.from(bytes);

const concatenate = (parts: readonly Readonly<Uint8Array>[]): Readonly<Uint8Array> =>
  Uint8Array.from(parts.flatMap(numbersFrom));

const uint32Bytes = (value: number): Readonly<Uint8Array> => Uint8Array.of(
  (value >>> 24) & 0xff,
  (value >>> 16) & 0xff,
  (value >>> 8) & 0xff,
  value & 0xff
);

const uint32At = (bytes: Readonly<Uint8Array>, offset: number): number | undefined => {
  const first = bytes.at(offset);
  const second = bytes.at(offset + 1);
  const third = bytes.at(offset + 2);
  const fourth = bytes.at(offset + 3);
  return first === undefined || second === undefined || third === undefined || fourth === undefined
    ? undefined
    : first * 0x1_00_00_00 + second * 0x1_00_00 + third * 0x1_00 + fourth;
};

const encodedMessageSize = (arguments_: readonly Readonly<Uint8Array>[]): number =>
  1 + arguments_.reduce((total, argument) => total + 4 + argument.byteLength, 0);

const encodeArgument = (argument: Readonly<Uint8Array>): readonly Readonly<Uint8Array>[] => [
  uint32Bytes(argument.byteLength),
  Uint8Array.from(argument)
];

export const encodeAmpV1Message = (
  arguments_: readonly Readonly<Uint8Array>[]
): AmpV1Result<Readonly<Uint8Array>> => {
  if (arguments_.length === 0 || arguments_.length > AMP_V1_MAX_ARGUMENTS) {
    return failure('amp-malformed');
  }
  if (arguments_.some(argument => argument.byteLength > AMP_V1_MAX_ARGUMENT_BYTES)) {
    return failure('amp-oversize');
  }
  if (encodedMessageSize(arguments_) > AMP_V1_MAX_MESSAGE_BYTES) return failure('amp-oversize');
  const metadata: Readonly<Uint8Array> = Uint8Array.of((AMP_V1_VERSION << 4) | arguments_.length);
  const encodedArguments: readonly Readonly<Uint8Array>[] = arguments_.flatMap(encodeArgument);
  return success(concatenate([metadata, ...encodedArguments]));
};

const parseArguments = (
  bytes: Readonly<Uint8Array>,
  frameOffset: number,
  argumentCount: number,
  argumentOffset: number,
  arguments_: readonly Readonly<Uint8Array>[]
): AmpV1FrameParse => {
  if (arguments_.length === argumentCount) {
    return {
      outcome: 'complete',
      message: { arguments: arguments_.map(argument => Uint8Array.from(argument)) },
      nextOffset: argumentOffset
    };
  }
  const argumentLength = uint32At(bytes, argumentOffset);
  if (argumentLength === undefined) return { outcome: 'incomplete' };
  if (argumentLength > AMP_V1_MAX_ARGUMENT_BYTES) return { outcome: 'failure', code: 'amp-oversize' };
  const valueOffset = argumentOffset + 4;
  const nextOffset = valueOffset + argumentLength;
  if (nextOffset - frameOffset > AMP_V1_MAX_MESSAGE_BYTES) {
    return { outcome: 'failure', code: 'amp-oversize' };
  }
  if (nextOffset > bytes.byteLength) return { outcome: 'incomplete' };
  return parseArguments(
    bytes,
    frameOffset,
    argumentCount,
    nextOffset,
    [...arguments_, bytes.slice(valueOffset, nextOffset)]
  );
};

const parseFrame = (bytes: Readonly<Uint8Array>, frameOffset: number): AmpV1FrameParse => {
  const metadata = bytes.at(frameOffset);
  if (metadata === undefined) return { outcome: 'incomplete' };
  const version = metadata >>> 4;
  const argumentCount = metadata & 0x0f;
  if (version !== AMP_V1_VERSION) return { outcome: 'failure', code: 'amp-version-unsupported' };
  if (argumentCount === 0) return { outcome: 'failure', code: 'amp-malformed' };
  return parseArguments(bytes, frameOffset, argumentCount, frameOffset + 1, []);
};

const parseAvailableFrames = (
  bytes: Readonly<Uint8Array>,
  offset: number,
  messages: readonly AmpV1Message[]
): AmpV1Result<AmpV1StreamDecode> => {
  if (offset === bytes.byteLength) {
    return success({ state: emptyAmpV1StreamState(), messages });
  }
  if (messages.length >= AMP_V1_MAX_MESSAGES_PER_CHUNK) return failure('amp-oversize');
  const parsed = parseFrame(bytes, offset);
  switch (parsed.outcome) {
    case 'failure':
      return failure(parsed.code);
    case 'incomplete': {
      const pending = bytes.slice(offset);
      return pending.byteLength <= AMP_V1_MAX_MESSAGE_BYTES
        ? success({ state: { pending }, messages })
        : failure('amp-oversize');
    }
    case 'complete':
      return parseAvailableFrames(bytes, parsed.nextOffset, [...messages, parsed.message]);
  }
};

export const emptyAmpV1StreamState = (): AmpV1StreamState => ({ pending: new Uint8Array() });

export const decodeAmpV1Chunk = (
  state: AmpV1StreamState,
  chunk: Readonly<Uint8Array>
): AmpV1Result<AmpV1StreamDecode> => {
  if (state.pending.byteLength > AMP_V1_MAX_MESSAGE_BYTES ||
      state.pending.byteLength + chunk.byteLength > AMP_V1_MAX_STREAM_BYTES) {
    return failure('amp-oversize');
  }
  return parseAvailableFrames(concatenate([state.pending, chunk]), 0, []);
};

export const finishAmpV1Stream = (state: AmpV1StreamState): AmpV1Result<true> =>
  state.pending.byteLength === 0 ? success(true) : failure('amp-malformed');
