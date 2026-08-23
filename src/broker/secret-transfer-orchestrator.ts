import {
  addTeleportSignature,
  createTeleportCartridge,
  decodeCapability,
  encodeCapability,
  protectCapabilityBlocksForRecipient,
  type TeleportCartridgeArchive,
  unlockTeleportCartridgeWithRecipientUnwrapper,
  type TeleportRecipientKeyUnwrapper,
  type TeleportSignatureVerifier,
  type VerifiedTeleportCartridge,
  verifyTeleportCartridge,
  verifyTeleportSignatures
} from '../teleport/public.ts';
import type { CredentialReference } from './lease.ts';
import type { JournalOperationId } from './journal.ts';
import {
  planSecretTransferExport,
  planSecretTransferImport,
  SECRET_TRANSFER_CAPABILITY_ID,
  SECRET_TRANSFER_CAPABILITY_VERSION,
  secretTransferCapabilityCodec,
  secretTransferErr,
  secretTransferOk,
  secretTransferPortableFacts,
  validateSecretTransferPortableAdmission,
  type AuthorizedSecretTransferDestination,
  type SecretTransferCapabilityV1,
  type SecretTransferDestinationRequest,
  type SecretTransferDestinationStatus,
  type SecretTransferExportPlan,
  type SecretTransferImportPlan,
  type SecretTransferIssueCode,
  type SecretTransferPlaintext,
  type SecretTransferPortableFacts,
  type SecretTransferReplayStatus,
  type SecretTransferResult,
  type SecretTransferTaskResult
} from './secret-transfer.ts';

const SECRET_TRANSFER_INSTANCE_PREFIX = 'credential-transfer:';

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
  profile: 'private-inventory-v1';
  bytes: Uint8Array;
  rootCid: string;
}>;

export type UnlockedSecretTransferInventory = Readonly<{
  profile: 'private-inventory-v1';
  cartridge: VerifiedTeleportCartridge;
}>;

export type SecretTransferSourcePort = Readonly<{
  withSecret: <T>(
    reference: CredentialReference,
    use: (plaintext: SecretTransferPlaintext) => SecretTransferTaskResult<T>
  ) => SecretTransferTaskResult<T>;
}>;

export type SecretTransferPrivateInventoryPort = Readonly<{
  /** Owns the local passphrase/PIN consent surface and never returns it. */
  protect: (archive: TeleportCartridgeArchive) => SecretTransferTaskResult<EncryptedSecretTransferCartridge>;
  /** Returns a graph-verified inner cartridge only after local unlock succeeds. */
  unlock: (bytes: Uint8Array) => SecretTransferTaskResult<UnlockedSecretTransferInventory>;
}>;

export type SecretTransferDestinationAuthorityPort = Readonly<{
  authorize: (
    request: SecretTransferDestinationRequest,
    portableFacts: SecretTransferPortableFacts
  ) => SecretTransferTaskResult<AuthorizedSecretTransferDestination>;
}>;

export type SecretTransferReplayPort = Readonly<{
  inspect: (
    transferId: SecretTransferPortableFacts['transferId']
  ) => SecretTransferTaskResult<SecretTransferReplayStatus>;
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
  confirm: (
    prompt: SecretTransferReplacementPrompt
  ) => SecretTransferTaskResult<'approved' | 'denied'>;
}>;

export type SecretTransferInstallSink = Readonly<{
  install: (plaintext: SecretTransferPlaintext) => SecretTransferTaskResult<void>;
}>;

export type CommitSecretTransferImport = Readonly<{
  operationId: JournalOperationId;
  plan: SecretTransferImportPlan;
  replacementApproved: boolean;
}>;

export type SecretTransferTransactionOutcome =
  | Readonly<{
    state: 'committed';
    consumedAtMs: number;
  }>
  | Readonly<{
    state: 'recovery-required';
    recoveryReference: string;
  }>;

export type SecretTransferImportTransactionPort = Readonly<{
  /**
   * Atomically couples destination keychain staging with transfer-id
   * consumption, or returns an explicit durable recovery-required outcome.
   */
  commit: (
    command: CommitSecretTransferImport,
    provideSecret: (sink: SecretTransferInstallSink) => SecretTransferTaskResult<void>
  ) => SecretTransferTaskResult<SecretTransferTransactionOutcome>;
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

export type ImportedEncryptedSecretTransfer =
  | Readonly<{ outcome: 'committed'; receipt: SecretTransferImportReceipt }>
  | Readonly<{ outcome: 'recovery-required'; receipt: SecretTransferRecoveryReceipt }>;

const transferFailure = <T = never>(
  code: SecretTransferIssueCode,
  message: string
): SecretTransferResult<T> => secretTransferErr({ code, message });

const buildCapability = (
  plan: SecretTransferExportPlan,
  plaintext: SecretTransferPlaintext
): SecretTransferCapabilityV1 => ({
  type: SECRET_TRANSFER_CAPABILITY_ID,
  version: SECRET_TRANSFER_CAPABILITY_VERSION,
  ...plan.facts,
  secret: { bytes: Uint8Array.from(plaintext.bytes) }
});

const buildEncryptedArchive = async (
  request: ExportEncryptedSecretTransferRequest,
  plan: SecretTransferExportPlan,
  plaintext: SecretTransferPlaintext,
  privateInventory: SecretTransferPrivateInventoryPort
): SecretTransferTaskResult<ExportedEncryptedSecretTransfer> => {
  const encoded = await encodeCapability({
    codec: secretTransferCapabilityCodec,
    value: buildCapability(plan, plaintext),
    instanceId: `${SECRET_TRANSFER_INSTANCE_PREFIX}${plan.facts.transferId.value}`,
    required: true,
    restoreMode: 'retain'
  });
  if (!encoded.ok) return transferFailure('car-build-failed', 'Secret-transfer capability encoding failed.');
  const protectedSet = await protectCapabilityBlocksForRecipient([encoded.value], request.recipient);
  if (!protectedSet.ok) return transferFailure('car-build-failed', 'Secret-transfer recipient protection failed.');
  const unsigned = await createTeleportCartridge({
    capabilities: protectedSet.value.capabilities,
    keyEnvelopes: protectedSet.value.keyEnvelopes
  });
  if (!unsigned.ok) return transferFailure('car-build-failed', 'Secret-transfer cartridge assembly failed.');
  const verifiedUnsigned = await verifyTeleportCartridge(unsigned.value.bytes);
  if (!verifiedUnsigned.ok) return transferFailure('car-build-failed', 'Secret-transfer cartridge verification failed.');
  const signed = await addTeleportSignature(verifiedUnsigned.value, request.signer);
  if (!signed.ok) return transferFailure('car-build-failed', 'Secret-transfer cartridge signing failed.');
  const verifiedSigned = await verifyTeleportCartridge(signed.value.bytes);
  if (!verifiedSigned.ok) return transferFailure('car-build-failed', 'Signed secret-transfer cartridge is invalid.');
  const signature = await verifyTeleportSignatures(
    verifiedSigned.value,
    [{ keyId: request.signer.keyId, publicKey: request.signer.publicKey }],
    [request.signer.keyId]
  );
  if (!signature.ok) return transferFailure('car-build-failed', 'Secret-transfer signature self-check failed.');
  const privateArchive = await privateInventory.protect(signed.value);
  return privateArchive.type === 'err'
    ? privateArchive
    : secretTransferOk<ExportedEncryptedSecretTransfer>({
      cartridge: privateArchive.value,
      receipt: {
        type: 'secret-transfer-export-receipt',
        version: 1,
        transferId: plan.facts.transferId,
        provider: plan.facts.provider,
        environment: plan.facts.environment,
        intendedRecipientKeyId: plan.facts.intendedRecipientKeyId,
        transferExpiresAtMs: plan.facts.transferExpiresAtMs,
        signerKeyId: request.signer.keyId,
        rootCid: privateArchive.value.rootCid,
        secretBytesExcluded: true
      }
    });
};

export const exportEncryptedSecretTransfer = (
  request: ExportEncryptedSecretTransferRequest,
  ports: SecretTransferExportPorts
): SecretTransferTaskResult<ExportedEncryptedSecretTransfer> => {
  const plan = planSecretTransferExport(request.facts);
  if (plan.type === 'err') return Promise.resolve(plan);
  if (request.recipient.keyId !== plan.value.facts.intendedRecipientKeyId ||
      request.signer.keyId.length === 0) {
    return Promise.resolve(transferFailure(
      'input-invalid',
      'Secret-transfer recipient or signing authority is inconsistent.'
    ));
  }
  return ports.source.withSecret(
    request.sourceCredentialReference,
    plaintext => buildEncryptedArchive(request, plan.value, plaintext, ports.privateInventory)
  );
};

const validateProtectedSignedShape = (
  cartridge: VerifiedTeleportCartridge,
  recipientKeyId: string
): SecretTransferResult<VerifiedTeleportCartridge> => {
  const capability = cartridge.capabilities.at(0);
  const recipientEnvelope = cartridge.keyEnvelopes.at(0);
  if (cartridge.capabilities.length !== 1 || capability === undefined ||
      capability.descriptor.capabilityId !== SECRET_TRANSFER_CAPABILITY_ID ||
      capability.descriptor.schemaVersion !== SECRET_TRANSFER_CAPABILITY_VERSION ||
      capability.descriptor.securityClass !== 'secret' ||
      capability.descriptor.required !== true ||
      capability.descriptor.codec !== 'dag-cbor' ||
      capability.descriptor.restoreMode !== 'retain' ||
      capability.descriptor.dependencies.length !== 0 ||
      capability.descriptor.protection.mode !== 'aes-256-gcm-v1') {
    return transferFailure('protection-required', 'Secret-transfer capability must be protected.');
  }
  if (cartridge.keyEnvelopes.length !== 1 || recipientEnvelope === undefined ||
      recipientEnvelope.descriptor.mode !== 'rsa-oaep-aes-256-gcm-v1' ||
      recipientEnvelope.descriptor.id !== capability.descriptor.protection.keyEnvelopeId ||
      recipientEnvelope.descriptor.recipientKeyId !== recipientKeyId) {
    return transferFailure('recipient-mismatch', 'Secret-transfer recipient envelope does not match.');
  }
  return cartridge.signatures.length === 0
    ? transferFailure('signature-required', 'Secret-transfer cartridge must be signed.')
    : secretTransferOk(cartridge);
};

const hasUniqueStableKeyIds = (keyIds: readonly string[]): boolean =>
  keyIds.length > 0 &&
  keyIds.every(keyId => keyId.length > 0 && keyId.length <= 128 && !keyId.includes('\0')) &&
  new Set(keyIds).size === keyIds.length;

const decodeProtectedCapability = (
  cartridge: VerifiedTeleportCartridge
): SecretTransferResult<SecretTransferCapabilityV1> => {
  const capability = cartridge.capabilities.at(0);
  if (capability?.contentBytes === undefined) {
    return transferFailure('protection-required', 'Secret-transfer plaintext was not unlocked.');
  }
  const decoded = decodeCapability(
    secretTransferCapabilityCodec,
    capability.descriptor.schemaVersion,
    capability.contentBytes
  );
  return decoded.ok
    ? secretTransferOk(decoded.value)
    : transferFailure('car-invalid', 'Secret-transfer capability is invalid.');
};

const replacementPrompt = (plan: SecretTransferImportPlan): SecretTransferReplacementPrompt => ({
  type: 'secret-transfer-replacement',
  version: 1,
  transferId: plan.facts.transferId,
  provider: plan.facts.provider,
  accountId: plan.facts.accountId,
  environment: plan.facts.environment,
  secretKind: plan.facts.secretKind,
  providerScopes: plan.facts.providerScopes,
  repository: plan.destination.repository,
  recipeRevision: plan.destination.recipeRevision,
  destinationCredentialReference: plan.destination.credentialReference
});

const replacementApproved = async (
  plan: SecretTransferImportPlan,
  consent: SecretTransferReplacementConsentPort
): SecretTransferTaskResult<boolean> => {
  if (plan.consent === 'car-unlock') return secretTransferOk(false);
  const decision = await consent.confirm(replacementPrompt(plan));
  return decision.type === 'err'
    ? decision
    : decision.value === 'approved'
      ? secretTransferOk(true)
      : transferFailure('consent-denied', 'Elevated credential replacement was denied.');
};

const commitImport = async (
  operationId: JournalOperationId,
  plan: SecretTransferImportPlan,
  capability: SecretTransferCapabilityV1,
  verifiedSignerKeyIds: readonly string[],
  approved: boolean,
  transaction: SecretTransferImportTransactionPort
): SecretTransferTaskResult<ImportedEncryptedSecretTransfer> => {
  const outcome = await transaction.commit(
    { operationId, plan, replacementApproved: approved },
    sink => sink.install({ bytes: Uint8Array.from(capability.secret.bytes) })
  );
  if (outcome.type === 'err') return outcome;
  return outcome.value.state === 'committed'
    ? secretTransferOk<ImportedEncryptedSecretTransfer>({
      outcome: 'committed',
      receipt: {
        type: 'secret-transfer-import-receipt',
        version: 1,
        transferId: plan.facts.transferId,
        provider: plan.facts.provider,
        environment: plan.facts.environment,
        recipientKeyId: plan.facts.intendedRecipientKeyId,
        verifiedSignerKeyIds,
        destinationGrantId: plan.destination.destinationGrantId,
        authorityDigest: plan.destination.authorityDigest,
        consumedAtMs: outcome.value.consumedAtMs,
        secretStored: true,
        plaintextRetained: false
      }
    })
    : secretTransferOk<ImportedEncryptedSecretTransfer>({
      outcome: 'recovery-required',
      receipt: {
        type: 'secret-transfer-recovery-receipt',
        version: 1,
        transferId: plan.facts.transferId,
        authorityDigest: plan.destination.authorityDigest,
        recoveryReference: outcome.value.recoveryReference,
        secretState: 'journal-recovery-required',
        plaintextRetained: false
      }
    });
};

const authorizeAndCommit = async (
  request: ImportEncryptedSecretTransferRequest,
  capability: SecretTransferCapabilityV1,
  verifiedSignerKeyIds: readonly string[],
  ports: SecretTransferImportPorts
): SecretTransferTaskResult<ImportedEncryptedSecretTransfer> => {
  const facts = secretTransferPortableFacts(capability);
  const admission = validateSecretTransferPortableAdmission({
    facts,
    recipientKeyId: request.recipient.keyId,
    atMs: request.atMs
  });
  if (admission.type === 'err') return admission;
  const replay = await ports.replay.inspect(facts.transferId);
  if (replay.type === 'err') return replay;
  if (replay.value === 'consumed') return transferFailure(
    'transfer-replayed',
    'Secret transfer was already consumed.'
  );
  const destination = await ports.destinationAuthority.authorize(request.destination, facts);
  if (destination.type === 'err') return destination;
  const conflict = await ports.conflict.inspect(request.destination.credentialReference);
  if (conflict.type === 'err') return conflict;
  const plan = planSecretTransferImport({
    facts,
    recipientKeyId: request.recipient.keyId,
    atMs: request.atMs,
    replayStatus: replay.value,
    destinationRequest: request.destination,
    destination: destination.value,
    destinationStatus: conflict.value
  });
  if (plan.type === 'err') return plan;
  const approved = await replacementApproved(plan.value, ports.replacementConsent);
  return approved.type === 'err'
    ? approved
    : commitImport(
      request.operationId,
      plan.value,
      capability,
      verifiedSignerKeyIds,
      approved.value,
      ports.transaction
    );
};

const verifyUnlockAndImport = async (
  request: ImportEncryptedSecretTransferRequest,
  inventory: UnlockedSecretTransferInventory,
  ports: SecretTransferImportPorts
): SecretTransferTaskResult<ImportedEncryptedSecretTransfer> => {
  const shaped = validateProtectedSignedShape(inventory.cartridge, request.recipient.keyId);
  if (shaped.type === 'err') return shaped;
  if (!hasUniqueStableKeyIds(request.requiredSignerKeyIds)) return transferFailure(
    'signature-required',
    'At least one trusted signer is required for secret transfer.'
  );
  if (!hasUniqueStableKeyIds(request.trustedSigners.map(signer => signer.keyId))) return transferFailure(
    'signer-untrusted',
    'Secret-transfer signer policy is ambiguous.'
  );
  const signatures = await verifyTeleportSignatures(
    shaped.value,
    request.trustedSigners,
    request.requiredSignerKeyIds
  );
  if (!signatures.ok) return transferFailure('signer-untrusted', 'Secret-transfer signer is not trusted.');
  const unlocked = await unlockTeleportCartridgeWithRecipientUnwrapper(
    shaped.value,
    request.recipient
  );
  if (!unlocked.ok) return transferFailure('recipient-mismatch', 'Secret-transfer recipient unlock failed.');
  const capability = decodeProtectedCapability(unlocked.value);
  return capability.type === 'err'
    ? capability
    : authorizeAndCommit(
      request,
      capability.value,
      signatures.value.verifiedSignerKeyIds,
      ports
    );
};

export const importEncryptedSecretTransfer = async (
  request: ImportEncryptedSecretTransferRequest,
  ports: SecretTransferImportPorts
): SecretTransferTaskResult<ImportedEncryptedSecretTransfer> => {
  if (request.cartridgeBytes.byteLength === 0) return transferFailure(
    'input-invalid',
    'Encrypted secret-transfer cartridge is empty.'
  );
  const inventory = await ports.privateInventory.unlock(request.cartridgeBytes);
  return inventory.type === 'err'
    ? inventory
    : verifyUnlockAndImport(request, inventory.value, ports);
};
