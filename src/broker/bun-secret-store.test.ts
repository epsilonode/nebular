import { describe, expect, it } from 'vitest';

import {
  BUN_SECRET_SERVICE,
  createBunSecretStoreAdminPort,
  createBunSecretStoreLeasePort,
  createSecretInput,
  deriveBunSecretName
} from './bun-secret-store.ts';
import { parseCredentialReference, secretLeaseOk } from './lease.ts';
import { parseCredentialSlotId } from './primitives.ts';

const reference = (() => {
  const parsed = parseCredentialReference('credential-1');
  if (parsed.isErr()) throw new Error('typed credential reference fixture failed');
  return parsed.value;
})();
const slotId = (() => {
  const parsed = parseCredentialSlotId('weather-api');
  if (parsed.isErr()) throw new Error('typed credential slot fixture failed');
  return parsed.value;
})();

describe('Bun SecretStore adapter', () => {
  it('derives stable non-secret OS keychain coordinates', async () => {
    const first = await deriveBunSecretName(reference);
    const second = await deriveBunSecretName(reference);
    expect(first).toBe(second);
    expect(first).toMatch(/^credential-[a-f0-9]{64}$/);
    expect(first).not.toContain(reference.value);
  });

  it('keeps the keychain value inside the scoped delivery callback', async () => {
    const canary = 'SECRET_CANARY_KEYCHAIN_VALUE';
    const reads: Array<Readonly<{ service: string; name: string }>> = [];
    const store = createBunSecretStoreLeasePort({
      get: options => {
        reads.push(options);
        return Promise.resolve(canary);
      }
    });
    let received = '';
    const result = await store.withSecret(reference, secret => secret.deliverTo({
      install: (_slot, value) => {
        received = value;
        return secretLeaseOk(undefined);
      }
    }, { slotId, environmentName: 'WEATHER_API_TOKEN' }));

    expect(result.isOk()).toBe(true);
    expect(received).toBe(canary);
    expect(reads).toEqual([{ service: BUN_SECRET_SERVICE, name: await deriveBunSecretName(reference) }]);
    expect(JSON.stringify({ result, store })).not.toContain(canary);
  });

  it('maps missing and rejected keychain reads to the same redacted issue', async () => {
    const missing = await createBunSecretStoreLeasePort({ get: () => Promise.resolve(null) })
      .withSecret(reference, () => secretLeaseOk(undefined));
    const rejected = await createBunSecretStoreLeasePort({ get: () => Promise.reject(new Error('foreign detail')) })
      .withSecret(reference, () => secretLeaseOk(undefined));

    expect(missing).toEqual(expect.objectContaining({ error: [expect.objectContaining({ code: 'secret-unavailable' })] }));
    expect(rejected).toEqual(expect.objectContaining({ error: [expect.objectContaining({ code: 'secret-unavailable' })] }));
  });

  it('stores and deletes through opaque coordinates without serializing input', async () => {
    const canary = 'SECRET_CANARY_ADMIN_VALUE';
    const input = createSecretInput(canary);
    if (input.isErr()) throw new Error('typed secret input fixture failed');
    const writes: Array<Readonly<{ service: string; name: string; value: string }>> = [];
    const deletes: Array<Readonly<{ service: string; name: string }>> = [];
    const admin = createBunSecretStoreAdminPort({
      set: options => {
        writes.push(options);
        return Promise.resolve();
      },
      delete: options => {
        deletes.push(options);
        return Promise.resolve(true);
      }
    });

    expect((await admin.store(reference, input.value)).isOk()).toBe(true);
    expect((await admin.delete(reference)).isOk()).toBe(true);
    const name = await deriveBunSecretName(reference);
    expect(writes).toEqual([{ service: BUN_SECRET_SERVICE, name, value: canary }]);
    expect(deletes).toEqual([{ service: BUN_SECRET_SERVICE, name }]);
    expect(JSON.stringify(input.value)).toBe('{}');
  });
});
