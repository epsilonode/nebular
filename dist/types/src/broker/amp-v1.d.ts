export declare const AMP_V1_VERSION = 1;
export declare const AMP_V1_MAX_ARGUMENTS = 15;
export declare const AMP_V1_MAX_ARGUMENT_BYTES: number;
export declare const AMP_V1_MAX_MESSAGE_BYTES: number;
export declare const AMP_V1_MAX_STREAM_BYTES: number;
export declare const AMP_V1_MAX_MESSAGES_PER_CHUNK = 16;
export type AmpV1FailureCode = 'amp-malformed' | 'amp-oversize' | 'amp-version-unsupported';
export type AmpV1Result<T> = Readonly<{
    outcome: 'success';
    value: T;
}> | Readonly<{
    outcome: 'failure';
    code: AmpV1FailureCode;
}>;
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
export declare const encodeAmpV1Message: (arguments_: readonly Readonly<Uint8Array>[]) => AmpV1Result<Readonly<Uint8Array>>;
export declare const emptyAmpV1StreamState: () => AmpV1StreamState;
export declare const decodeAmpV1Chunk: (state: AmpV1StreamState, chunk: Readonly<Uint8Array>) => AmpV1Result<AmpV1StreamDecode>;
export declare const finishAmpV1Stream: (state: AmpV1StreamState) => AmpV1Result<true>;
