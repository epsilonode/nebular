import {
  err as teleportErr,
  ok as teleportOk,
  type TeleportCapabilityCodec,
  type TeleportResult
} from '../teleport/public.ts';
import type { CredentialReference } from './lease.ts';
import {
  parseTransferId,
  type RedactedAuthorityDigest,
  type TransferId
} from './journal.ts';
import type {
  CanonicalRepository,
  GrantId,
  RecipeRevision
} from './primitives.ts';

export const SECRET_TRANSFER_CAPABILITY_ID = 'dev.credential.secret-transfer';
export const SECRET_TRANSFER_CAPABILITY_VERSION = 1;
export const SECRET_TRANSFER_MAX_BYTES = 64 * 1024;
export const SECRET_TRANSFER_MAX_LIFETIME_MS = 7 * 24 * 60 * 60 * 1_000;

const MAX_IDENTITY_LENGTH = 128;
const MAX_LABEL_LENGTH = 256;
const MAX_SCOPES = 64;
const TRANSFER_ID_PATTERN: Readonly<RegExp> = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/;

export type SecretTransferIssueCode =
  | 'car-build-failed'
  | 'car-invalid'
  | 'conflict-rejected'
  | 'consent-denied'
  | 'destination-denied'
  | 'input-invalid'
  | 'private-inventory-rejected'
  | 'protection-required'
  | 'recipient-mismatch'
  | 'recovery-required'
  | 'signature-required'
  | 'signer-untrusted'
  | 'source-unavailable'
  | 'transaction-failed'
  | 'transfer-expired'
  | 'transfer-replayed';

export type SecretTransferIssue = Readonly<{
  code: SecretTransferIssueCode;
  message: string;
}>;

export type SecretTransferIssues = readonly [SecretTransferIssue, ...SecretTransferIssue[]];

export type SecretTransferResult<T> =
  | Readonly<{ type: 'ok'; value: T }>
  | Readonly<{ type: 'err'; issues: SecretTransferIssues }>;

export type SecretTransferTaskResult<T> = Promise<SecretTransferResult<T>>;

export const secretTransferOk = <T>(value: T): SecretTransferResult<T> => ({ type: 'ok', value });

export const secretTransferErr = <T = never>(
  issue: SecretTransferIssue,
  ...rest: readonly SecretTransferIssue[]
): SecretTransferResult<T> => ({ type: 'err', issues: [issue, ...rest] });

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

type SecretTransferWireV1 = Readonly<{
  type: typeof SECRET_TRANSFER_CAPABILITY_ID;
  version: typeof SECRET_TRANSFER_CAPABILITY_VERSION;
  transferId: string;
  provider: string;
  accountId: string;
  accountLabel: string | null;
  environment: string;
  secretKind: string;
  secretBytes: Uint8Array;
  providerScopes: readonly string[];
  intendedRecipientKeyId: string;
  issuedAtMs: number;
  transferExpiresAtMs: number;
  upstreamExpiresAtMs: number | null;
}>;

export type SecretTransferConflictPolicy =
  | 'reject'
  | 'replace-with-elevated-consent'
  | 'new-reference';

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

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasExactKeys = (value: Readonly<Record<string, unknown>>, keys: readonly string[]): boolean =>
  Object.keys(value).toSorted().join('\u0000') === keys.toSorted().join('\u0000');

const isBoundedText = (value: unknown, maximumLength: number): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= maximumLength && !value.includes('\0');

const isInstant = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

const parseScopes = (value: unknown): TeleportResult<readonly string[]> => {
  if (!Array.isArray(value) || value.length > MAX_SCOPES ||
      !value.every(scope => isBoundedText(scope, MAX_IDENTITY_LENGTH))) {
    return teleportErr({ code: 'capability-invalid', message: 'Secret-transfer provider scopes are invalid.' });
  }
  const scopes: readonly string[] = value
    .map(scope => typeof scope === 'string' ? scope : '')
    .toSorted();
  return new Set(scopes).size === scopes.length
    ? teleportOk(scopes)
    : teleportErr({ code: 'capability-invalid', message: 'Secret-transfer provider scopes must be unique.' });
};

const parsePlaintext = (value: unknown): TeleportResult<SecretTransferPlaintext> =>
  value instanceof Uint8Array && value.byteLength > 0 && value.byteLength <= SECRET_TRANSFER_MAX_BYTES
    ? teleportOk({ bytes: Uint8Array.from(value) })
    : teleportErr({ code: 'capability-invalid', message: 'Secret-transfer plaintext is invalid.' });

const parseTransferIdentity = (value: unknown): TeleportResult<TransferId> => {
  const parsed = parseTransferId(value);
  return parsed.type === 'ok' && TRANSFER_ID_PATTERN.test(parsed.value.value)
    ? teleportOk(parsed.value)
    : teleportErr({ code: 'capability-invalid', message: 'Secret-transfer identity is invalid.' });
};

const validateLifetime = (
  issuedAtMs: number,
  transferExpiresAtMs: number,
  upstreamExpiresAtMs: number | null
): TeleportResult<void> => {
  if (transferExpiresAtMs <= issuedAtMs ||
      transferExpiresAtMs - issuedAtMs > SECRET_TRANSFER_MAX_LIFETIME_MS) {
    return teleportErr({ code: 'capability-invalid', message: 'Secret-transfer lifetime is invalid.' });
  }
  return upstreamExpiresAtMs !== null && upstreamExpiresAtMs <= issuedAtMs
    ? teleportErr({ code: 'capability-invalid', message: 'Secret-transfer upstream expiry is invalid.' })
    : teleportOk(undefined);
};

const parseWire = (value: unknown): TeleportResult<SecretTransferCapabilityV1> => {
  if (!isRecord(value) || !hasExactKeys(value, [
    'accountId',
    'accountLabel',
    'environment',
    'intendedRecipientKeyId',
    'issuedAtMs',
    'provider',
    'providerScopes',
    'secretBytes',
    'secretKind',
    'transferExpiresAtMs',
    'transferId',
    'type',
    'upstreamExpiresAtMs',
    'version'
  ])) return teleportErr({ code: 'capability-invalid', message: 'Secret-transfer wire shape is invalid.' });

  const accountLabel = value['accountLabel'];
  const upstreamExpiresAtMs = value['upstreamExpiresAtMs'];
  if (value['type'] !== SECRET_TRANSFER_CAPABILITY_ID ||
      value['version'] !== SECRET_TRANSFER_CAPABILITY_VERSION ||
      !isBoundedText(value['provider'], MAX_IDENTITY_LENGTH) ||
      !isBoundedText(value['accountId'], MAX_IDENTITY_LENGTH) ||
      !(accountLabel === null || isBoundedText(accountLabel, MAX_LABEL_LENGTH)) ||
      !isBoundedText(value['environment'], MAX_IDENTITY_LENGTH) ||
      !isBoundedText(value['secretKind'], MAX_IDENTITY_LENGTH) ||
      !isBoundedText(value['intendedRecipientKeyId'], MAX_IDENTITY_LENGTH) ||
      !isInstant(value['issuedAtMs']) ||
      !isInstant(value['transferExpiresAtMs']) ||
      !(upstreamExpiresAtMs === null || isInstant(upstreamExpiresAtMs))) {
    return teleportErr({ code: 'capability-invalid', message: 'Secret-transfer wire values are invalid.' });
  }

  const transferId = parseTransferIdentity(value['transferId']);
  if (!transferId.ok) return transferId;
  const scopes = parseScopes(value['providerScopes']);
  if (!scopes.ok) return scopes;
  const secret = parsePlaintext(value['secretBytes']);
  if (!secret.ok) return secret;
  const lifetime = validateLifetime(value['issuedAtMs'], value['transferExpiresAtMs'], upstreamExpiresAtMs);
  return !lifetime.ok
    ? lifetime
    : teleportOk({
      type: SECRET_TRANSFER_CAPABILITY_ID,
      version: SECRET_TRANSFER_CAPABILITY_VERSION,
      transferId: transferId.value,
      provider: value['provider'],
      accountId: value['accountId'],
      accountLabel,
      environment: value['environment'],
      secretKind: value['secretKind'],
      secret: secret.value,
      providerScopes: scopes.value,
      intendedRecipientKeyId: value['intendedRecipientKeyId'],
      issuedAtMs: value['issuedAtMs'],
      transferExpiresAtMs: value['transferExpiresAtMs'],
      upstreamExpiresAtMs
    });
};

const projectWire = (value: SecretTransferCapabilityV1): TeleportResult<SecretTransferWireV1> => {
  const candidate: unknown = {
    type: value.type,
    version: value.version,
    transferId: value.transferId.value,
    provider: value.provider,
    accountId: value.accountId,
    accountLabel: value.accountLabel,
    environment: value.environment,
    secretKind: value.secretKind,
    secretBytes: value.secret.bytes,
    providerScopes: value.providerScopes,
    intendedRecipientKeyId: value.intendedRecipientKeyId,
    issuedAtMs: value.issuedAtMs,
    transferExpiresAtMs: value.transferExpiresAtMs,
    upstreamExpiresAtMs: value.upstreamExpiresAtMs
  };
  const parsed = parseWire(candidate);
  return parsed.ok
    ? teleportOk({
      type: parsed.value.type,
      version: parsed.value.version,
      transferId: parsed.value.transferId.value,
      provider: parsed.value.provider,
      accountId: parsed.value.accountId,
      accountLabel: parsed.value.accountLabel,
      environment: parsed.value.environment,
      secretKind: parsed.value.secretKind,
      secretBytes: parsed.value.secret.bytes,
      providerScopes: parsed.value.providerScopes,
      intendedRecipientKeyId: parsed.value.intendedRecipientKeyId,
      issuedAtMs: parsed.value.issuedAtMs,
      transferExpiresAtMs: parsed.value.transferExpiresAtMs,
      upstreamExpiresAtMs: parsed.value.upstreamExpiresAtMs
    })
    : parsed;
};

export const secretTransferCapabilityCodec: TeleportCapabilityCodec<SecretTransferCapabilityV1> = {
  capabilityId: SECRET_TRANSFER_CAPABILITY_ID,
  currentVersion: SECRET_TRANSFER_CAPABILITY_VERSION,
  acceptedVersions: [SECRET_TRANSFER_CAPABILITY_VERSION],
  securityClass: 'secret',
  codec: 'dag-cbor',
  budget: {
    maxBlockBytes: 96 * 1024,
    maxDepth: 8,
    maxNodes: 256,
    maxStringBytes: 32 * 1024,
    maxCollectionEntries: 128
  },
  encode: projectWire,
  decode: (version, value) => version === SECRET_TRANSFER_CAPABILITY_VERSION
    ? parseWire(value)
    : teleportErr({ code: 'unsupported-version', message: 'Secret-transfer schema version is unsupported.' }),
  dependencies: (): readonly [] => []
};

export const secretTransferPortableFacts = (
  capability: SecretTransferCapabilityV1
): SecretTransferPortableFacts => ({
  transferId: capability.transferId,
  provider: capability.provider,
  accountId: capability.accountId,
  accountLabel: capability.accountLabel,
  environment: capability.environment,
  secretKind: capability.secretKind,
  providerScopes: capability.providerScopes,
  intendedRecipientKeyId: capability.intendedRecipientKeyId,
  issuedAtMs: capability.issuedAtMs,
  transferExpiresAtMs: capability.transferExpiresAtMs,
  upstreamExpiresAtMs: capability.upstreamExpiresAtMs
});

export const planSecretTransferExport = (
  facts: SecretTransferPortableFacts
): SecretTransferResult<SecretTransferExportPlan> => {
  const transferId = parseTransferIdentity(facts.transferId.value);
  const scopes = parseScopes(facts.providerScopes);
  const lifetime = validateLifetime(
    facts.issuedAtMs,
    facts.transferExpiresAtMs,
    facts.upstreamExpiresAtMs
  );
  if (!transferId.ok || !scopes.ok || !lifetime.ok ||
      !isBoundedText(facts.provider, MAX_IDENTITY_LENGTH) ||
      !isBoundedText(facts.accountId, MAX_IDENTITY_LENGTH) ||
      !(facts.accountLabel === null || isBoundedText(facts.accountLabel, MAX_LABEL_LENGTH)) ||
      !isBoundedText(facts.environment, MAX_IDENTITY_LENGTH) ||
      !isBoundedText(facts.secretKind, MAX_IDENTITY_LENGTH) ||
      !isBoundedText(facts.intendedRecipientKeyId, MAX_IDENTITY_LENGTH) ||
      !isInstant(facts.issuedAtMs) || !isInstant(facts.transferExpiresAtMs) ||
      !(facts.upstreamExpiresAtMs === null || isInstant(facts.upstreamExpiresAtMs))) {
    return secretTransferErr({
      code: 'input-invalid',
      message: 'Secret-transfer export facts are invalid.'
    });
  }
  return secretTransferOk({
    state: 'planned',
    facts: {
      ...facts,
      transferId: transferId.value,
      providerScopes: scopes.value
    }
  });
};

const sameScopesOrNarrower = (
  permitted: readonly string[],
  factual: readonly string[]
): boolean => permitted.every(scope => factual.includes(scope));

const destinationMatchesRequest = (
  destination: AuthorizedSecretTransferDestination,
  request: SecretTransferDestinationRequest
): boolean => destination.repository === request.repository &&
  destination.recipeRevision === request.recipeRevision &&
  destination.credentialReference.value === request.credentialReference.value;

export const validateSecretTransferPortableAdmission = (input: Readonly<{
  facts: SecretTransferPortableFacts;
  recipientKeyId: string;
  atMs: number;
}>): SecretTransferResult<SecretTransferPortableFacts> => {
  if (!isInstant(input.atMs)) return secretTransferErr({
    code: 'input-invalid',
    message: 'Secret-transfer import time is invalid.'
  });
  if (input.facts.intendedRecipientKeyId !== input.recipientKeyId) return secretTransferErr({
    code: 'recipient-mismatch',
    message: 'Secret-transfer recipient does not match the destination authority.'
  });
  return input.atMs < input.facts.issuedAtMs || input.atMs >= input.facts.transferExpiresAtMs ||
    (input.facts.upstreamExpiresAtMs !== null && input.atMs >= input.facts.upstreamExpiresAtMs)
    ? secretTransferErr({ code: 'transfer-expired', message: 'Secret transfer is not currently valid.' })
    : secretTransferOk(input.facts);
};

export const planSecretTransferImport = (input: Readonly<{
  facts: SecretTransferPortableFacts;
  recipientKeyId: string;
  atMs: number;
  replayStatus: SecretTransferReplayStatus;
  destinationRequest: SecretTransferDestinationRequest;
  destination: AuthorizedSecretTransferDestination;
  destinationStatus: SecretTransferDestinationStatus;
}>): SecretTransferResult<SecretTransferImportPlan> => {
  const admitted = validateSecretTransferPortableAdmission(input);
  if (admitted.type === 'err') return admitted;
  if (input.replayStatus === 'consumed') return secretTransferErr({
    code: 'transfer-replayed',
    message: 'Secret transfer was already consumed.'
  });
  if (!destinationMatchesRequest(input.destination, input.destinationRequest) ||
      input.destination.provider !== input.facts.provider ||
      input.destination.accountId !== input.facts.accountId ||
      input.destination.environment !== input.facts.environment ||
      !sameScopesOrNarrower(input.destination.permittedScopes, input.facts.providerScopes) ||
      input.destination.grantExpiresAtMs <= input.atMs ||
      (input.facts.upstreamExpiresAtMs !== null &&
        input.destination.grantExpiresAtMs > input.facts.upstreamExpiresAtMs)) {
    return secretTransferErr({
      code: 'destination-denied',
      message: 'Destination authority is inconsistent with portable provider constraints.'
    });
  }
  if (input.destinationStatus === 'present' &&
      input.destinationRequest.conflictPolicy !== 'replace-with-elevated-consent') {
    return secretTransferErr({
      code: 'conflict-rejected',
      message: 'Destination credential conflict requires an explicit elevated replacement policy.'
    });
  }
  return secretTransferOk({
    state: 'ready-to-commit',
    facts: input.facts,
    destination: input.destination,
    conflictPolicy: input.destinationRequest.conflictPolicy,
    destinationStatus: input.destinationStatus,
    consent: input.destinationStatus === 'present'
      ? 'car-unlock-and-elevated-replace'
      : 'car-unlock'
  });
};
