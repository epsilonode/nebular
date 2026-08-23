import { ResultAsync } from 'neverthrow';

import {
  secretLeaseErr,
  secretLeaseOk,
  type CredentialReference,
  type SecretLeaseResult,
  type SecretLeaseTaskResult
} from './lease.ts';
import type {
  BootstrapSecretSink,
  BootstrapSecretSlot,
  ScopedSecret,
  SecretStoreLeasePort
} from './secret-delivery.ts';

export const BUN_SECRET_SERVICE = 'dev.epsilonode.nebular.broker.v1' as const;

export type BunSecretsReadPort = Readonly<{
  get: (options: Readonly<{ service: string; name: string }>) => Promise<string | null>;
}>;

export type BunSecretsWritePort = Readonly<{
  set: (options: Readonly<{ service: string; name: string; value: string }>) => Promise<void>;
  delete: (options: Readonly<{ service: string; name: string }>) => Promise<boolean>;
}>;

export type SecretInput = Readonly<{
  storeWith: (write: (secretText: string) => Promise<void>) => Promise<void>;
}>;

export type SecretStoreWriteOutcome = Readonly<{ outcome: 'stored' }>;
export type SecretStoreDeleteOutcome = Readonly<{ outcome: 'deleted' | 'missing' }>;

export type SecretStoreAdminPort = Readonly<{
  store: (reference: CredentialReference, input: SecretInput) => SecretLeaseTaskResult<SecretStoreWriteOutcome>;
  delete: (reference: CredentialReference) => SecretLeaseTaskResult<SecretStoreDeleteOutcome>;
}>;

export const createSecretInput = (secretText: unknown): SecretLeaseResult<SecretInput> =>
  typeof secretText === 'string' && secretText.length > 0 && !secretText.includes('\0')
    ? secretLeaseOk({ storeWith: write => write(secretText) })
    : secretLeaseErr({ code: 'secret-input-invalid', message: 'Credential input is invalid.' });

const bytesToHex = (bytes: Uint8Array): string =>
  Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');

export const deriveBunSecretName = (reference: CredentialReference): Promise<string> =>
  crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`epsilonode.nebular.credential-reference/v1\0${reference.value}`)
  ).then(digest => `credential-${bytesToHex(new Uint8Array(digest))}`);

const scopedSecret = (secretText: string): ScopedSecret => ({
  deliverTo: (sink: BootstrapSecretSink, slot: BootstrapSecretSlot): SecretLeaseResult<void> =>
    sink.install(slot, secretText)
});

const unavailable = (): SecretLeaseResult<void> => secretLeaseErr({
  code: 'secret-unavailable',
  message: 'The requested operating-system credential is unavailable.'
});

const storeFailed = <T>(): SecretLeaseResult<T> => secretLeaseErr({
  code: 'secret-store-failed',
  message: 'The operating-system credential operation failed.'
});

const readAndUseSecret = (
  runtime: BunSecretsReadPort,
  name: string,
  use: (secret: ScopedSecret) => SecretLeaseResult<void>
): Promise<SecretLeaseResult<void>> => runtime.get({ service: BUN_SECRET_SERVICE, name }).then(
  value => value === null ? unavailable() : use(scopedSecret(value)),
  unavailable
);

export const createBunSecretStoreLeasePort = (
  runtime: BunSecretsReadPort = Bun.secrets
): SecretStoreLeasePort => ({
  withSecret: (reference, use): SecretLeaseTaskResult<void> => {
    const operation = deriveBunSecretName(reference).then(
      name => readAndUseSecret(runtime, name, use),
      unavailable
    );
    return ResultAsync.fromSafePromise(operation).andThen(result => result);
  }
});

export const createBunSecretStoreAdminPort = (
  runtime: BunSecretsWritePort = Bun.secrets
): SecretStoreAdminPort => ({
  store: (reference, input) => {
    const operation = deriveBunSecretName(reference).then(
      name => input.storeWith(secretText => runtime.set({
        service: BUN_SECRET_SERVICE,
        name,
        value: secretText
      })).then(
        () => secretLeaseOk<SecretStoreWriteOutcome>({ outcome: 'stored' }),
        () => storeFailed<SecretStoreWriteOutcome>()
      ),
      () => storeFailed<SecretStoreWriteOutcome>()
    );
    return ResultAsync.fromSafePromise(operation).andThen(result => result);
  },
  delete: reference => {
    const operation = deriveBunSecretName(reference).then(
      name => runtime.delete({ service: BUN_SECRET_SERVICE, name }).then(
        deleted => secretLeaseOk<SecretStoreDeleteOutcome>({ outcome: deleted ? 'deleted' : 'missing' }),
        () => storeFailed<SecretStoreDeleteOutcome>()
      ),
      () => storeFailed<SecretStoreDeleteOutcome>()
    );
    return ResultAsync.fromSafePromise(operation).andThen(result => result);
  }
});
