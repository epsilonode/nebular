import { err, ok, type TeleportIssue, type TeleportResult } from './result';
import type { TeleportS3GetOutput } from './transport-policy';

type TeleportCollectedChunks = Readonly<{
  chunks: readonly Uint8Array[];
  total: number;
}>;

const streamIssue = (
  code: TeleportIssue['code'],
  message: string
): TeleportIssue => ({ code, message });

const captureStreamValue = <T>(
  effect: () => T | PromiseLike<T>,
  issue: TeleportIssue
): Promise<TeleportResult<T>> => Promise.resolve()
  .then(effect)
  .then(
    value => ok(value),
    () => err(issue)
  );

const closeStream = (
  iterator: AsyncIterator<Uint8Array>
): Promise<void> => Promise.resolve()
  .then(() => iterator.return?.())
  .then(
    () => undefined,
    () => undefined
  );

const terminateWith = async <T>(
  iterator: AsyncIterator<Uint8Array>,
  result: TeleportResult<T>
): Promise<TeleportResult<T>> => {
  await closeStream(iterator);
  return result;
};

const collectStreamChunks = async (
  iterator: AsyncIterator<Uint8Array>,
  contentLength: number,
  maxBytes: number,
  state: TeleportCollectedChunks = { chunks: [], total: 0 }
): Promise<TeleportResult<TeleportCollectedChunks>> => {
  const next = await captureStreamValue(
    () => iterator.next(),
    streamIssue('execution-failed', 'S3 object stream failed unexpectedly.')
  );
  if (!next.ok) return next;
  if (next.value.done === true) {
    return state.total === contentLength
      ? ok(state)
      : err(streamIssue(
          'car-invalid',
          'S3 object stream length does not match its declaration.'
        ));
  }
  const chunk: unknown = next.value.value;
  if (!(chunk instanceof Uint8Array)) {
    return terminateWith(
      iterator,
      err(streamIssue('car-invalid', 'S3 object stream yielded a non-byte chunk.'))
    );
  }
  const total = state.total + chunk.byteLength;
  if (total > maxBytes || total > contentLength) {
    return terminateWith(
      iterator,
      err(streamIssue(
        'budget-exceeded',
        'S3 object stream exceeds its declared or configured budget.'
      ))
    );
  }
  return collectStreamChunks(iterator, contentLength, maxBytes, {
    chunks: [...state.chunks, Uint8Array.from(chunk)],
    total
  });
};

const assembleChunks = (
  chunks: readonly Uint8Array[]
): Promise<TeleportResult<Uint8Array>> => captureStreamValue(
  async () => new Uint8Array(await new Blob(
    chunks.map(chunk => Uint8Array.from(chunk).buffer)
  ).arrayBuffer()),
  streamIssue('execution-failed', 'S3 object stream assembly failed unexpectedly.')
);

/**
 * Consumes the foreign AsyncIterable once, translating iterator rejection,
 * malformed chunks, declaration drift, and budget overflow into typed results.
 */
export const collectTeleportS3Object = async (
  output: TeleportS3GetOutput,
  maxBytes: number
): Promise<TeleportResult<Uint8Array>> => {
  if (
    !Number.isSafeInteger(maxBytes)
    || maxBytes < 0
    || !Number.isSafeInteger(output.contentLength)
    || output.contentLength < 0
    || !Number.isSafeInteger(output.totalLength)
    || output.totalLength < output.contentLength
    || output.contentLength > maxBytes
  ) {
    return err(streamIssue('budget-exceeded', 'S3 object exceeds its read budget.'));
  }
  const iterator = await captureStreamValue(
    () => output.body[Symbol.asyncIterator](),
    streamIssue('execution-failed', 'S3 object stream could not be opened.')
  );
  if (!iterator.ok) return iterator;
  const collected = await collectStreamChunks(
    iterator.value,
    output.contentLength,
    maxBytes
  );
  if (!collected.ok) return collected;
  const assembled = await assembleChunks(collected.value.chunks);
  return assembled.ok && assembled.value.byteLength === collected.value.total
    ? assembled
    : err(streamIssue('car-invalid', 'S3 object stream assembly changed its byte length.'));
};
