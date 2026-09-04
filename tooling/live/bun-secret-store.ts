import {
  createBunSecretStoreAdminPort,
  createBunSecretStoreLeasePort,
  disposeSecretInputScope,
  openSecretInputScope
} from '../../src/broker/bun-secret-store.ts';
import { parseCredentialReference, secretLeaseOk } from '../../src/broker/lease.ts';
import { parseCredentialSlotId } from '../../src/broker/primitives.ts';

const reference = parseCredentialReference(`live-${crypto.randomUUID()}`);
const slotId = parseCredentialSlotId('live-slot');
const inputScope = openSecretInputScope();
const input = inputScope.capture.capture(`nebular-live-${crypto.randomUUID()}`);
if (reference.isErr() || slotId.isErr() || input.isErr()) {
  throw new Error('Live keychain fixture construction failed.');
}

const admin = createBunSecretStoreAdminPort();
const reader = createBunSecretStoreLeasePort();
const stored = await admin.store(reference.value, input.value, inputScope.nonce);
disposeSecretInputScope(inputScope);
if (stored.isErr()) throw new Error(`Live keychain store failed: ${stored.error[0].code}.`);

try {
  const delivery = { completed: false };
  const leased = await reader.withSecret(reference.value, secret => secret.deliverTo({
    install: () => {
      delivery.completed = true;
      return secretLeaseOk(undefined);
    }
  }, { slotId: slotId.value, environmentName: 'NEBULAR_LIVE_TOKEN' }));
  if (leased.isErr() || !delivery.completed) throw new Error('Live keychain lease failed.');
  const deleted = await admin.delete(reference.value);
  if (deleted.isErr() || deleted.value.outcome !== 'deleted') throw new Error('Live keychain delete failed.');
} finally {
  await admin.delete(reference.value);
}

const missing = await reader.withSecret(reference.value, () => secretLeaseOk(undefined));
if (missing.isOk()) throw new Error('Deleted live keychain credential remained readable.');

console.log('Bun.secrets live conformance passed with isolated cleanup.');
