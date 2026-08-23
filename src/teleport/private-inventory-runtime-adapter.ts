import { CarReader, CarWriter } from '@ipld/car';
import * as dagCbor from '@ipld/dag-cbor';
import { coerce } from 'multiformats/bytes';
import { CID } from 'multiformats/cid';
import { sha256 } from 'multiformats/hashes/sha2';

import { err, ok, type TeleportIssue, type TeleportResult } from './result';

const encoder = new TextEncoder();
const ITERATIONS = 310_000;

export interface PrivateInventoryCarBlock {
  readonly cid: CID;
  readonly bytes: Uint8Array;
}

export interface PrivateInventoryCarContents {
  readonly roots: readonly CID[];
  readonly blocks: readonly PrivateInventoryCarBlock[];
}

export interface PrivateInventoryRandomMaterial {
  readonly salt: Uint8Array;
  readonly iv: Uint8Array;
}

export interface PrivateInventoryCipherInput {
  readonly passphrase: string;
  readonly manifest: CID;
  readonly salt: Uint8Array;
  readonly iv: Uint8Array;
  readonly bytes: Uint8Array;
}

interface PrivateInventoryCarReaderPort {
  readonly getRoots: () => Promise<readonly CID[]>;
  readonly blocks: () => AsyncIterable<Readonly<{ cid: CID; bytes: Uint8Array }>>;
}

const buffer = (bytes: Uint8Array): ArrayBuffer => Uint8Array.from(bytes).buffer;

const capture = <T>(
  effect: () => T | PromiseLike<T>,
  issue: TeleportIssue
): Promise<TeleportResult<T>> => Promise.resolve()
  .then(effect)
  .then(
    value => ok(value),
    () => err(issue)
  );

const collect = async (
  iterator: AsyncIterator<Uint8Array>,
  chunks: readonly Uint8Array[] = []
): Promise<readonly Uint8Array[]> => {
  const next: Readonly<IteratorResult<Uint8Array>> = await iterator.next();
  return next.done
    ? chunks
    : collect(iterator, [...chunks, Uint8Array.from(next.value)]);
};

const readBlocks = async (
  iterator: AsyncIterator<Readonly<{ cid: CID; bytes: Uint8Array }>>,
  blocks: readonly PrivateInventoryCarBlock[] = []
): Promise<readonly PrivateInventoryCarBlock[]> => {
  const next: Readonly<IteratorResult<Readonly<{ cid: CID; bytes: Uint8Array }>>> = await iterator.next();
  return next.done
    ? blocks
    : readBlocks(iterator, [...blocks, { cid: next.value.cid, bytes: Uint8Array.from(next.value.bytes) }]);
};

const aad = (manifest: CID): Uint8Array => coerce(dagCbor.encode({
  type: 'wx-teleport-private-inventory-aad',
  version: 1,
  manifest
}));

const deriveKey = async (
  passphrase: string,
  salt: Uint8Array,
  usage: KeyUsage
): Promise<CryptoKey> => {
  const material = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', iterations: ITERATIONS, salt: buffer(salt) },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    [usage]
  );
};

export const createPrivateInventoryRandomMaterial = (
  issue: TeleportIssue
): Promise<TeleportResult<PrivateInventoryRandomMaterial>> => capture(
  () => ({
    salt: crypto.getRandomValues(new Uint8Array(16)),
    iv: crypto.getRandomValues(new Uint8Array(12))
  }),
  issue
);

export const encryptPrivateInventoryBytes = (
  input: PrivateInventoryCipherInput,
  issue: TeleportIssue
): Promise<TeleportResult<Uint8Array>> => capture(
  async () => new Uint8Array(await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: buffer(input.iv),
      additionalData: buffer(aad(input.manifest)),
      tagLength: 128
    },
    await deriveKey(input.passphrase, input.salt, 'encrypt'),
    buffer(input.bytes)
  )),
  issue
);

export const decryptPrivateInventoryBytes = (
  input: PrivateInventoryCipherInput,
  issue: TeleportIssue
): Promise<TeleportResult<Uint8Array>> => capture(
  async () => new Uint8Array(await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: buffer(input.iv),
      additionalData: buffer(aad(input.manifest)),
      tagLength: 128
    },
    await deriveKey(input.passphrase, input.salt, 'decrypt'),
    buffer(input.bytes)
  )),
  issue
);

export const encodePrivateInventoryDagCbor = (
  value: unknown,
  issue: TeleportIssue
): Promise<TeleportResult<Uint8Array>> => capture(
  () => coerce(dagCbor.encode(value)),
  issue
);

export const decodePrivateInventoryDagCbor = (
  bytes: Uint8Array,
  issue: TeleportIssue
): Promise<TeleportResult<unknown>> => capture(
  () => dagCbor.decode(bytes),
  issue
);

export const createPrivateInventoryCid = (
  codec: number,
  bytes: Uint8Array,
  issue: TeleportIssue
): Promise<TeleportResult<CID>> => capture(
  async () => CID.createV1(codec, await sha256.digest(bytes)),
  issue
);

export const digestPrivateInventoryBytes = (
  bytes: Uint8Array,
  issue: TeleportIssue
): Promise<TeleportResult<Uint8Array>> => capture(
  async () => Uint8Array.from((await sha256.digest(bytes)).bytes),
  issue
);

export const readPrivateInventoryCar = (
  bytes: Uint8Array,
  issue: TeleportIssue
): Promise<TeleportResult<PrivateInventoryCarContents>> => capture(
  async () => {
    const reader: PrivateInventoryCarReaderPort = await CarReader.fromBytes(bytes);
    const roots: readonly CID[] = await reader.getRoots();
    const blocks: readonly PrivateInventoryCarBlock[] = await readBlocks(reader.blocks()[Symbol.asyncIterator]());
    return { roots, blocks };
  },
  issue
);

export const writePrivateInventoryCar = (
  root: CID,
  blocks: readonly PrivateInventoryCarBlock[],
  issue: TeleportIssue
): Promise<TeleportResult<Uint8Array>> => capture(
  async () => {
    const { writer, out } = CarWriter.create([root]);
    const output = collect(out[Symbol.asyncIterator]());
    await blocks.reduce(
      (sequence, block) => sequence.then(() => writer.put(block)),
      Promise.resolve()
    );
    await writer.close();
    const chunks = await output;
    return new Uint8Array(await new Blob(
      chunks.map(chunk => Uint8Array.from(chunk).buffer)
    ).arrayBuffer());
  },
  issue
);
