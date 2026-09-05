import { type TeleportCapabilityCodec } from '../teleport/public.ts';
import type { CredentialReference } from './lease.ts';
import { type RedactedAuthorityDigest, type TransferId } from './journal.ts';
import type { CanonicalRepository, GrantId, RecipeRevision } from './primitives.ts';
export declare const SECRET_TRANSFER_CAPABILITY_ID = "dev.credential.secret-transfer";
export declare const SECRET_TRANSFER_CAPABILITY_VERSION = 1;
export declare const SECRET_TRANSFER_MAX_BYTES: number;
export declare const SECRET_TRANSFER_MAX_LIFETIME_MS: number;
export type SecretTransferIssueCode = 'car-build-failed' | 'car-invalid' | 'conflict-rejected' | 'consent-denied' | 'destination-denied' | 'input-invalid' | 'private-inventory-rejected' | 'preview-mismatch' | 'protection-required' | 'recipient-mismatch' | 'recovery-required' | 'signature-required' | 'signer-untrusted' | 'source-unavailable' | 'transaction-failed' | 'transfer-expired' | 'transfer-replayed';
export type SecretTransferIssue = Readonly<{
    code: SecretTransferIssueCode;
    message: string;
}>;
export type SecretTransferIssues = readonly [SecretTransferIssue, ...SecretTransferIssue[]];
export type SecretTransferResult<T> = Readonly<{
    type: 'ok';
    value: T;
}> | Readonly<{
    type: 'err';
    issues: SecretTransferIssues;
}>;
export type SecretTransferTaskResult<T> = Promise<SecretTransferResult<T>>;
export declare const secretTransferOk: <T>(value: T) => SecretTransferResult<T>;
export declare const secretTransferErr: <T = never>(issue: SecretTransferIssue, ...rest: readonly SecretTransferIssue[]) => SecretTransferResult<T>;
export type SecretTransferPlaintext = Readonly<{
    bytes: Uint8Array;
}>;
export type SecretTransferProviderFacts = Readonly<{
    provider: string;
    accountId: string;
    accountLabel: string | null;
    environment: string;
    secretKind: string;
    providerScopes: readonly string[];
    upstreamExpiresAtMs: number | null;
}>;
export type SecretTransferPortableFacts = SecretTransferProviderFacts & Readonly<{
    transferId: TransferId;
    intendedRecipientKeyId: string;
    issuedAtMs: number;
    transferExpiresAtMs: number;
}>;
export type SecretTransferCapabilityV1 = SecretTransferPortableFacts & Readonly<{
    type: typeof SECRET_TRANSFER_CAPABILITY_ID;
    version: typeof SECRET_TRANSFER_CAPABILITY_VERSION;
    secret: SecretTransferPlaintext;
}>;
export type SecretTransferConflictPolicy = 'reject' | 'replace-with-elevated-consent' | 'new-reference';
export type SecretTransferDestinationStatus = 'absent' | 'present';
export type SecretTransferReplayStatus = 'fresh' | 'consumed';
export type SecretTransferExportPlan = Readonly<{
    state: 'planned';
    facts: SecretTransferPortableFacts;
}>;
export type SecretTransferDestinationRequest = Readonly<{
    repository: CanonicalRepository;
    recipeRevision: RecipeRevision;
    credentialReference: CredentialReference;
    conflictPolicy: SecretTransferConflictPolicy;
}>;
export type AuthorizedSecretTransferDestination = Readonly<{
    state: 'authorized';
    repository: CanonicalRepository;
    recipeRevision: RecipeRevision;
    credentialReference: CredentialReference;
    destinationGrantId: GrantId;
    authorityDigest: RedactedAuthorityDigest;
    provider: string;
    accountId: string;
    environment: string;
    permittedScopes: readonly string[];
    grantExpiresAtMs: number;
}>;
export type SecretTransferImportPlan = Readonly<{
    state: 'ready-to-commit';
    facts: SecretTransferPortableFacts;
    destination: AuthorizedSecretTransferDestination;
    conflictPolicy: SecretTransferConflictPolicy;
    destinationStatus: SecretTransferDestinationStatus;
    consent: 'car-unlock' | 'car-unlock-and-elevated-replace';
}>;
export declare const secretTransferCapabilityCodec: TeleportCapabilityCodec<SecretTransferCapabilityV1>;
export declare const secretTransferPortableFacts: (capability: SecretTransferCapabilityV1) => SecretTransferPortableFacts;
export declare const planSecretTransferExport: (facts: SecretTransferPortableFacts) => SecretTransferResult<SecretTransferExportPlan>;
export declare const validateSecretTransferPortableAdmission: (input: Readonly<{
    facts: SecretTransferPortableFacts;
    recipientKeyId: string;
    atMs: number;
}>) => SecretTransferResult<SecretTransferPortableFacts>;
export declare const planSecretTransferImport: (input: Readonly<{
    facts: SecretTransferPortableFacts;
    recipientKeyId: string;
    atMs: number;
    replayStatus: SecretTransferReplayStatus;
    destinationRequest: SecretTransferDestinationRequest;
    destination: AuthorizedSecretTransferDestination;
    destinationStatus: SecretTransferDestinationStatus;
}>) => SecretTransferResult<SecretTransferImportPlan>;
