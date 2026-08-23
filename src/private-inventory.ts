import { CarReader, CarWriter } from '@ipld/car';
import * as dagCbor from '@ipld/dag-cbor';
import { coerce } from 'multiformats/bytes';
import { CID } from 'multiformats/cid';
import * as raw from 'multiformats/codecs/raw';
import { sha256 } from 'multiformats/hashes/sha2';

import { verifyTeleportCartridge, type TeleportCartridgeArchive, type VerifiedTeleportCartridge } from './cartridge';
import { err, ok, type TeleportResult } from './result';

const ITERATIONS = 310_000;
const encoder = new TextEncoder();
const buffer = (bytes: Uint8Array): ArrayBuffer => Uint8Array.from(bytes).buffer;
const concat = (chunks: readonly Uint8Array[]): Uint8Array => {
  const result = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
};
const deriveKey = async (passphrase: string, salt: Uint8Array, usage: KeyUsage): Promise<CryptoKey> => {
  const material = await crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', iterations: ITERATIONS, salt: buffer(salt) }, material, { name: 'AES-GCM', length: 256 }, false, [usage]);
};
const aad = (manifest: CID): Uint8Array => coerce(dagCbor.encode({ type: 'wx-teleport-private-inventory-aad', version: 1, manifest }));

interface PrivateInventoryLocatorV1 {
  readonly type: 'wx-teleport-private-inventory';
  readonly version: 1;
  readonly manifest: CID;
  readonly inventory: CID;
  readonly kdf: Readonly<{ name: 'PBKDF2'; hash: 'SHA-256'; iterations: 310000; salt: Uint8Array }>;
  readonly encryption: Readonly<{ name: 'AES-GCM'; iv: Uint8Array }>;
}

export interface PrivateInventoryCartridgeArchive {
  readonly bytes: Uint8Array;
  readonly root: CID;
  readonly locator: PrivateInventoryLocatorV1;
}

const parseLocator = (value: unknown): TeleportResult<PrivateInventoryLocatorV1> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return err({ code: 'manifest-invalid', message: 'Private inventory locator is invalid.' });
  const record = value as Record<string, unknown>;
  const kdf = record.kdf as Record<string, unknown> | undefined;
  const encryption = record.encryption as Record<string, unknown> | undefined;
  if (
    Object.keys(record).toSorted().join(',') !== 'encryption,inventory,kdf,manifest,type,version' ||
    record.type !== 'wx-teleport-private-inventory' || record.version !== 1 ||
    !(record.manifest instanceof CID) || record.manifest.code !== dagCbor.code ||
    !(record.inventory instanceof CID) || record.inventory.code !== raw.code ||
    !kdf || Object.keys(kdf).toSorted().join(',') !== 'hash,iterations,name,salt' ||
    kdf.name !== 'PBKDF2' || kdf.hash !== 'SHA-256' || kdf.iterations !== ITERATIONS || !(kdf.salt instanceof Uint8Array) || kdf.salt.byteLength !== 16 ||
    !encryption || Object.keys(encryption).toSorted().join(',') !== 'iv,name' || encryption.name !== 'AES-GCM' || !(encryption.iv instanceof Uint8Array) || encryption.iv.byteLength !== 12
  ) return err({ code: 'manifest-invalid', message: 'Private inventory locator contract is invalid.' });
  return ok(value as PrivateInventoryLocatorV1);
};

export const createPrivateInventoryCartridge = async (
  archive: TeleportCartridgeArchive,
  passphrase: string
): Promise<TeleportResult<PrivateInventoryCartridgeArchive>> => {
  if (!passphrase) return err({ code: 'capability-invalid', message: 'A private-inventory passphrase is required.' });
  try {
    const verified = await verifyTeleportCartridge(archive.bytes);
    if (!verified.ok) return verified;
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const inventoryBytes = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: buffer(iv), additionalData: buffer(aad(archive.root)), tagLength: 128 }, await deriveKey(passphrase, salt, 'encrypt'), buffer(archive.rootBytes)));
    const inventory = CID.createV1(raw.code, await sha256.digest(inventoryBytes));
    const locator: PrivateInventoryLocatorV1 = { type: 'wx-teleport-private-inventory', version: 1, manifest: archive.root, inventory, kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: ITERATIONS, salt }, encryption: { name: 'AES-GCM', iv } };
    const locatorBytes = coerce(dagCbor.encode(locator));
    const root = CID.createV1(dagCbor.code, await sha256.digest(locatorBytes));
    const original = await CarReader.fromBytes(archive.bytes);
    const { writer, out } = CarWriter.create([root]);
    const output = (async () => { const chunks: Uint8Array[] = []; for await (const chunk of out) chunks.push(chunk); return concat(chunks); })();
    await writer.put({ cid: root, bytes: locatorBytes });
    await writer.put({ cid: inventory, bytes: inventoryBytes });
    for await (const block of original.blocks()) if (!block.cid.equals(archive.root)) await writer.put(block);
    await writer.close();
    return ok({ bytes: await output, root, locator });
  } catch {
    return err({ code: 'car-invalid', message: 'Private inventory cartridge creation failed.' });
  }
};

export const unlockPrivateInventoryCartridge = async (
  bytes: Uint8Array,
  passphrase: string
): Promise<TeleportResult<VerifiedTeleportCartridge>> => {
  if (!passphrase) return err({ code: 'decode-failed', message: 'A private-inventory passphrase is required.' });
  try {
    const reader = await CarReader.fromBytes(bytes);
    const roots = await reader.getRoots();
    if (roots.length !== 1) return err({ code: 'car-invalid', message: 'Private inventory CAR must have one root.' });
    const blocks = new Map<string, Readonly<{ cid: CID; bytes: Uint8Array }>>();
    for await (const block of reader.blocks()) {
      const digest = await sha256.digest(coerce(block.bytes));
      if (!digest.bytes.every((byte, index) => byte === block.cid.multihash.bytes[index])) return err({ code: 'cid-mismatch', message: 'Private inventory block bytes do not match their CID.' });
      if (blocks.has(block.cid.toString())) return err({ code: 'car-invalid', message: 'Private inventory CAR contains a duplicate block.' });
      blocks.set(block.cid.toString(), block);
    }
    const root = roots[0];
    const rootBlock = root ? blocks.get(root.toString()) : undefined;
    if (!root || !rootBlock || root.code !== dagCbor.code) return err({ code: 'manifest-invalid', message: 'Private inventory locator block is missing.' });
    const locator = parseLocator(dagCbor.decode(rootBlock.bytes));
    if (!locator.ok) return locator;
    const inventoryBlock = blocks.get(locator.value.inventory.toString());
    if (!inventoryBlock) return err({ code: 'missing-block', message: 'Encrypted private inventory block is missing.' });
    const manifestBytes = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buffer(locator.value.encryption.iv), additionalData: buffer(aad(locator.value.manifest)), tagLength: 128 }, await deriveKey(passphrase, locator.value.kdf.salt, 'decrypt'), buffer(inventoryBlock.bytes)));
    const manifestDigest = await sha256.digest(manifestBytes);
    if (!manifestDigest.bytes.every((byte, index) => byte === locator.value.manifest.multihash.bytes[index])) return err({ code: 'cid-mismatch', message: 'Unlocked private inventory does not match its manifest CID.' });
    const { writer, out } = CarWriter.create([locator.value.manifest]);
    const output = (async () => { const chunks: Uint8Array[] = []; for await (const chunk of out) chunks.push(chunk); return concat(chunks); })();
    await writer.put({ cid: locator.value.manifest, bytes: manifestBytes });
    for (const block of blocks.values()) if (!block.cid.equals(root) && !block.cid.equals(locator.value.inventory)) await writer.put(block);
    await writer.close();
    return verifyTeleportCartridge(await output);
  } catch {
    return err({ code: 'decode-failed', message: 'Private inventory unlock failed.' });
  }
};
