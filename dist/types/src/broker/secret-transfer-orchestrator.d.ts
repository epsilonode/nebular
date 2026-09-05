import { type TeleportCartridgeArchive, type TeleportRecipientKeyUnwrapper, type TeleportSignatureVerifier, type VerifiedTeleportCartridge } from '../teleport/public.ts';
import type { CredentialReference } from './lease.ts';
import type { JournalOperationId } from './journal.ts';
import { type SecretTransferAuthenticatedPreviewV1 } from './secret-transfer-preview.ts';
import { type AuthorizedSecretTransferDestination, type SecretTransferDestinationRequest, type SecretTransferDestinationStatus, type SecretTransferImportPlan, type SecretTransferPlaintext, type SecretTransferPortableFacts, type SecretTransferReplayStatus, type SecretTransferTaskResult } from './secret-transfer.ts';
export type SecretTransferRecipient = Readonly<{
    keyId: string;
    publicKey: CryptoKey;
}>;
export type SecretTransferSigningAuthority = Readonly<{
    keyId: string;
    privateKey: CryptoKey;
    publicKey: CryptoKey;
}>;
export type EncryptedSecretTransferCartridge = Readonly<{
    profile: 'signed-preview-private-inventory-v1';
    bytes: Uint8Array;
    rootCid: string;
}>;
export type ProtectedSecretTransferInventory = Readonly<{
    profile: 'private-inventory-v1';
    bytes: Uint8Array;
    rootCid: string;
}>;
export type UnlockedSecretTransferInventory = Readonly<{
    profile: 'private-inventory-v1';
    cartridge: VerifiedTeleportCartridge;
}>;
export type SecretTransferSourcePort = Readonly<{
    withSecret: <T>(reference: CredentialReference, use: (plaintext: SecretTransferPlaintext) => SecretTransferTaskResult<T>) => SecretTransferTaskResult<T>;
}>;
export type SecretTransferPrivateInventoryPort = Readonly<{
    /** Owns the local passphrase/PIN consent surface and never returns it. */
    protect: (archive: TeleportCartridgeArchive) => SecretTransferTaskResult<ProtectedSecretTransferInventory>;
    /** Returns a graph-verified inner cartridge only after local unlock succeeds. */
    unlock: (bytes: Uint8Array, prompt: SecretTransferUnlockPrompt) => SecretTransferTaskResult<UnlockedSecretTransferInventory>;
}>;
export type SecretTransferDestinationAuthorityPort = Readonly<{
    authorize: (request: SecretTransferDestinationRequest, portableFacts: SecretTransferPortableFacts) => SecretTransferTaskResult<AuthorizedSecretTransferDestination>;
}>;
export type SecretTransferReplayPort = Readonly<{
    inspect: (transferId: SecretTransferPortableFacts['transferId']) => SecretTransferTaskResult<SecretTransferReplayStatus>;
}>;
export type SecretTransferConflictPort = Readonly<{
    inspect: (reference: CredentialReference) => SecretTransferTaskResult<SecretTransferDestinationStatus>;
}>;
export type SecretTransferReplacementPrompt = Readonly<{
    type: 'secret-transfer-replacement';
    version: 1;
    transferId: SecretTransferPortableFacts['transferId'];
    provider: string;
    accountId: string;
    environment: string;
    secretKind: string;
    providerScopes: readonly string[];
    repository: AuthorizedSecretTransferDestination['repository'];
    recipeRevision: AuthorizedSecretTransferDestination['recipeRevision'];
    destinationCredentialReference: CredentialReference;
}>;
export type SecretTransferReplacementConsentPort = Readonly<{
    confirm: (prompt: SecretTransferReplacementPrompt) => SecretTransferTaskResult<'approved' | 'denied'>;
}>;
export type SecretTransferUnlockPrompt = Readonly<{
    type: 'secret-transfer-unlock';
    version: 1;
    preview: SecretTransferAuthenticatedPreviewV1;
    verifiedSignerKeyIds: readonly string[];
    destinationRepository: SecretTransferDestinationRequest['repository'];
    destinationRecipeRevision: SecretTransferDestinationRequest['recipeRevision'];
    destinationCredentialReference: CredentialReference;
    destinationStatus: SecretTransferDestinationStatus;
}>;
export type SecretTransferInstallSink = Readonly<{
    install: (plaintext: SecretTransferPlaintext) => SecretTransferTaskResult<void>;
}>;
export type CommitSecretTransferImport = Readonly<{
    operationId: JournalOperationId;
    plan: SecretTransferImportPlan;
    replacementApproved: boolean;
}>;
export type SecretTransferTransactionOutcome = Readonly<{
    state: 'committed';
    consumedAtMs: number;
}> | Readonly<{
    state: 'recovery-required';
    recoveryReference: string;
}>;
export type SecretTransferImportTransactionPort = Readonly<{
    /**
     * Atomically couples destination keychain staging with transfer-id
     * consumption, or returns an explicit durable recovery-required outcome.
     */
    commit: (command: CommitSecretTransferImport, provideSecret: (sink: SecretTransferInstallSink) => SecretTransferTaskResult<void>) => SecretTransferTaskResult<SecretTransferTransactionOutcome>;
}>;
export type SecretTransferExportPorts = Readonly<{
    source: SecretTransferSourcePort;
    privateInventory: SecretTransferPrivateInventoryPort;
}>;
export type SecretTransferImportPorts = Readonly<{
    privateInventory: SecretTransferPrivateInventoryPort;
    destinationAuthority: SecretTransferDestinationAuthorityPort;
    replay: SecretTransferReplayPort;
    conflict: SecretTransferConflictPort;
    replacementConsent: SecretTransferReplacementConsentPort;
    transaction: SecretTransferImportTransactionPort;
}>;
export type ExportEncryptedSecretTransferRequest = Readonly<{
    sourceCredentialReference: CredentialReference;
    facts: SecretTransferPortableFacts;
    recipient: SecretTransferRecipient;
    signer: SecretTransferSigningAuthority;
}>;
export type SecretTransferExportReceipt = Readonly<{
    type: 'secret-transfer-export-receipt';
    version: 1;
    transferId: SecretTransferPortableFacts['transferId'];
    provider: string;
    environment: string;
    intendedRecipientKeyId: string;
    transferExpiresAtMs: number;
    signerKeyId: string;
    rootCid: string;
    secretBytesExcluded: true;
}>;
export type ExportedEncryptedSecretTransfer = Readonly<{
    cartridge: EncryptedSecretTransferCartridge;
    receipt: SecretTransferExportReceipt;
}>;
export type ImportEncryptedSecretTransferRequest = Readonly<{
    operationId: JournalOperationId;
    cartridgeBytes: Uint8Array;
    recipient: TeleportRecipientKeyUnwrapper;
    trustedSigners: readonly TeleportSignatureVerifier[];
    requiredSignerKeyIds: readonly string[];
    destination: SecretTransferDestinationRequest;
    atMs: number;
}>;
export type SecretTransferImportReceipt = Readonly<{
    type: 'secret-transfer-import-receipt';
    version: 1;
    transferId: SecretTransferPortableFacts['transferId'];
    provider: string;
    environment: string;
    recipientKeyId: string;
    verifiedSignerKeyIds: readonly string[];
    destinationGrantId: AuthorizedSecretTransferDestination['destinationGrantId'];
    authorityDigest: AuthorizedSecretTransferDestination['authorityDigest'];
    consumedAtMs: number;
    secretStored: true;
    plaintextRetained: false;
}>;
export type SecretTransferRecoveryReceipt = Readonly<{
    type: 'secret-transfer-recovery-receipt';
    version: 1;
    transferId: SecretTransferPortableFacts['transferId'];
    authorityDigest: AuthorizedSecretTransferDestination['authorityDigest'];
    recoveryReference: string;
    secretState: 'journal-recovery-required';
    plaintextRetained: false;
}>;
export type ImportedEncryptedSecretTransfer = Readonly<{
    outcome: 'committed';
    receipt: SecretTransferImportReceipt;
}> | Readonly<{
    outcome: 'recovery-required';
    receipt: SecretTransferRecoveryReceipt;
}>;
export declare const exportEncryptedSecretTransfer: (request: ExportEncryptedSecretTransferRequest, ports: SecretTransferExportPorts) => SecretTransferTaskResult<ExportedEncryptedSecretTransfer>;
export declare const importEncryptedSecretTransfer: (request: ImportEncryptedSecretTransferRequest, ports: SecretTransferImportPorts) => SecretTransferTaskResult<ImportedEncryptedSecretTransfer>;
