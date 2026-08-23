import { describe, expect, it } from 'vitest';

import {
  createPrivateInventoryCartridge,
  ok as teleportOk,
  unlockPrivateInventoryCartridge
} from '../teleport/public.ts';
import {
  exportEncryptedSecretTransfer,
  importEncryptedSecretTransfer,
  type ExportEncryptedSecretTransferRequest,
  type ImportEncryptedSecretTransferRequest,
  type SecretTransferImportPorts,
  type SecretTransferPrivateInventoryPort,
  type SecretTransferRecipient,
  type SecretTransferSigningAuthority
} from '../broker/secret-transfer-orchestrator.ts';
import { parseCredentialReference } from '../broker/lease.ts';
import {
  parseJournalOperationId,
  parseRedactedAuthorityDigest,
  parseTransferId
} from '../broker/journal.ts';
import {
  parseCanonicalRepository,
  parseGrantId,
  parseRecipeRevision
} from '../broker/primitives.ts';
import {
  secretTransferErr,
  secretTransferOk,
  type AuthorizedSecretTransferDestination,
  type SecretTransferDestinationRequest,
  type SecretTransferPortableFacts
} from '../broker/secret-transfer.ts';
import {
  SECRET_TRANSFER_INVENTORY_CAPABILITY_ID,
  SECRET_TRANSFER_PREVIEW_CAPABILITY_ID
} from '../broker/secret-transfer-preview.ts';

const PASSPHRASE = 'test-only-private-inventory-passphrase';
const SECRET_CANARY = 'SECRET_TRANSFER_CANARY_NOT_FOR_RECEIPTS';

const cryptoKeys = async (): Promise<Readonly<{
  recipient: CryptoKeyPair;
  otherRecipient: CryptoKeyPair;
  signer: CryptoKeyPair;
  otherSigner: CryptoKeyPair;
}>> => ({
  recipient: await crypto.subtle.generateKey({
    name: 'RSA-OAEP',
    modulusLength: 2048,
    publicExponent: Uint8Array.of(1, 0, 1),
    hash: 'SHA-256'
  }, false, ['encrypt', 'decrypt']) as CryptoKeyPair,
  otherRecipient: await crypto.subtle.generateKey({
    name: 'RSA-OAEP',
    modulusLength: 2048,
    publicExponent: Uint8Array.of(1, 0, 1),
    hash: 'SHA-256'
  }, false, ['encrypt', 'decrypt']) as CryptoKeyPair,
  signer: await crypto.subtle.generateKey('Ed25519', false, ['sign', 'verify']) as CryptoKeyPair,
  otherSigner: await crypto.subtle.generateKey('Ed25519', false, ['sign', 'verify']) as CryptoKeyPair
});

const privateInventoryPort = (): SecretTransferPrivateInventoryPort => ({
  protect: async archive => {
    const protectedArchive = await createPrivateInventoryCartridge(archive, PASSPHRASE);
    return protectedArchive.ok
      ? secretTransferOk({
        profile: 'private-inventory-v1',
        bytes: protectedArchive.value.bytes,
        rootCid: protectedArchive.value.root.toString()
      })
      : secretTransferErr({
        code: 'car-build-failed',
        message: 'Private-inventory test adapter could not protect the archive.'
      });
  },
  unlock: async bytes => {
    const unlocked = await unlockPrivateInventoryCartridge(bytes, PASSPHRASE);
    return unlocked.ok
      ? secretTransferOk({ profile: 'private-inventory-v1', cartridge: unlocked.value })
      : secretTransferErr({
        code: 'private-inventory-rejected',
        message: 'Private-inventory test adapter rejected the archive.'
      });
  }
});

const portableFacts = (): SecretTransferPortableFacts => {
  const transferId = parseTransferId('transfer-seam-1');
  if (transferId.type === 'err') throw new Error('transfer seam identity is invalid');
  return {
    transferId: transferId.value,
    provider: 'weather-provider',
    accountId: 'account-secret-identity',
    accountLabel: 'Private weather account',
    environment: 'sandbox',
    secretKind: 'api-token',
    providerScopes: ['alerts:read', 'forecast:read'],
    intendedRecipientKeyId: 'device-recipient-1',
    issuedAtMs: 1_000,
    transferExpiresAtMs: 5_000,
    upstreamExpiresAtMs: 9_000
  };
};

const authorityFixture = (): Readonly<{
  destination: SecretTransferDestinationRequest;
  authorized: AuthorizedSecretTransferDestination;
}> => {
  const repository = parseCanonicalRepository('R:/Code/weather-destination');
  const recipeRevision = parseRecipeRevision('recipe-revision-seam-1');
  const credentialReference = parseCredentialReference('weather-destination-account');
  const destinationGrantId = parseGrantId('destination-grant-seam-1');
  const authorityDigest = parseRedactedAuthorityDigest('sha256:redacted-destination-authority');
  if (repository.isErr() || recipeRevision.isErr() || credentialReference.isErr() ||
      destinationGrantId.isErr() || authorityDigest.type === 'err') {
    throw new Error('secret-transfer authority fixture is invalid');
  }
  return {
    destination: {
      repository: repository.value,
      recipeRevision: recipeRevision.value,
      credentialReference: credentialReference.value,
      conflictPolicy: 'reject'
    },
    authorized: {
      state: 'authorized',
      repository: repository.value,
      recipeRevision: recipeRevision.value,
      credentialReference: credentialReference.value,
      destinationGrantId: destinationGrantId.value,
      authorityDigest: authorityDigest.value,
      provider: 'weather-provider',
      accountId: 'account-secret-identity',
      environment: 'sandbox',
      permittedScopes: ['forecast:read'],
      grantExpiresAtMs: 8_000
    }
  };
};

const signingAuthority = (
  pair: CryptoKeyPair,
  keyId = 'trusted-export-signer'
): SecretTransferSigningAuthority => ({
  keyId,
  privateKey: pair.privateKey,
  publicKey: pair.publicKey
});

const recipientAuthority = (
  pair: CryptoKeyPair,
  keyId = 'device-recipient-1'
): Readonly<{
  exportRecipient: SecretTransferRecipient;
  importRecipient: ImportEncryptedSecretTransferRequest['recipient'];
}> => ({
  exportRecipient: { keyId, publicKey: pair.publicKey },
  importRecipient: {
    keyId,
    unwrapKey: async wrappedKey => teleportOk(new Uint8Array(await crypto.subtle.decrypt(
      { name: 'RSA-OAEP' },
      pair.privateKey,
      Uint8Array.from(wrappedKey).buffer
    )))
  }
});

type TransferSeamEvent =
  | Readonly<{ type: 'source-opened' }>
  | Readonly<{ type: 'source-released' }>
  | Readonly<{ type: 'authority-checked' }>
  | Readonly<{ type: 'replay-checked' }>
  | Readonly<{ type: 'conflict-checked' }>
  | Readonly<{ type: 'transaction-opened' }>
  | Readonly<{ type: 'secret-installed' }>
  | Readonly<{ type: 'transaction-closed' }>;

const seamPorts = (
  authorized: AuthorizedSecretTransferDestination,
  behavior: 'committed' | 'transaction-failed' | 'recovery-required' = 'committed'
): Readonly<{
  exportPorts: Parameters<typeof exportEncryptedSecretTransfer>[1];
  importPorts: SecretTransferImportPorts;
  inspect: () => Readonly<{
    events: readonly TransferSeamEvent[];
    sourceReleased: boolean;
    secretObservedOnlyInsideTransaction: boolean;
    replayConsumed: boolean;
    replacementPromptCount: number;
  }>;
}> => {
  const events: TransferSeamEvent[] = [];
  let sourceReleased = false;
  let secretObservedOnlyInsideTransaction = false;
  let replayConsumed = false;
  let replacementPromptCount = 0;
  const inventory = privateInventoryPort();
  const source: Parameters<typeof exportEncryptedSecretTransfer>[1]['source'] = {
    withSecret: async (_reference, use) => {
      events.push({ type: 'source-opened' });
      const result = await use({ bytes: new TextEncoder().encode(SECRET_CANARY) });
      sourceReleased = true;
      events.push({ type: 'source-released' });
      return result;
    }
  };
  const importPorts: SecretTransferImportPorts = {
    privateInventory: inventory,
    destinationAuthority: {
      authorize: async () => {
        events.push({ type: 'authority-checked' });
        return secretTransferOk(authorized);
      }
    },
    replay: {
      inspect: async () => {
        events.push({ type: 'replay-checked' });
        return secretTransferOk(replayConsumed ? 'consumed' : 'fresh');
      }
    },
    conflict: {
      inspect: async () => {
        events.push({ type: 'conflict-checked' });
        return secretTransferOk('absent');
      }
    },
    replacementConsent: {
      confirm: async () => {
        replacementPromptCount += 1;
        return secretTransferOk('approved');
      }
    },
    transaction: {
      commit: async (_command, provideSecret) => {
        events.push({ type: 'transaction-opened' });
        if (behavior === 'transaction-failed') return secretTransferErr({
          code: 'transaction-failed',
          message: 'Injected destination transaction failure.'
        });
        const installed = await provideSecret({
          install: async plaintext => {
            secretObservedOnlyInsideTransaction = new TextDecoder().decode(plaintext.bytes) === SECRET_CANARY;
            events.push({ type: 'secret-installed' });
            return secretTransferOk(undefined);
          }
        });
        if (installed.type === 'err') return installed;
        events.push({ type: 'transaction-closed' });
        if (behavior === 'recovery-required') return secretTransferOk({
          state: 'recovery-required',
          recoveryReference: 'recovery:redacted-1'
        });
        replayConsumed = true;
        return secretTransferOk({ state: 'committed', consumedAtMs: 2_100 });
      }
    }
  };
  return {
    exportPorts: { source, privateInventory: inventory },
    importPorts,
    inspect: () => ({
      events: [...events],
      sourceReleased,
      secretObservedOnlyInsideTransaction,
      replayConsumed,
      replacementPromptCount
    })
  };
};

const operationId = () => {
  const parsed = parseJournalOperationId('operation-secret-transfer-seam-1');
  if (parsed.type === 'err') throw new Error('operation fixture is invalid');
  return parsed.value;
};

describe('broker encrypted secret-transfer CAR seam', () => {
  it('exports recipient-protected signed private inventory and imports only through a transactional sink', async () => {
    const keys = await cryptoKeys();
    const authority = authorityFixture();
    const recipient = recipientAuthority(keys.recipient);
    const signer = signingAuthority(keys.signer);
    const ports = seamPorts(authority.authorized);
    const sourceReference = parseCredentialReference('weather-source-account');
    if (sourceReference.isErr()) throw new Error('source reference fixture is invalid');
    const exportRequest: ExportEncryptedSecretTransferRequest = {
      sourceCredentialReference: sourceReference.value,
      facts: portableFacts(),
      recipient: recipient.exportRecipient,
      signer
    };

    const exported = await exportEncryptedSecretTransfer(exportRequest, ports.exportPorts);
    expect(exported.type).toBe('ok');
    if (exported.type === 'err') return;
    const publicArchiveText = new TextDecoder().decode(exported.value.cartridge.bytes);
    expect(publicArchiveText).not.toContain(SECRET_CANARY);
    expect(publicArchiveText).toContain(SECRET_TRANSFER_PREVIEW_CAPABILITY_ID);
    expect(publicArchiveText).toContain(SECRET_TRANSFER_INVENTORY_CAPABILITY_ID);
    expect(publicArchiveText).toContain('weather-provider');
    expect(publicArchiveText).toContain('forecast:read');
    expect(publicArchiveText).not.toContain('account-secret-identity');
    expect(publicArchiveText).not.toContain('Private weather account');
    expect(JSON.stringify(exported.value.receipt)).not.toContain(SECRET_CANARY);
    expect(ports.inspect()).toMatchObject({ sourceReleased: true });

    const imported = await importEncryptedSecretTransfer({
      operationId: operationId(),
      cartridgeBytes: exported.value.cartridge.bytes,
      recipient: recipient.importRecipient,
      trustedSigners: [{ keyId: signer.keyId, publicKey: signer.publicKey }],
      requiredSignerKeyIds: [signer.keyId],
      destination: authority.destination,
      atMs: 2_000
    }, ports.importPorts);

    expect(imported).toMatchObject({
      type: 'ok',
      value: {
        outcome: 'committed',
        receipt: {
          secretStored: true,
          plaintextRetained: false,
          verifiedSignerKeyIds: ['trusted-export-signer']
        }
      }
    });
    const inspection = ports.inspect();
    expect(inspection).toMatchObject({
      secretObservedOnlyInsideTransaction: true,
      replayConsumed: true,
      replacementPromptCount: 0
    });
    expect(inspection.events).toEqual([
      { type: 'source-opened' },
      { type: 'source-released' },
      { type: 'replay-checked' },
      { type: 'conflict-checked' },
      { type: 'authority-checked' },
      { type: 'transaction-opened' },
      { type: 'secret-installed' },
      { type: 'transaction-closed' }
    ]);
    expect(JSON.stringify({ imported, inspection })).not.toContain(SECRET_CANARY);
    expect(JSON.stringify(imported)).not.toContain('R:/Code/weather-destination');

    const replayed = await importEncryptedSecretTransfer({
      operationId: operationId(),
      cartridgeBytes: exported.value.cartridge.bytes,
      recipient: recipient.importRecipient,
      trustedSigners: [{ keyId: signer.keyId, publicKey: signer.publicKey }],
      requiredSignerKeyIds: [signer.keyId],
      destination: authority.destination,
      atMs: 2_200
    }, ports.importPorts);
    expect(replayed).toMatchObject({ type: 'err', issues: [{ code: 'transfer-replayed' }] });
  });

  it('rejects a wrong recipient, an untrusted signer, expiry, and modified private inventory before mutation', async () => {
    const keys = await cryptoKeys();
    const authority = authorityFixture();
    const recipient = recipientAuthority(keys.recipient);
    const otherRecipient = recipientAuthority(keys.otherRecipient, 'device-recipient-other');
    const signer = signingAuthority(keys.signer);
    const ports = seamPorts(authority.authorized);
    const sourceReference = parseCredentialReference('weather-source-account');
    if (sourceReference.isErr()) throw new Error('source reference fixture is invalid');
    const exported = await exportEncryptedSecretTransfer({
      sourceCredentialReference: sourceReference.value,
      facts: portableFacts(),
      recipient: recipient.exportRecipient,
      signer
    }, ports.exportPorts);
    if (exported.type === 'err') throw new Error('encrypted export fixture failed');
    const base = {
      operationId: operationId(),
      cartridgeBytes: exported.value.cartridge.bytes,
      recipient: recipient.importRecipient,
      trustedSigners: [{ keyId: signer.keyId, publicKey: signer.publicKey }],
      requiredSignerKeyIds: [signer.keyId],
      destination: authority.destination,
      atMs: 2_000
    };

    expect(await importEncryptedSecretTransfer({
      ...base,
      recipient: otherRecipient.importRecipient
    }, ports.importPorts)).toMatchObject({ type: 'err', issues: [{ code: 'recipient-mismatch' }] });
    expect(await importEncryptedSecretTransfer({
      ...base,
      trustedSigners: [{ keyId: signer.keyId, publicKey: keys.otherSigner.publicKey }]
    }, ports.importPorts)).toMatchObject({ type: 'err', issues: [{ code: 'signer-untrusted' }] });
    expect(await importEncryptedSecretTransfer({
      ...base,
      atMs: 5_000
    }, ports.importPorts)).toMatchObject({ type: 'err', issues: [{ code: 'transfer-expired' }] });

    const modified = Uint8Array.from(exported.value.cartridge.bytes);
    modified[modified.byteLength - 1] = (modified[modified.byteLength - 1] ?? 0) ^ 1;
    expect(await importEncryptedSecretTransfer({
      ...base,
      cartridgeBytes: modified
    }, ports.importPorts)).toMatchObject({
      type: 'err',
      issues: [{ code: 'car-invalid' }]
    });
    expect(ports.inspect().events).not.toContainEqual({ type: 'transaction-opened' });
  });

  it('returns only a redacted recovery receipt when the atomic keychain/replay port cannot close', async () => {
    const keys = await cryptoKeys();
    const authority = authorityFixture();
    const recipient = recipientAuthority(keys.recipient);
    const signer = signingAuthority(keys.signer);
    const ports = seamPorts(authority.authorized, 'recovery-required');
    const sourceReference = parseCredentialReference('weather-source-account');
    if (sourceReference.isErr()) throw new Error('source reference fixture is invalid');
    const exported = await exportEncryptedSecretTransfer({
      sourceCredentialReference: sourceReference.value,
      facts: portableFacts(),
      recipient: recipient.exportRecipient,
      signer
    }, ports.exportPorts);
    if (exported.type === 'err') throw new Error('encrypted export fixture failed');

    const imported = await importEncryptedSecretTransfer({
      operationId: operationId(),
      cartridgeBytes: exported.value.cartridge.bytes,
      recipient: recipient.importRecipient,
      trustedSigners: [{ keyId: signer.keyId, publicKey: signer.publicKey }],
      requiredSignerKeyIds: [signer.keyId],
      destination: authority.destination,
      atMs: 2_000
    }, ports.importPorts);

    expect(imported).toMatchObject({
      type: 'ok',
      value: {
        outcome: 'recovery-required',
        receipt: {
          recoveryReference: 'recovery:redacted-1',
          secretState: 'journal-recovery-required',
          plaintextRetained: false
        }
      }
    });
    expect(JSON.stringify(imported)).not.toContain(SECRET_CANARY);
    expect(JSON.stringify(imported)).not.toContain('account-secret-identity');
    expect(JSON.stringify(imported)).not.toContain('R:/Code/weather-destination');
  });
});
