import {
  encodeCapability,
  err as teleportErr,
  ok as teleportOk,
  type TeleportCapabilityDependency,
  type TeleportCapabilityCodec,
  type TeleportResult
} from '../teleport/public.ts';
import { parseTransferId, type TransferId } from './journal.ts';
import {
  planSecretTransferExport,
  secretTransferErr,
  secretTransferOk,
  type SecretTransferPortableFacts,
  type SecretTransferResult,
  type SecretTransferTaskResult
} from './secret-transfer.ts';

export const SECRET_TRANSFER_PREVIEW_CAPABILITY_ID = 'dev.credential.secret-transfer-preview';
export const SECRET_TRANSFER_INVENTORY_CAPABILITY_ID = 'dev.credential.secret-transfer-inventory';
export const SECRET_TRANSFER_PREVIEW_VERSION = 1;
export const SECRET_TRANSFER_MAX_INVENTORY_BYTES = 64 * 1024 * 1024;

const BINDING_CAPABILITY_ID = 'dev.credential.secret-transfer-binding';
const PREVIEW_INSTANCE_PREFIX = 'credential-preview:';
const INVENTORY_INSTANCE_PREFIX = 'credential-inventory:';
const TRANSFER_ID_PATTERN: Readonly<RegExp> = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/;
const INSTANCE_ID_PATTERN: Readonly<RegExp> = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const MAX_TEXT = 256;
const MAX_SCOPES = 64;

type SecretTransferPortableBindingWireV1 = Readonly<{
  type: typeof BINDING_CAPABILITY_ID;
  version: 1;
  transferId: string;
  provider: string;
  accountId: string;
  accountLabel: string | null;
  environment: string;
  secretKind: string;
  providerScopes: readonly string[];
  intendedRecipientKeyId: string;
  issuedAtMs: number;
  transferExpiresAtMs: number;
  upstreamExpiresAtMs: number | null;
}>;

export type SecretTransferAuthenticatedPreviewV1 = Readonly<{
  type: typeof SECRET_TRANSFER_PREVIEW_CAPABILITY_ID;
  version: typeof SECRET_TRANSFER_PREVIEW_VERSION;
  transferId: TransferId;
  provider: string;
  accountHint: string;
  environment: string;
  secretKind: string;
  providerScopes: readonly string[];
  intendedRecipientKeyId: string;
  issuedAtMs: number;
  transferExpiresAtMs: number;
  upstreamExpiresAtMs: number | null;
  portableFactsBinding: string;
  inventoryInstanceId: string;
  inventoryCid: string;
}>;

type SecretTransferPreviewWireV1 = Readonly<{
  type: typeof SECRET_TRANSFER_PREVIEW_CAPABILITY_ID;
  version: typeof SECRET_TRANSFER_PREVIEW_VERSION;
  transferId: string;
  provider: string;
  accountHint: string;
  environment: string;
  secretKind: string;
  providerScopes: readonly string[];
  intendedRecipientKeyId: string;
  issuedAtMs: number;
  transferExpiresAtMs: number;
  upstreamExpiresAtMs: number | null;
  portableFactsBinding: string;
  inventoryInstanceId: string;
  inventoryCid: string;
}>;

export type SecretTransferEncryptedInventory = Readonly<{
  bytes: Uint8Array;
}>;

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasExactKeys = (value: Readonly<Record<string, unknown>>, keys: readonly string[]): boolean =>
  Object.keys(value).toSorted().join('\u0000') === keys.toSorted().join('\u0000');

const isBoundedText = (value: unknown, maximum = MAX_TEXT): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= maximum && !value.includes('\0');

const isInstant = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

const parseScopes = (value: unknown): TeleportResult<readonly string[]> => {
  if (!Array.isArray(value) || value.length > MAX_SCOPES ||
      !value.every(scope => isBoundedText(scope, 128))) {
    return teleportErr({ code: 'capability-invalid', message: 'Secret-transfer preview scopes are invalid.' });
  }
  const scopes: readonly string[] = value
    .map(scope => typeof scope === 'string' ? scope : '')
    .toSorted();
  return new Set(scopes).size === scopes.length
    ? teleportOk(scopes)
    : teleportErr({ code: 'capability-invalid', message: 'Secret-transfer preview scopes must be unique.' });
};

const parseBindingWire = (value: unknown): TeleportResult<SecretTransferPortableFacts> => {
  if (!isRecord(value) || !hasExactKeys(value, [
    'accountId',
    'accountLabel',
    'environment',
    'intendedRecipientKeyId',
    'issuedAtMs',
    'provider',
    'providerScopes',
    'secretKind',
    'transferExpiresAtMs',
    'transferId',
    'type',
    'upstreamExpiresAtMs',
    'version'
  ])) return teleportErr({ code: 'capability-invalid', message: 'Secret-transfer binding shape is invalid.' });
  const accountLabel = value['accountLabel'];
  const upstreamExpiresAtMs = value['upstreamExpiresAtMs'];
  const transferId = parseTransferId(value['transferId']);
  const scopes = parseScopes(value['providerScopes']);
  if (value['type'] !== BINDING_CAPABILITY_ID || value['version'] !== 1 ||
      transferId.type === 'err' || !TRANSFER_ID_PATTERN.test(transferId.value.value) ||
      !isBoundedText(value['provider'], 128) || !isBoundedText(value['accountId'], 128) ||
      !(accountLabel === null || isBoundedText(accountLabel)) ||
      !isBoundedText(value['environment'], 128) || !isBoundedText(value['secretKind'], 128) ||
      !isBoundedText(value['intendedRecipientKeyId'], 128) ||
      !isInstant(value['issuedAtMs']) || !isInstant(value['transferExpiresAtMs']) ||
      !(upstreamExpiresAtMs === null || isInstant(upstreamExpiresAtMs)) || !scopes.ok) {
    return teleportErr({ code: 'capability-invalid', message: 'Secret-transfer binding values are invalid.' });
  }
  const planned = planSecretTransferExport({
    transferId: transferId.value,
    provider: value['provider'],
    accountId: value['accountId'],
    accountLabel,
    environment: value['environment'],
    secretKind: value['secretKind'],
    providerScopes: scopes.value,
    intendedRecipientKeyId: value['intendedRecipientKeyId'],
    issuedAtMs: value['issuedAtMs'],
    transferExpiresAtMs: value['transferExpiresAtMs'],
    upstreamExpiresAtMs
  });
  return planned.type === 'ok'
    ? teleportOk(planned.value.facts)
    : teleportErr({ code: 'capability-invalid', message: 'Secret-transfer binding facts are invalid.' });
};

const bindingWire = (
  facts: SecretTransferPortableFacts
): TeleportResult<SecretTransferPortableBindingWireV1> => {
  const value: SecretTransferPortableBindingWireV1 = {
    type: BINDING_CAPABILITY_ID,
    version: 1,
    transferId: facts.transferId.value,
    provider: facts.provider,
    accountId: facts.accountId,
    accountLabel: facts.accountLabel,
    environment: facts.environment,
    secretKind: facts.secretKind,
    providerScopes: facts.providerScopes.toSorted(),
    intendedRecipientKeyId: facts.intendedRecipientKeyId,
    issuedAtMs: facts.issuedAtMs,
    transferExpiresAtMs: facts.transferExpiresAtMs,
    upstreamExpiresAtMs: facts.upstreamExpiresAtMs
  };
  const parsed = parseBindingWire(value);
  return parsed.ok ? teleportOk(value) : parsed;
};

const portableBindingCodec: TeleportCapabilityCodec<SecretTransferPortableFacts> = {
  capabilityId: BINDING_CAPABILITY_ID,
  currentVersion: 1,
  acceptedVersions: [1],
  securityClass: 'private',
  codec: 'dag-cbor',
  budget: {
    maxBlockBytes: 32 * 1024,
    maxDepth: 6,
    maxNodes: 192,
    maxStringBytes: 16 * 1024,
    maxCollectionEntries: 96
  },
  encode: bindingWire,
  decode: (version, value) => version === 1
    ? parseBindingWire(value)
    : teleportErr({ code: 'unsupported-version', message: 'Secret-transfer binding version is unsupported.' }),
  dependencies: (): readonly [] => []
};

export const createSecretTransferPortableFactsBinding = async (
  facts: SecretTransferPortableFacts
): SecretTransferTaskResult<string> => {
  const encoded = await encodeCapability({
    codec: portableBindingCodec,
    value: facts,
    instanceId: 'credential-transfer-binding'
  });
  return encoded.ok
    ? secretTransferOk(encoded.value.cid.toString())
    : secretTransferErr({
      code: 'input-invalid',
      message: 'Secret-transfer portable facts cannot be bound.'
    });
};

const parsePreviewWire = (value: unknown): TeleportResult<SecretTransferAuthenticatedPreviewV1> => {
  if (!isRecord(value) || !hasExactKeys(value, [
    'accountHint',
    'environment',
    'intendedRecipientKeyId',
    'inventoryCid',
    'inventoryInstanceId',
    'issuedAtMs',
    'portableFactsBinding',
    'provider',
    'providerScopes',
    'secretKind',
    'transferExpiresAtMs',
    'transferId',
    'type',
    'upstreamExpiresAtMs',
    'version'
  ])) return teleportErr({ code: 'capability-invalid', message: 'Secret-transfer preview shape is invalid.' });
  const transferId = parseTransferId(value['transferId']);
  const scopes = parseScopes(value['providerScopes']);
  const upstreamExpiresAtMs = value['upstreamExpiresAtMs'];
  if (value['type'] !== SECRET_TRANSFER_PREVIEW_CAPABILITY_ID ||
      value['version'] !== SECRET_TRANSFER_PREVIEW_VERSION || transferId.type === 'err' ||
      !TRANSFER_ID_PATTERN.test(transferId.value.value) || !isBoundedText(value['provider'], 128) ||
      !isBoundedText(value['accountHint'], 64) || !isBoundedText(value['environment'], 128) ||
      !isBoundedText(value['secretKind'], 128) || !isBoundedText(value['intendedRecipientKeyId'], 128) ||
      !isInstant(value['issuedAtMs']) || !isInstant(value['transferExpiresAtMs']) ||
      !(upstreamExpiresAtMs === null || isInstant(upstreamExpiresAtMs)) ||
      !isBoundedText(value['portableFactsBinding']) ||
      !isBoundedText(value['inventoryInstanceId'], 128) ||
      !INSTANCE_ID_PATTERN.test(value['inventoryInstanceId']) ||
      !isBoundedText(value['inventoryCid']) || !scopes.ok ||
      value['transferExpiresAtMs'] <= value['issuedAtMs']) {
    return teleportErr({ code: 'capability-invalid', message: 'Secret-transfer preview values are invalid.' });
  }
  return teleportOk({
    type: SECRET_TRANSFER_PREVIEW_CAPABILITY_ID,
    version: SECRET_TRANSFER_PREVIEW_VERSION,
    transferId: transferId.value,
    provider: value['provider'],
    accountHint: value['accountHint'],
    environment: value['environment'],
    secretKind: value['secretKind'],
    providerScopes: scopes.value,
    intendedRecipientKeyId: value['intendedRecipientKeyId'],
    issuedAtMs: value['issuedAtMs'],
    transferExpiresAtMs: value['transferExpiresAtMs'],
    upstreamExpiresAtMs,
    portableFactsBinding: value['portableFactsBinding'],
    inventoryInstanceId: value['inventoryInstanceId'],
    inventoryCid: value['inventoryCid']
  });
};

const previewWire = (
  preview: SecretTransferAuthenticatedPreviewV1
): TeleportResult<SecretTransferPreviewWireV1> => {
  const value: SecretTransferPreviewWireV1 = {
    type: preview.type,
    version: preview.version,
    transferId: preview.transferId.value,
    provider: preview.provider,
    accountHint: preview.accountHint,
    environment: preview.environment,
    secretKind: preview.secretKind,
    providerScopes: preview.providerScopes,
    intendedRecipientKeyId: preview.intendedRecipientKeyId,
    issuedAtMs: preview.issuedAtMs,
    transferExpiresAtMs: preview.transferExpiresAtMs,
    upstreamExpiresAtMs: preview.upstreamExpiresAtMs,
    portableFactsBinding: preview.portableFactsBinding,
    inventoryInstanceId: preview.inventoryInstanceId,
    inventoryCid: preview.inventoryCid
  };
  const parsed = parsePreviewWire(value);
  return parsed.ok ? teleportOk(value) : parsed;
};

export const secretTransferPreviewCapabilityCodec: TeleportCapabilityCodec<SecretTransferAuthenticatedPreviewV1> = {
  capabilityId: SECRET_TRANSFER_PREVIEW_CAPABILITY_ID,
  currentVersion: SECRET_TRANSFER_PREVIEW_VERSION,
  acceptedVersions: [SECRET_TRANSFER_PREVIEW_VERSION],
  securityClass: 'public',
  codec: 'dag-cbor',
  budget: {
    maxBlockBytes: 32 * 1024,
    maxDepth: 6,
    maxNodes: 192,
    maxStringBytes: 16 * 1024,
    maxCollectionEntries: 96
  },
  encode: previewWire,
  decode: (version, value) => version === SECRET_TRANSFER_PREVIEW_VERSION
    ? parsePreviewWire(value)
    : teleportErr({ code: 'unsupported-version', message: 'Secret-transfer preview version is unsupported.' }),
  dependencies: (preview): readonly TeleportCapabilityDependency[] => [{
    kind: 'hard-decode',
    capabilityId: SECRET_TRANSFER_INVENTORY_CAPABILITY_ID,
    instanceId: preview.inventoryInstanceId,
    required: true
  }]
};

export const secretTransferInventoryCapabilityCodec: TeleportCapabilityCodec<SecretTransferEncryptedInventory> = {
  capabilityId: SECRET_TRANSFER_INVENTORY_CAPABILITY_ID,
  currentVersion: 1,
  acceptedVersions: [1],
  securityClass: 'opaque-native',
  codec: 'raw',
  budget: {
    maxBlockBytes: SECRET_TRANSFER_MAX_INVENTORY_BYTES,
    maxDepth: 1,
    maxNodes: 1,
    maxStringBytes: 1,
    maxCollectionEntries: 1
  },
  encode: value => value.bytes.byteLength > 0 && value.bytes.byteLength <= SECRET_TRANSFER_MAX_INVENTORY_BYTES
    ? teleportOk(Uint8Array.from(value.bytes))
    : teleportErr({ code: 'capability-invalid', message: 'Encrypted secret-transfer inventory is invalid.' }),
  decode: (version, value) => version === 1 && value instanceof Uint8Array && value.byteLength > 0 &&
      value.byteLength <= SECRET_TRANSFER_MAX_INVENTORY_BYTES
    ? teleportOk({ bytes: Uint8Array.from(value) })
    : teleportErr({ code: 'capability-invalid', message: 'Encrypted secret-transfer inventory is invalid.' }),
  dependencies: (): readonly [] => []
};

export const secretTransferPreviewInstanceId = (transferId: TransferId): string =>
  `${PREVIEW_INSTANCE_PREFIX}${transferId.value}`;

export const secretTransferInventoryInstanceId = (transferId: TransferId): string =>
  `${INVENTORY_INSTANCE_PREFIX}${transferId.value}`;

const accountHintForBinding = (binding: string): string => `account:${binding.slice(-12)}`;

export const createSecretTransferAuthenticatedPreview = async (input: Readonly<{
  facts: SecretTransferPortableFacts;
  inventoryCid: string;
}>): SecretTransferTaskResult<SecretTransferAuthenticatedPreviewV1> => {
  const binding = await createSecretTransferPortableFactsBinding(input.facts);
  return binding.type === 'err'
    ? binding
    : secretTransferOk({
      type: SECRET_TRANSFER_PREVIEW_CAPABILITY_ID,
      version: SECRET_TRANSFER_PREVIEW_VERSION,
      transferId: input.facts.transferId,
      provider: input.facts.provider,
      accountHint: accountHintForBinding(binding.value),
      environment: input.facts.environment,
      secretKind: input.facts.secretKind,
      providerScopes: input.facts.providerScopes.toSorted(),
      intendedRecipientKeyId: input.facts.intendedRecipientKeyId,
      issuedAtMs: input.facts.issuedAtMs,
      transferExpiresAtMs: input.facts.transferExpiresAtMs,
      upstreamExpiresAtMs: input.facts.upstreamExpiresAtMs,
      portableFactsBinding: binding.value,
      inventoryInstanceId: secretTransferInventoryInstanceId(input.facts.transferId),
      inventoryCid: input.inventoryCid
    });
};

const sameTextSet = (left: readonly string[], right: readonly string[]): boolean => {
  const normalizedLeft: readonly string[] = [...new Set(left)].toSorted();
  const normalizedRight: readonly string[] = [...new Set(right)].toSorted();
  return normalizedLeft.length === normalizedRight.length &&
    normalizedLeft.every((entry, index) => entry === normalizedRight[index]);
};

export const validateSecretTransferPreviewAdmission = (input: Readonly<{
  preview: SecretTransferAuthenticatedPreviewV1;
  recipientKeyId: string;
  atMs: number;
}>): SecretTransferResult<SecretTransferAuthenticatedPreviewV1> => {
  if (!isInstant(input.atMs)) return secretTransferErr({
    code: 'input-invalid',
    message: 'Secret-transfer preview time is invalid.'
  });
  if (input.preview.intendedRecipientKeyId !== input.recipientKeyId) return secretTransferErr({
    code: 'recipient-mismatch',
    message: 'Secret-transfer preview recipient does not match.'
  });
  return input.atMs < input.preview.issuedAtMs || input.atMs >= input.preview.transferExpiresAtMs ||
    (input.preview.upstreamExpiresAtMs !== null && input.atMs >= input.preview.upstreamExpiresAtMs)
    ? secretTransferErr({ code: 'transfer-expired', message: 'Secret-transfer preview is not currently valid.' })
    : secretTransferOk(input.preview);
};

export const verifySecretTransferPreviewBinding = async (
  preview: SecretTransferAuthenticatedPreviewV1,
  facts: SecretTransferPortableFacts
): SecretTransferTaskResult<void> => {
  const binding = await createSecretTransferPortableFactsBinding(facts);
  if (binding.type === 'err') return binding;
  const matches = preview.transferId.value === facts.transferId.value &&
    preview.provider === facts.provider && preview.environment === facts.environment &&
    preview.secretKind === facts.secretKind && sameTextSet(preview.providerScopes, facts.providerScopes) &&
    preview.intendedRecipientKeyId === facts.intendedRecipientKeyId &&
    preview.issuedAtMs === facts.issuedAtMs &&
    preview.transferExpiresAtMs === facts.transferExpiresAtMs &&
    preview.upstreamExpiresAtMs === facts.upstreamExpiresAtMs &&
    preview.portableFactsBinding === binding.value &&
    preview.accountHint === accountHintForBinding(binding.value);
  return matches
    ? secretTransferOk(undefined)
    : secretTransferErr({
      code: 'preview-mismatch',
      message: 'Authenticated preview does not match the unlocked secret transfer.'
    });
};
