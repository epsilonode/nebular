import { describe, expect, it } from 'vitest';

import {
  BUN_SECRET_SERVICE,
  SECRET_INPUT_MAX_CODE_UNITS,
  createBunSecretStoreAdminPort,
  createBunSecretStoreLeasePort,
  disposeSecretInputScope,
  deriveBunSecretName,
  openSecretInputScope,
  sealSecretInputScope,
  type SecretInputScope,
  type SecretInput
} from './bun-secret-store.ts';
import { parseCredentialReference, secretLeaseOk } from './lease.ts';
import { parseCredentialSlotId } from './primitives.ts';
import type { ScopedSecret } from './secret-delivery.ts';

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

const capturedInput = (secretText: unknown): Readonly<{
  scope: SecretInputScope;
  input: SecretInput;
}> => {
  const scope = openSecretInputScope();
  const captured = scope.capture.capture(secretText);
  if (captured.isErr()) throw new Error('typed secret input fixture failed');
  return { scope, input: captured.value };
};

const secretName = async (): Promise<string> => {
  const derived = await deriveBunSecretName(reference);
  if (derived.isErr()) throw new Error('typed secret name fixture failed');
  return derived.value;
};

describe('Bun SecretStore adapter', () => {
  it('derives stable non-secret OS keychain coordinates', async () => {
    const first = await deriveBunSecretName(reference);
    const second = await deriveBunSecretName(reference);
    expect(first.isOk()).toBe(true);
    expect(second.isOk()).toBe(true);
    if (first.isErr() || second.isErr()) return;
    expect(first.value).toBe(second.value);
    expect(first.value).toMatch(/^credential-[a-f0-9]{64}$/);
    expect(first.value).not.toContain(reference.value);
  });

  it('rejects ill-formed UTF-16 before TextEncoder can collapse distinct references', async () => {
    const illFormedText = String.fromCharCode(0xD800);
    const replacementText = String.fromCharCode(0xFFFD);
    expect([...new TextEncoder().encode(illFormedText)])
      .toEqual([...new TextEncoder().encode(replacementText)]);
    const illFormed = parseCredentialReference(illFormedText);
    const replacement = parseCredentialReference(replacementText);
    if (illFormed.isErr() || replacement.isErr()) throw new Error('collision fixture failed');

    const rejected = await deriveBunSecretName(illFormed.value);
    const admitted = await deriveBunSecretName(replacement.value);

    expect(rejected).toEqual(expect.objectContaining({
      error: [expect.objectContaining({ code: 'lease-invalid' })]
    }));
    expect(admitted.isOk()).toBe(true);
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
    expect(reads).toEqual([{ service: BUN_SECRET_SERVICE, name: await secretName() }]);
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

  it.each([
    '',
    'prefix\0suffix',
    String.fromCharCode(0xD800),
    'x'.repeat(SECRET_INPUT_MAX_CODE_UNITS + 1),
    undefined
  ])('rejects malformed keychain value %j before opening the scoped callback', async value => {
    let callbackCalls = 0;
    const result = await createBunSecretStoreLeasePort({
      get: () => Promise.resolve(value as string | null)
    }).withSecret(reference, () => {
      callbackCalls += 1;
      return secretLeaseOk(undefined);
    });

    expect(result).toEqual(expect.objectContaining({
      error: [expect.objectContaining({ code: 'secret-unavailable' })]
    }));
    expect(callbackCalls).toBe(0);
  });

  it('revokes a retained scoped handle at callback return', async () => {
    let retained: ScopedSecret | undefined;
    const installed: string[] = [];
    const sink = {
      install: (_slot: unknown, value: string) => {
        installed.push(value);
        return secretLeaseOk(undefined);
      }
    };
    const result = await createBunSecretStoreLeasePort({
      get: () => Promise.resolve('single-use-value')
    }).withSecret(reference, secret => {
      retained = secret;
      return secret.deliverTo(sink, { slotId, environmentName: 'WEATHER_API_TOKEN' });
    });
    if (retained === undefined) throw new Error('scoped handle fixture failed');
    const afterReturn = retained.deliverTo(sink, { slotId, environmentName: 'WEATHER_API_TOKEN' });

    expect(result.isOk()).toBe(true);
    expect(afterReturn).toEqual(expect.objectContaining({
      error: [expect.objectContaining({ code: 'secret-unavailable' })]
    }));
    expect(installed).toEqual(['single-use-value']);
  });

  it('rejects zero delivery and an ignored second delivery attempt', async () => {
    const port = createBunSecretStoreLeasePort({ get: () => Promise.resolve('single-use-value') });
    const zero = await port.withSecret(reference, () => secretLeaseOk(undefined));
    const installed: string[] = [];
    const twice = await port.withSecret(reference, secret => {
      const first = secret.deliverTo({
        install: (_slot, value) => {
          installed.push(value);
          return secretLeaseOk(undefined);
        }
      }, { slotId, environmentName: 'WEATHER_API_TOKEN' });
      secret.deliverTo({ install: () => secretLeaseOk(undefined) }, {
        slotId,
        environmentName: 'WEATHER_API_TOKEN'
      });
      return first;
    });

    expect(zero).toEqual(expect.objectContaining({
      error: [expect.objectContaining({ code: 'bootstrap-rejected' })]
    }));
    expect(twice).toEqual(expect.objectContaining({
      error: [expect.objectContaining({ code: 'bootstrap-rejected' })]
    }));
    expect(installed).toEqual(['single-use-value']);
  });

  it('bounds hung reads and closes synchronous foreign throws as redacted failures', async () => {
    const startedAt = Date.now();
    const hung = await createBunSecretStoreLeasePort({
      get: () => new Promise(() => undefined)
    }, { operationTimeoutMs: 20 }).withSecret(reference, () => secretLeaseOk(undefined));
    const thrown = await createBunSecretStoreLeasePort({
      get: () => { throw new Error('SECRET_FOREIGN_READ_DETAIL'); }
    }).withSecret(reference, () => secretLeaseOk(undefined));

    expect(Date.now() - startedAt).toBeLessThan(1_000);
    expect(hung).toEqual(expect.objectContaining({
      error: [expect.objectContaining({ code: 'secret-unavailable' })]
    }));
    expect(thrown).toEqual(expect.objectContaining({
      error: [expect.objectContaining({ code: 'secret-unavailable' })]
    }));
    expect(JSON.stringify({ hung, thrown })).not.toContain('SECRET_FOREIGN_READ_DETAIL');
  });

  it('stores and deletes through opaque coordinates without serializing input', async () => {
    const canary = 'SECRET_CANARY_ADMIN_VALUE';
    const captured = capturedInput(canary);
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

    expect((await admin.store(reference, captured.input, captured.scope.nonce)).isOk()).toBe(true);
    expect((await admin.delete(reference)).isOk()).toBe(true);
    const name = await secretName();
    expect(writes).toEqual([{ service: BUN_SECRET_SERVICE, name, value: canary }]);
    expect(deletes).toEqual([{ service: BUN_SECRET_SERVICE, name }]);
    expect(JSON.stringify(captured.input)).toBe('{}');
  });

  it('bounds secret input by UTF-16 code units before constructing the opaque value', () => {
    const scope = openSecretInputScope();
    const exactBoundary = scope.capture.capture('\u{1F600}'.repeat(SECRET_INPUT_MAX_CODE_UNITS / 2));
    const overBoundary = scope.capture.capture(`${'\u{1F600}'.repeat(SECRET_INPUT_MAX_CODE_UNITS / 2)}x`);
    const nul = scope.capture.capture('prefix\0suffix');
    const illFormed = scope.capture.capture(String.fromCharCode(0xD800));

    expect(exactBoundary.isOk()).toBe(true);
    expect(overBoundary).toEqual(expect.objectContaining({
      error: [expect.objectContaining({ code: 'secret-input-invalid' })]
    }));
    expect(nul).toEqual(expect.objectContaining({
      error: [expect.objectContaining({ code: 'secret-input-invalid' })]
    }));
    expect(illFormed).toEqual(expect.objectContaining({
      error: [expect.objectContaining({ code: 'secret-input-invalid' })]
    }));
    disposeSecretInputScope(scope);
  });

  it.each([
    ['zero-write', {
      storeWith: () => Promise.resolve()
    }],
    ['multiple-write', {
      storeWith: (write: (secretText: string) => Promise<void>) => Promise.all([
        write('first'),
        write('second'),
        write(`oversized-${'x'.repeat(SECRET_INPUT_MAX_CODE_UNITS)}`),
        write('nul\0value')
      ]).then(() => undefined)
    }]
  ] as const)('rejects a fabricated %s callback handle before invoking the keychain runtime', async (
    _attack,
    fabricated
  ) => {
    const writes: string[] = [];
    const admin = createBunSecretStoreAdminPort({
      set: options => {
        writes.push(options.value);
        return Promise.resolve();
      },
      delete: () => Promise.resolve(false)
    });

    const scope = openSecretInputScope();
    const result = await admin.store(reference, fabricated as unknown as SecretInput, scope.nonce);

    expect(result).toEqual(expect.objectContaining({
      error: [expect.objectContaining({ code: 'secret-input-invalid' })]
    }));
    expect(writes).toEqual([]);
  });

  it('rejects a copied genuine handle while preserving the original identity', async () => {
    const canary = 'SECRET_CANARY_COPY_IDENTITY';
    const captured = capturedInput(canary);
    const copy = Object.freeze({ ...captured.input }) as SecretInput;
    const writes: string[] = [];
    const admin = createBunSecretStoreAdminPort({
      set: options => {
        writes.push(options.value);
        return Promise.resolve();
      },
      delete: () => Promise.resolve(false)
    });

    const copiedResult = await admin.store(reference, copy, captured.scope.nonce);
    const genuineResult = await admin.store(reference, captured.input, captured.scope.nonce);

    expect(copiedResult).toEqual(expect.objectContaining({
      error: [expect.objectContaining({ code: 'secret-input-invalid' })]
    }));
    expect(genuineResult.isOk()).toBe(true);
    expect(writes).toEqual([canary]);
  });

  it('freezes the public handle so mutation cannot replace the registered secret', async () => {
    const canary = 'SECRET_CANARY_FROZEN_HANDLE';
    const captured = capturedInput(canary);
    const writes: string[] = [];
    const admin = createBunSecretStoreAdminPort({
      set: options => {
        writes.push(options.value);
        return Promise.resolve();
      },
      delete: () => Promise.resolve(false)
    });

    const mutated = Reflect.set(captured.input, 'storeWith', (
      write: (secretText: string) => Promise<void>
    ) => write('attacker-controlled'));
    const result = await admin.store(reference, captured.input, captured.scope.nonce);

    expect(Object.isFrozen(captured.input)).toBe(true);
    expect(mutated).toBe(false);
    expect(result.isOk()).toBe(true);
    expect(writes).toEqual([canary]);
  });

  it('atomically consumes a genuine handle once across concurrent and later reuse', async () => {
    const canary = 'SECRET_CANARY_SINGLE_CONSUME';
    const captured = capturedInput(canary);
    const writes: string[] = [];
    const admin = createBunSecretStoreAdminPort({
      set: options => {
        writes.push(options.value);
        return Promise.resolve();
      },
      delete: () => Promise.resolve(false)
    });

    const concurrent = await Promise.all([
      admin.store(reference, captured.input, captured.scope.nonce),
      admin.store(reference, captured.input, captured.scope.nonce)
    ]);
    const reused = await admin.store(reference, captured.input, captured.scope.nonce);

    expect(concurrent.filter(result => result.isOk())).toHaveLength(1);
    expect(concurrent.filter(result => result.isErr())).toHaveLength(1);
    expect(reused).toEqual(expect.objectContaining({
      error: [expect.objectContaining({ code: 'secret-input-invalid' })]
    }));
    expect(writes).toEqual([canary]);
  });

  it('binds genuine inputs to one scope and disposes or seals every remaining handle', async () => {
    const first = capturedInput('first-scope-secret');
    const second = capturedInput('second-scope-secret');
    const writes: string[] = [];
    const admin = createBunSecretStoreAdminPort({
      set: options => {
        writes.push(options.value);
        return Promise.resolve();
      },
      delete: () => Promise.resolve(false)
    });

    const crossScope = await admin.store(reference, first.input, second.scope.nonce);
    sealSecretInputScope(first.scope);
    const lateCapture = first.scope.capture.capture('late-secret');
    const original = await admin.store(reference, first.input, first.scope.nonce);
    disposeSecretInputScope(second.scope);
    const disposed = await admin.store(reference, second.input, second.scope.nonce);

    expect(crossScope).toEqual(expect.objectContaining({
      error: [expect.objectContaining({ code: 'secret-input-invalid' })]
    }));
    expect(lateCapture).toEqual(expect.objectContaining({
      error: [expect.objectContaining({ code: 'secret-input-invalid' })]
    }));
    expect(original.isOk()).toBe(true);
    expect(disposed).toEqual(expect.objectContaining({
      error: [expect.objectContaining({ code: 'secret-input-invalid' })]
    }));
    expect(writes).toEqual(['first-scope-secret']);
  });

  it('bounds hung writes and maps synchronous write/delete throws without leaking details', async () => {
    const hungInput = capturedInput('SECRET_HUNG_WRITE_VALUE');
    const hungAdmin = createBunSecretStoreAdminPort({
      set: () => new Promise(() => undefined),
      delete: () => Promise.resolve(false)
    }, { operationTimeoutMs: 20 });
    const hung = await hungAdmin.store(reference, hungInput.input, hungInput.scope.nonce);
    const thrownInput = capturedInput('SECRET_THROWN_WRITE_VALUE');
    const throwingAdmin = createBunSecretStoreAdminPort({
      set: () => { throw new Error('SECRET_THROWN_WRITE_DETAIL'); },
      delete: () => { throw new Error('SECRET_THROWN_DELETE_DETAIL'); }
    });
    const thrownStore = await throwingAdmin.store(reference, thrownInput.input, thrownInput.scope.nonce);
    const thrownDelete = await throwingAdmin.delete(reference);

    expect(hung).toEqual(expect.objectContaining({
      error: [expect.objectContaining({ code: 'secret-store-failed' })]
    }));
    expect(thrownStore).toEqual(expect.objectContaining({
      error: [expect.objectContaining({ code: 'secret-store-failed' })]
    }));
    expect(thrownDelete).toEqual(expect.objectContaining({
      error: [expect.objectContaining({ code: 'secret-store-failed' })]
    }));
    expect(JSON.stringify({ hung, thrownStore, thrownDelete }))
      .not.toMatch(/SECRET_(?:HUNG|THROWN)/u);
  });
});
