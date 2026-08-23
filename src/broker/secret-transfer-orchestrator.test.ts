import { describe, expect, it } from 'vitest';

import {
  createTeleportCodecRegistryWith,
  ok as teleportOk,
  teleportCodecFromRegistry
} from '../teleport/public.ts';
import { parseCredentialReference } from './lease.ts';
import {
  parseJournalOperationId,
  parseTransferId
} from './journal.ts';
import {
  parseCanonicalRepository,
  parseRecipeRevision
} from './primitives.ts';
import {
  exportEncryptedSecretTransfer,
  importEncryptedSecretTransfer,
  type SecretTransferExportPorts,
  type SecretTransferImportPorts
} from './secret-transfer-orchestrator.ts';
import {
  SECRET_TRANSFER_CAPABILITY_ID,
  secretTransferCapabilityCodec,
  secretTransferErr,
  type SecretTransferPortableFacts
} from './secret-transfer.ts';

const factsFixture = (): SecretTransferPortableFacts => {
  const transferId = parseTransferId('transfer-orchestrator-1');
  if (transferId.type === 'err') throw new Error('orchestrator transfer fixture is invalid');
  return {
    transferId: transferId.value,
    provider: 'provider',
    accountId: 'account',
    accountLabel: null,
    environment: 'dev',
    secretKind: 'api-token',
    providerScopes: [],
    intendedRecipientKeyId: 'recipient-expected',
    issuedAtMs: 1_000,
    transferExpiresAtMs: 2_000,
    upstreamExpiresAtMs: null
  };
};

describe('secret-transfer orchestration boundary', () => {
  it('keeps the closed codec independently discoverable by its exact capability identity', () => {
    expect(secretTransferCapabilityCodec.capabilityId).toBe(SECRET_TRANSFER_CAPABILITY_ID);
    const registry = createTeleportCodecRegistryWith(secretTransferCapabilityCodec);
    if (!registry.ok) throw new Error('secret-transfer codec registry fixture failed');
    expect(teleportCodecFromRegistry(registry.value, SECRET_TRANSFER_CAPABILITY_ID)?.capabilityId)
      .toBe(SECRET_TRANSFER_CAPABILITY_ID);
  });

  it('rejects inconsistent export authority before opening the source secret callback', async () => {
    const rsa = await crypto.subtle.generateKey({
      name: 'RSA-OAEP',
      modulusLength: 2048,
      publicExponent: Uint8Array.of(1, 0, 1),
      hash: 'SHA-256'
    }, false, ['encrypt', 'decrypt']) as CryptoKeyPair;
    const ed = await crypto.subtle.generateKey('Ed25519', false, ['sign', 'verify']) as CryptoKeyPair;
    const reference = parseCredentialReference('credential-source');
    if (reference.isErr()) throw new Error('source reference fixture is invalid');
    let sourceOpened = false;
    const ports: SecretTransferExportPorts = {
      source: {
        withSecret: async () => {
          sourceOpened = true;
          return secretTransferErr({ code: 'source-unavailable', message: 'Unexpected source access.' });
        }
      },
      privateInventory: {
        protect: async () => secretTransferErr({ code: 'car-build-failed', message: 'Unexpected protection.' }),
        unlock: async () => secretTransferErr({
          code: 'private-inventory-rejected',
          message: 'Unexpected unlock.'
        })
      }
    };

    const result = await exportEncryptedSecretTransfer({
      sourceCredentialReference: reference.value,
      facts: factsFixture(),
      recipient: { keyId: 'recipient-other', publicKey: rsa.publicKey },
      signer: { keyId: 'signer-1', privateKey: ed.privateKey, publicKey: ed.publicKey }
    }, ports);

    expect(result).toMatchObject({ type: 'err', issues: [{ code: 'input-invalid' }] });
    expect(sourceOpened).toBe(false);
  });

  it('rejects an empty import before opening private inventory or authority effects', async () => {
    const repository = parseCanonicalRepository('R:/Code/destination');
    const revision = parseRecipeRevision('recipe-revision-1');
    const reference = parseCredentialReference('credential-destination');
    const operationId = parseJournalOperationId('operation-import-1');
    if (repository.isErr() || revision.isErr() || reference.isErr() || operationId.type === 'err') {
      throw new Error('import request fixture is invalid');
    }
    let inventoryOpened = false;
    let authorityOpened = false;
    const ports: SecretTransferImportPorts = {
      privateInventory: {
        protect: async () => secretTransferErr({ code: 'car-build-failed', message: 'Unexpected protection.' }),
        unlock: async () => {
          inventoryOpened = true;
          return secretTransferErr({ code: 'private-inventory-rejected', message: 'Unexpected unlock.' });
        }
      },
      destinationAuthority: {
        authorize: async () => {
          authorityOpened = true;
          return secretTransferErr({ code: 'destination-denied', message: 'Unexpected authority check.' });
        }
      },
      replay: {
        inspect: async () => secretTransferErr({ code: 'transfer-replayed', message: 'Unexpected replay check.' })
      },
      conflict: {
        inspect: async () => secretTransferErr({ code: 'conflict-rejected', message: 'Unexpected conflict check.' })
      },
      replacementConsent: {
        confirm: async () => secretTransferErr({ code: 'consent-denied', message: 'Unexpected consent.' })
      },
      transaction: {
        commit: async () => secretTransferErr({ code: 'transaction-failed', message: 'Unexpected transaction.' })
      }
    };

    const result = await importEncryptedSecretTransfer({
      operationId: operationId.value,
      cartridgeBytes: new Uint8Array(),
      recipient: {
        keyId: 'recipient-1',
        unwrapKey: async () => teleportOk(new Uint8Array())
      },
      trustedSigners: [],
      requiredSignerKeyIds: [],
      destination: {
        repository: repository.value,
        recipeRevision: revision.value,
        credentialReference: reference.value,
        conflictPolicy: 'reject'
      },
      atMs: 1_000
    }, ports);

    expect(result).toMatchObject({ type: 'err', issues: [{ code: 'input-invalid' }] });
    expect({ inventoryOpened, authorityOpened }).toEqual({
      inventoryOpened: false,
      authorityOpened: false
    });
  });
});
