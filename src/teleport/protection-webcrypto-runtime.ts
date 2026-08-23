import * as dagCbor from '@ipld/dag-cbor';
import { coerce } from 'multiformats/bytes';
import { CID } from 'multiformats/cid';
import * as raw from 'multiformats/codecs/raw';
import { sha256 } from 'multiformats/hashes/sha2';
import { fromAsyncThrowable, fromThrowable } from 'neverthrow';

import { err, ok, type TeleportIssue, type TeleportResult } from './result';

const encoder = new TextEncoder();

const arrayBuffer = (bytes: Uint8Array): ArrayBuffer => Uint8Array.from(bytes).buffer;

const attempt = <T>(
  effect: () => T,
  issue: TeleportIssue
): TeleportResult<T> => fromThrowable(effect, () => issue)().match(ok, caught => err(caught));

const attemptAsync = async <T>(
  effect: () => Promise<T>,
  issue: TeleportIssue
): Promise<TeleportResult<T>> => (
  await fromAsyncThrowable(effect, () => issue)()
).match(ok, caught => err(caught));

export const runProtectionEffect = async <T>(
  effect: () => Promise<TeleportResult<T>>,
  issue: TeleportIssue
): Promise<TeleportResult<T>> => (
  await fromAsyncThrowable(effect, () => issue)()
).match(result => result, caught => err(caught));

export const protectionRandomId = (issue: TeleportIssue): TeleportResult<string> => attempt(
  () => typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : [...crypto.getRandomValues(new Uint8Array(16))]
      .map(byte => byte.toString(16).padStart(2, '0'))
      .join(''),
  issue
);

export const protectionRandomBytes = (
  byteLength: number,
  issue: TeleportIssue
): TeleportResult<Uint8Array> => attempt(
  () => crypto.getRandomValues(new Uint8Array(byteLength)),
  issue
);

export const protectionEncode = (
  value: unknown,
  issue: TeleportIssue
): TeleportResult<Uint8Array> => attempt(
  () => coerce(dagCbor.encode(value)),
  issue
);

export const protectionDecode = (
  bytes: Uint8Array,
  issue: TeleportIssue
): TeleportResult<unknown> => attempt(
  () => dagCbor.decode(bytes),
  issue
);

export const protectionRawCid = async (
  bytes: Uint8Array,
  issue: TeleportIssue
): Promise<TeleportResult<CID>> => {
  const digest = await attemptAsync(() => Promise.resolve(sha256.digest(bytes)), issue);
  return digest.ok
    ? attempt(() => CID.createV1(raw.code, digest.value), issue)
    : digest;
};

export const protectionBytesMatchCid = async (
  bytes: Uint8Array,
  expected: CID,
  issue: TeleportIssue
): Promise<TeleportResult<boolean>> => {
  const digest = await attemptAsync(() => Promise.resolve(sha256.digest(bytes)), issue);
  return digest.ok
    ? attempt(() => CID.createV1(expected.code, digest.value).equals(expected), issue)
    : digest;
};

const importAesKey = (
  bytes: Uint8Array,
  usages: readonly KeyUsage[],
  issue: TeleportIssue
) => attemptAsync(
  () => crypto.subtle.importKey('raw', arrayBuffer(bytes), { name: 'AES-GCM' }, false, [...usages]),
  issue
);

const aesParameters = (
  iv: Uint8Array,
  additionalData?: Uint8Array
): Readonly<AesGcmParams> => additionalData === undefined
  ? { name: 'AES-GCM', iv: arrayBuffer(iv), tagLength: 128 }
  : { name: 'AES-GCM', iv: arrayBuffer(iv), additionalData: arrayBuffer(additionalData), tagLength: 128 };

export const protectionEncryptAes = async (
  keyBytes: Uint8Array,
  plaintext: Uint8Array,
  iv: Uint8Array,
  additionalData: Uint8Array | undefined,
  issue: TeleportIssue
): Promise<TeleportResult<Uint8Array>> => {
  const key = await importAesKey(keyBytes, ['encrypt'], issue);
  return key.ok
    ? attemptAsync(
      async () => new Uint8Array(await crypto.subtle.encrypt(
        aesParameters(iv, additionalData),
        key.value,
        arrayBuffer(plaintext)
      )),
      issue
    )
    : key;
};

export const protectionDecryptAes = async (
  keyBytes: Uint8Array,
  ciphertext: Uint8Array,
  iv: Uint8Array,
  additionalData: Uint8Array | undefined,
  issue: TeleportIssue
): Promise<TeleportResult<Uint8Array>> => {
  const key = await importAesKey(keyBytes, ['decrypt'], issue);
  return key.ok
    ? attemptAsync(
      async () => new Uint8Array(await crypto.subtle.decrypt(
        aesParameters(iv, additionalData),
        key.value,
        arrayBuffer(ciphertext)
      )),
      issue
    )
    : key;
};

const deriveWrappingKey = async (
  passphrase: string,
  salt: Uint8Array,
  iterations: number,
  usage: KeyUsage,
  issue: TeleportIssue
) => {
  const material = await attemptAsync(
    () => crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey']),
    issue
  );
  return material.ok
    ? attemptAsync(
      () => crypto.subtle.deriveKey(
        { name: 'PBKDF2', hash: 'SHA-256', iterations, salt: arrayBuffer(salt) },
        material.value,
        { name: 'AES-GCM', length: 256 },
        false,
        [usage]
      ),
      issue
    )
    : material;
};

export const protectionEncryptWithPassphrase = async (
  passphrase: string,
  salt: Uint8Array,
  iterations: number,
  plaintext: Uint8Array,
  iv: Uint8Array,
  issue: TeleportIssue
): Promise<TeleportResult<Uint8Array>> => {
  const key = await deriveWrappingKey(passphrase, salt, iterations, 'encrypt', issue);
  return key.ok
    ? attemptAsync(
      async () => new Uint8Array(await crypto.subtle.encrypt(
        aesParameters(iv),
        key.value,
        arrayBuffer(plaintext)
      )),
      issue
    )
    : key;
};

export const protectionDecryptWithPassphrase = async (
  passphrase: string,
  salt: Uint8Array,
  iterations: number,
  ciphertext: Uint8Array,
  iv: Uint8Array,
  issue: TeleportIssue
): Promise<TeleportResult<Uint8Array>> => {
  const key = await deriveWrappingKey(passphrase, salt, iterations, 'decrypt', issue);
  return key.ok
    ? attemptAsync(
      async () => new Uint8Array(await crypto.subtle.decrypt(
        aesParameters(iv),
        key.value,
        arrayBuffer(ciphertext)
      )),
      issue
    )
    : key;
};

export const protectionEncryptForRecipient = (
  publicKey: CryptoKey,
  plaintext: Uint8Array,
  issue: TeleportIssue
): Promise<TeleportResult<Uint8Array>> => attemptAsync(
  async () => new Uint8Array(await crypto.subtle.encrypt(
    { name: 'RSA-OAEP' },
    publicKey,
    arrayBuffer(plaintext)
  )),
  issue
);

export const protectionDecryptForRecipient = (
  privateKey: CryptoKey,
  ciphertext: Uint8Array,
  issue: TeleportIssue
): Promise<TeleportResult<Uint8Array>> => attemptAsync(
  async () => new Uint8Array(await crypto.subtle.decrypt(
    { name: 'RSA-OAEP' },
    privateKey,
    arrayBuffer(ciphertext)
  )),
  issue
);

export const isRsaOaepKey = (key: CryptoKey): boolean => key.algorithm.name === 'RSA-OAEP';
