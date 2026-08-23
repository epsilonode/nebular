import * as dagCbor from '@ipld/dag-cbor';
import { CID } from 'multiformats/cid';
import * as raw from 'multiformats/codecs/raw';

import {
  verifyTeleportCartridge,
  type TeleportCartridgeArchive,
  type VerifiedTeleportCartridge
} from './cartridge';
import {
  createPrivateInventoryCid,
  createPrivateInventoryRandomMaterial,
  decodePrivateInventoryDagCbor,
  decryptPrivateInventoryBytes,
  digestPrivateInventoryBytes,
  encodePrivateInventoryDagCbor,
  encryptPrivateInventoryBytes,
  readPrivateInventoryCar,
  writePrivateInventoryCar,
  type PrivateInventoryCarBlock
} from './private-inventory-runtime-adapter';
import { err, ok, type TeleportIssue, type TeleportResult } from './result';

const ITERATIONS = 310_000;

interface PrivateInventoryLocatorV1 {
  readonly type: 'wx-teleport-private-inventory';
  readonly version: 1;
  readonly manifest: CID;
  readonly inventory: CID;
  readonly kdf: Readonly<{
    name: 'PBKDF2';
    hash: 'SHA-256';
    iterations: 310000;
    salt: Uint8Array;
  }>;
  readonly encryption: Readonly<{
    name: 'AES-GCM';
    iv: Uint8Array;
  }>;
}

export interface PrivateInventoryCartridgeArchive {
  readonly bytes: Uint8Array;
  readonly root: CID;
  readonly locator: PrivateInventoryLocatorV1;
}

const CREATE_FAILED: TeleportIssue = {
  code: 'car-invalid',
  message: 'Private inventory cartridge creation failed.'
};

const UNLOCK_FAILED: TeleportIssue = {
  code: 'decode-failed',
  message: 'Private inventory unlock failed.'
};

const LOCATOR_INVALID: TeleportIssue = {
  code: 'manifest-invalid',
  message: 'Private inventory locator is invalid.'
};

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const equalBytes = (left: Uint8Array, right: Uint8Array): boolean =>
  left.byteLength === right.byteLength && left.every((entry, index) => entry === right[index]);

const parseLocator = (value: unknown): TeleportResult<PrivateInventoryLocatorV1> => {
  if (!isRecord(value)) return err(LOCATOR_INVALID);
  const kdfValue = value['kdf'];
  const encryptionValue = value['encryption'];
  const kdf = isRecord(kdfValue) ? kdfValue : undefined;
  const encryption = isRecord(encryptionValue) ? encryptionValue : undefined;
  const manifest = value['manifest'];
  const inventory = value['inventory'];
  const salt = kdf?.['salt'];
  const iv = encryption?.['iv'];
  if (
    Object.keys(value).toSorted().join(',') !== 'encryption,inventory,kdf,manifest,type,version' ||
    value['type'] !== 'wx-teleport-private-inventory' || value['version'] !== 1 ||
    !(manifest instanceof CID) || manifest.code !== dagCbor.code ||
    !(inventory instanceof CID) || inventory.code !== raw.code ||
    !kdf || Object.keys(kdf).toSorted().join(',') !== 'hash,iterations,name,salt' ||
    kdf['name'] !== 'PBKDF2' || kdf['hash'] !== 'SHA-256' || kdf['iterations'] !== ITERATIONS ||
    !(salt instanceof Uint8Array) || salt.byteLength !== 16 ||
    !encryption || Object.keys(encryption).toSorted().join(',') !== 'iv,name' ||
    encryption['name'] !== 'AES-GCM' || !(iv instanceof Uint8Array) || iv.byteLength !== 12
  ) return err({ code: 'manifest-invalid', message: 'Private inventory locator contract is invalid.' });
  return ok({
    type: 'wx-teleport-private-inventory',
    version: 1,
    manifest,
    inventory,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: ITERATIONS, salt },
    encryption: { name: 'AES-GCM', iv }
  });
};

const uniqueBlocks = (
  blocks: readonly PrivateInventoryCarBlock[]
): readonly PrivateInventoryCarBlock[] => blocks.filter(
  (block, index) => blocks.findIndex(candidate => candidate.cid.equals(block.cid)) === index
);

const verifiedGraphBlocks = (
  cartridge: VerifiedTeleportCartridge
): readonly PrivateInventoryCarBlock[] => uniqueBlocks([
  ...cartridge.capabilities.map(capability => ({
    cid: capability.descriptor.block,
    bytes: capability.storedBytes
  })),
  ...cartridge.keyEnvelopes.map(envelope => ({
    cid: envelope.descriptor.block,
    bytes: envelope.bytes
  })),
  ...cartridge.signatures.map(signature => ({
    cid: signature.descriptor.block,
    bytes: signature.bytes
  }))
]);

const verifyOuterBlock = async (
  block: PrivateInventoryCarBlock
): Promise<TeleportResult<PrivateInventoryCarBlock>> => {
  const digest = await digestPrivateInventoryBytes(block.bytes, UNLOCK_FAILED);
  return !digest.ok
    ? digest
    : equalBytes(digest.value, block.cid.multihash.bytes)
      ? ok(block)
      : err({
        code: 'cid-mismatch',
        message: 'Private inventory block bytes do not match their CID.'
      });
};

export const createPrivateInventoryCartridge = async (
  archive: TeleportCartridgeArchive,
  passphrase: string
): Promise<TeleportResult<PrivateInventoryCartridgeArchive>> => {
  if (!passphrase) return err({
    code: 'capability-invalid',
    message: 'A private-inventory passphrase is required.'
  });
  const verified = await verifyTeleportCartridge(archive.bytes);
  if (!verified.ok) return verified;
  const random = await createPrivateInventoryRandomMaterial(CREATE_FAILED);
  if (!random.ok) return random;
  const encrypted = await encryptPrivateInventoryBytes({
    passphrase,
    manifest: archive.root,
    salt: random.value.salt,
    iv: random.value.iv,
    bytes: archive.rootBytes
  }, CREATE_FAILED);
  if (!encrypted.ok) return encrypted;
  const inventory = await createPrivateInventoryCid(raw.code, encrypted.value, CREATE_FAILED);
  if (!inventory.ok) return inventory;
  const locator: PrivateInventoryLocatorV1 = {
    type: 'wx-teleport-private-inventory',
    version: 1,
    manifest: archive.root,
    inventory: inventory.value,
    kdf: {
      name: 'PBKDF2',
      hash: 'SHA-256',
      iterations: ITERATIONS,
      salt: random.value.salt
    },
    encryption: { name: 'AES-GCM', iv: random.value.iv }
  };
  const locatorBytes = await encodePrivateInventoryDagCbor(locator, CREATE_FAILED);
  if (!locatorBytes.ok) return locatorBytes;
  const root = await createPrivateInventoryCid(dagCbor.code, locatorBytes.value, CREATE_FAILED);
  if (!root.ok) return root;
  const bytes = await writePrivateInventoryCar(root.value, [
    { cid: root.value, bytes: locatorBytes.value },
    { cid: inventory.value, bytes: encrypted.value },
    ...verifiedGraphBlocks(verified.value)
  ], CREATE_FAILED);
  return bytes.ok
    ? ok({ bytes: bytes.value, root: root.value, locator })
    : bytes;
};

export const unlockPrivateInventoryCartridge = async (
  bytes: Uint8Array,
  passphrase: string
): Promise<TeleportResult<VerifiedTeleportCartridge>> => {
  if (!passphrase) return err({
    code: 'decode-failed',
    message: 'A private-inventory passphrase is required.'
  });
  const car = await readPrivateInventoryCar(bytes, UNLOCK_FAILED);
  if (!car.ok) return car;
  if (car.value.roots.length !== 1) return err({
    code: 'car-invalid',
    message: 'Private inventory CAR must have one root.'
  });
  const blockIds: readonly string[] = car.value.blocks.map(block => block.cid.toString());
  if (new Set(blockIds).size !== blockIds.length) return err({
    code: 'car-invalid',
    message: 'Private inventory CAR contains a duplicate block.'
  });
  const verifiedBlocks: readonly TeleportResult<PrivateInventoryCarBlock>[] = await Promise.all(
    car.value.blocks.map(verifyOuterBlock)
  );
  const invalidBlock = verifiedBlocks.find(result => !result.ok);
  if (invalidBlock !== undefined) return invalidBlock;
  const root = car.value.roots.at(0);
  const rootBlock = root
    ? car.value.blocks.find(block => block.cid.equals(root))
    : undefined;
  if (!root || !rootBlock || root.code !== dagCbor.code) return err({
    code: 'manifest-invalid',
    message: 'Private inventory locator block is missing.'
  });
  const decodedLocator = await decodePrivateInventoryDagCbor(rootBlock.bytes, LOCATOR_INVALID);
  if (!decodedLocator.ok) return decodedLocator;
  const locator = parseLocator(decodedLocator.value);
  if (!locator.ok) return locator;
  const inventoryBlock = car.value.blocks.find(block => block.cid.equals(locator.value.inventory));
  if (!inventoryBlock) return err({
    code: 'missing-block',
    message: 'Encrypted private inventory block is missing.'
  });
  const manifestBytes = await decryptPrivateInventoryBytes({
    passphrase,
    manifest: locator.value.manifest,
    salt: locator.value.kdf.salt,
    iv: locator.value.encryption.iv,
    bytes: inventoryBlock.bytes
  }, UNLOCK_FAILED);
  if (!manifestBytes.ok) return manifestBytes;
  const manifestDigest = await digestPrivateInventoryBytes(manifestBytes.value, UNLOCK_FAILED);
  if (!manifestDigest.ok) return manifestDigest;
  if (!equalBytes(manifestDigest.value, locator.value.manifest.multihash.bytes)) return err({
    code: 'cid-mismatch',
    message: 'Unlocked private inventory does not match its manifest CID.'
  });
  const restoredBytes = await writePrivateInventoryCar(locator.value.manifest, [
    { cid: locator.value.manifest, bytes: manifestBytes.value },
    ...car.value.blocks.filter(block =>
      !block.cid.equals(root) && !block.cid.equals(locator.value.inventory))
  ], UNLOCK_FAILED);
  return restoredBytes.ok
    ? verifyTeleportCartridge(restoredBytes.value)
    : restoredBytes;
};
