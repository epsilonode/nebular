import { err, ok, type TeleportResult } from './result';
import type { TeleportRecipientKeyProvider } from './key-provider';

const KEY_STORE = 'recipient-keys';
const validKeyId = (keyId: string): boolean => /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(keyId);
const validProviderId = (providerId: string): boolean => /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(providerId);

const isStoredKeyPair = (value: unknown): value is CryptoKeyPair => {
  if (typeof value !== 'object' || value === null) return false;
  const pair = value as Partial<CryptoKeyPair>;
  return pair.publicKey?.type === 'public'
    && pair.publicKey.algorithm.name === 'RSA-OAEP'
    && pair.publicKey.usages.includes('encrypt')
    && pair.privateKey?.type === 'private'
    && pair.privateKey.algorithm.name === 'RSA-OAEP'
    && pair.privateKey.extractable === false
    && pair.privateKey.usages.includes('decrypt');
};

const requestResult = <T>(request: IDBRequest<T>): Promise<T> => new Promise((resolve, reject) => {
  request.addEventListener('success', () => resolve(request.result), { once: true });
  request.addEventListener('error', () => reject(request.error ?? new Error('IndexedDB request failed.')), { once: true });
});

const transactionDone = (transaction: IDBTransaction): Promise<void> => new Promise((resolve, reject) => {
  transaction.addEventListener('complete', () => resolve(), { once: true });
  transaction.addEventListener('abort', () => reject(transaction.error ?? new Error('IndexedDB transaction aborted.')), { once: true });
  transaction.addEventListener('error', () => reject(transaction.error ?? new Error('IndexedDB transaction failed.')), { once: true });
});

export interface BrowserDeviceKeyProviderOptions {
  readonly providerId?: string;
  readonly databaseName?: string;
}

/** Browser platform adapter that retains non-extractable RSA private keys in IndexedDB. */
export class BrowserDeviceRecipientKeyProvider implements TeleportRecipientKeyProvider {
  readonly providerId: string;
  readonly #databaseName: string;
  readonly #pending = new Map<string, Promise<TeleportResult<CryptoKeyPair>>>();

  constructor(options: BrowserDeviceKeyProviderOptions = {}) {
    this.providerId = options.providerId ?? 'browser-device';
    this.#databaseName = options.databaseName ?? 'wx-teleport-device-keys-v1';
    if (!validProviderId(this.providerId)) throw new Error('Device key provider id is invalid.');
  }

  async #database(): Promise<IDBDatabase> {
    const request = indexedDB.open(this.#databaseName, 1);
    request.addEventListener('upgradeneeded', () => {
      if (!request.result.objectStoreNames.contains(KEY_STORE)) request.result.createObjectStore(KEY_STORE);
    }, { once: true });
    return requestResult(request);
  }

  async #load(keyId: string): Promise<CryptoKeyPair | undefined> {
    const database = await this.#database();
    try {
      const transaction = database.transaction(KEY_STORE, 'readonly');
      const value = await requestResult<unknown>(transaction.objectStore(KEY_STORE).get(keyId));
      await transactionDone(transaction);
      if (value === undefined) return undefined;
      if (!isStoredKeyPair(value)) throw new Error('Stored device recipient key is invalid.');
      return value;
    } finally { database.close(); }
  }

  async #create(keyId: string): Promise<CryptoKeyPair> {
    const generated = await crypto.subtle.generateKey(
      { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
      false,
      ['encrypt', 'decrypt']
    );
    const database = await this.#database();
    let conflicted = false;
    try {
      const transaction = database.transaction(KEY_STORE, 'readwrite');
      try {
        await requestResult(transaction.objectStore(KEY_STORE).add(generated, keyId));
        await transactionDone(transaction);
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === 'ConstraintError') conflicted = true;
        else throw cause;
      }
    } finally { database.close(); }
    if (!conflicted) return generated;
    const winner = await this.#load(keyId);
    if (!winner) throw new Error('Concurrent device recipient key creation failed.');
    return winner;
  }

  async #getOrCreate(keyId: string): Promise<TeleportResult<CryptoKeyPair>> {
    if (!validKeyId(keyId)) return err({ code: 'policy-rejected', message: 'Device recipient key id is invalid.' });
    const existing = this.#pending.get(keyId);
    if (existing) return existing;
    const operation = (async (): Promise<TeleportResult<CryptoKeyPair>> => {
      try {
        return ok((await this.#load(keyId)) ?? await this.#create(keyId));
      } catch {
        return err({ code: 'execution-failed', message: 'Device recipient key storage is unavailable.' });
      } finally { this.#pending.delete(keyId); }
    })();
    this.#pending.set(keyId, operation);
    return operation;
  }

  async getPublicKey(keyId: string): Promise<TeleportResult<CryptoKey>> {
    const pair = await this.#getOrCreate(keyId);
    return pair.ok ? ok(pair.value.publicKey) : pair;
  }

  async getPrivateKey(keyId: string): Promise<TeleportResult<CryptoKey>> {
    const pair = await this.#getOrCreate(keyId);
    return pair.ok ? ok(pair.value.privateKey) : pair;
  }

  async deleteKey(keyId: string): Promise<TeleportResult<void>> {
    if (!validKeyId(keyId)) return err({ code: 'policy-rejected', message: 'Device recipient key id is invalid.' });
    try {
      const database = await this.#database();
      try {
        const transaction = database.transaction(KEY_STORE, 'readwrite');
        transaction.objectStore(KEY_STORE).delete(keyId);
        await transactionDone(transaction);
      } finally { database.close(); }
      return ok(undefined);
    } catch {
      return err({ code: 'execution-failed', message: 'Device recipient key storage is unavailable.' });
    }
  }
}
