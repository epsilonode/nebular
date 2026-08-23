import { CarBufferWriter, CarReader, CarWriter } from '@ipld/car';
import * as dagCbor from '@ipld/dag-cbor';
import { coerce } from 'multiformats/bytes';
import { CID } from 'multiformats/cid';
import { sha256 } from 'multiformats/hashes/sha2';

import { err, ok, type TeleportIssue, type TeleportResult } from './result';

export interface TeleportCarRuntimeBlock {
  readonly cid: CID;
  readonly bytes: Uint8Array;
}

export interface TeleportCarRuntimeContents {
  readonly roots: readonly CID[];
  readonly blocks: readonly TeleportCarRuntimeBlock[];
}

export interface TeleportCarRuntimeChunkSink {
  readonly write: (chunk: Uint8Array) => Promise<void>;
}

interface TeleportCarReaderPort {
  readonly getRoots: () => Promise<readonly CID[]>;
  readonly blocks: () => AsyncIterable<TeleportCarRuntimeBlock>;
}

interface TeleportCarWriterPort {
  readonly put: (block: TeleportCarRuntimeBlock) => Promise<void>;
  readonly close: () => Promise<void>;
}

const capture = <T>(
  effect: () => T | PromiseLike<T>,
  issueFor: (cause: unknown) => TeleportIssue
): Promise<TeleportResult<T>> => Promise.resolve()
  .then(effect)
  .then(
    value => ok(value),
    cause => err(issueFor(cause))
  );

const fixedIssue = (issue: TeleportIssue): ((cause: unknown) => TeleportIssue) => () => issue;

const CAR_READ_FAILED: TeleportIssue = {
  code: 'car-invalid',
  message: 'Teleport CAR parsing failed.'
};

const CAR_WRITE_FAILED: TeleportIssue = {
  code: 'execution-failed',
  message: 'Teleport CAR encoding failed.'
};

const MANIFEST_ENCODE_FAILED: TeleportIssue = {
  code: 'manifest-invalid',
  message: 'Teleport manifest encoding failed.'
};

const MANIFEST_DECODE_FAILED: TeleportIssue = {
  code: 'manifest-invalid',
  message: 'Teleport manifest decoding failed.'
};

const HASH_FAILED: TeleportIssue = {
  code: 'verification-failed',
  message: 'Teleport block hashing failed.'
};

const runtimeBlockFrom = (value: unknown): TeleportCarRuntimeBlock | undefined => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  if (!('cid' in value) || !('bytes' in value)) return undefined;
  const cid = CID.asCID(value.cid) ?? undefined;
  return cid !== undefined && value.bytes instanceof Uint8Array
    ? { cid, bytes: value.bytes }
    : undefined;
};

const collectBlocks = async (
  iterator: AsyncIterator<unknown, unknown, unknown>,
  blocks: readonly TeleportCarRuntimeBlock[] = []
): Promise<TeleportResult<readonly TeleportCarRuntimeBlock[]>> => {
  const next = await capture(
    () => iterator.next(),
    fixedIssue(CAR_READ_FAILED)
  );
  if (!next.ok) return next;
  if (next.value.done) return ok(blocks);
  const value: unknown = next.value.value;
  const block = runtimeBlockFrom(value);
  return block !== undefined
    ? collectBlocks(iterator, [
      ...blocks,
      { cid: block.cid, bytes: Uint8Array.from(block.bytes) }
    ])
    : err(CAR_READ_FAILED);
};

const consumeChunks = async (
  iterator: AsyncIterator<unknown, unknown, unknown>,
  sink: TeleportCarRuntimeChunkSink
): Promise<TeleportResult<void>> => {
  const next = await capture(
    () => iterator.next(),
    fixedIssue(CAR_WRITE_FAILED)
  );
  if (!next.ok) return next;
  if (next.value.done) return ok(undefined);
  const chunk: unknown = next.value.value;
  if (!(chunk instanceof Uint8Array)) return err(CAR_WRITE_FAILED);
  const written = await capture(
    () => sink.write(Uint8Array.from(chunk)),
    () => ({
      code: 'execution-failed',
      message: 'Teleport cartridge stream write failed.'
    })
  );
  return written.ok ? consumeChunks(iterator, sink) : written;
};

const collectBoundedChunks = async (
  iterator: AsyncIterator<unknown, unknown, unknown>,
  maxBytes: number,
  total = 0,
  chunks: readonly Uint8Array[] = []
): Promise<TeleportResult<readonly Uint8Array[]>> => {
  const next = await capture(
    () => iterator.next(),
    () => ({ code: 'car-invalid', message: 'Teleport CAR stream read failed.' })
  );
  if (!next.ok) return next;
  if (next.value.done) return ok(chunks);
  const chunk: unknown = next.value.value;
  if (!(chunk instanceof Uint8Array)) return err({
    code: 'car-invalid',
    message: 'CAR stream yielded a non-byte chunk.'
  });
  const nextTotal = total + chunk.byteLength;
  return nextTotal > maxBytes
    ? err({ code: 'budget-exceeded', message: 'CAR stream exceeds its byte budget.' })
    : collectBoundedChunks(
      iterator,
      maxBytes,
      nextTotal,
      [...chunks, Uint8Array.from(chunk)]
    );
};

export const encodeTeleportManifestBytes = (
  value: unknown
): Promise<TeleportResult<Uint8Array>> => capture(
  () => coerce(dagCbor.encode(value)),
  fixedIssue(MANIFEST_ENCODE_FAILED)
);

export const decodeTeleportManifestBytes = (
  bytes: Uint8Array
): Promise<TeleportResult<unknown>> => capture(
  () => dagCbor.decode(bytes),
  fixedIssue(MANIFEST_DECODE_FAILED)
);

export const digestTeleportBlockBytes = (
  bytes: Uint8Array
): Promise<TeleportResult<Uint8Array>> => capture(
  async () => Uint8Array.from((await sha256.digest(bytes)).bytes),
  fixedIssue(HASH_FAILED)
);

export const createTeleportBlockCid = (
  codec: number,
  bytes: Uint8Array
): Promise<TeleportResult<CID>> => capture(
  async () => CID.createV1(codec, await sha256.digest(bytes)),
  fixedIssue(HASH_FAILED)
);

export const measureTeleportCarBytes = (
  root: CID,
  blocks: readonly TeleportCarRuntimeBlock[]
): Promise<TeleportResult<number>> => capture(
  () => CarBufferWriter.headerLength({ roots: [root] }) + blocks.reduce(
    (total, block) => total + CarBufferWriter.blockLength(block),
    0
  ),
  fixedIssue(CAR_WRITE_FAILED)
);

export const createTeleportCarChunkStream = (
  root: CID,
  blocks: readonly TeleportCarRuntimeBlock[]
): Promise<TeleportResult<AsyncIterable<Uint8Array>>> => capture(
  () => {
    const created: Readonly<{
      readonly writer: TeleportCarWriterPort;
      readonly out: AsyncIterable<Uint8Array>;
    }> = CarWriter.create([root]);
    const production: Promise<void> = blocks.reduce<Promise<void>>(
      (sequence, block) => sequence.then(() => created.writer.put(block)),
      Promise.resolve()
    ).then(() => created.writer.close());
    const producerFailure: Promise<never> = production.then(
      () => new Promise<never>(() => undefined)
    );
    const output: AsyncIterator<Uint8Array> = created.out[Symbol.asyncIterator]();
    return {
      [Symbol.asyncIterator]: () => ({
        next: () => Promise.race([output.next(), producerFailure])
      })
    };
  },
  fixedIssue(CAR_WRITE_FAILED)
);

export const writeTeleportCarChunks = async (
  chunks: AsyncIterable<Uint8Array>,
  sink: TeleportCarRuntimeChunkSink
): Promise<TeleportResult<void>> => {
  const iterator = await capture<AsyncIterator<unknown, unknown, unknown>>(
    () => chunks[Symbol.asyncIterator](),
    fixedIssue(CAR_WRITE_FAILED)
  );
  return iterator.ok ? consumeChunks(iterator.value, sink) : iterator;
};

export const collectTeleportCarChunks = async (
  chunks: AsyncIterable<Uint8Array>,
  maxBytes: number
): Promise<TeleportResult<Uint8Array>> => {
  const iterator = await capture<AsyncIterator<unknown, unknown, unknown>>(
    () => chunks[Symbol.asyncIterator](),
    () => ({ code: 'car-invalid', message: 'Teleport CAR stream read failed.' })
  );
  if (!iterator.ok) return iterator;
  const collected = await collectBoundedChunks(iterator.value, maxBytes);
  if (!collected.ok) return collected;
  return capture(
    async () => new Uint8Array(await new Blob(
      collected.value.map(chunk => Uint8Array.from(chunk).buffer)
    ).arrayBuffer()),
    () => ({ code: 'car-invalid', message: 'Teleport CAR stream collection failed.' })
  );
};

export const readTeleportCarBytes = (
  bytes: Uint8Array
): Promise<TeleportResult<TeleportCarRuntimeContents>> => capture<TeleportCarReaderPort>(
  () => CarReader.fromBytes(bytes),
  fixedIssue(CAR_READ_FAILED)
).then(async reader => {
  if (!reader.ok) return reader;
  const roots = await capture(
    () => reader.value.getRoots(),
    fixedIssue(CAR_READ_FAILED)
  );
  if (!roots.ok) return roots;
  const iterator = await capture<AsyncIterator<unknown, unknown, unknown>>(
    () => reader.value.blocks()[Symbol.asyncIterator](),
    fixedIssue(CAR_READ_FAILED)
  );
  if (!iterator.ok) return iterator;
  const blocks = await collectBlocks(iterator.value);
  return blocks.ok ? ok({ roots: roots.value, blocks: blocks.value }) : blocks;
});
