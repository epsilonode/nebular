import {
  err,
  ok,
  type TeleportCapabilityCodec,
  type TeleportResult
} from '../teleport/public.ts';

export const CREDENTIAL_REQUIREMENT_CAPABILITY_ID = 'dev.credential.requirement' as const;
export const CREDENTIAL_REQUIREMENT_CAPABILITY_VERSION = 1 as const;

const MAX_IDENTITY_LENGTH = 128;
const MAX_ACCOUNT_LABEL_LENGTH = 256;
const MAX_REPOSITORY_LENGTH = 4096;
const MAX_REQUIREMENTS = 64;
const IDENTITY_PATTERN: Readonly<RegExp> = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u;
const INJECTION_NAME_PATTERN: Readonly<RegExp> = /^[A-Z_][A-Z0-9_]{0,127}$/u;

export type CredentialRequirementProjectBinding =
  | Readonly<{ policy: 'any-project'; repository: null }>
  | Readonly<{ policy: 'exact-repository'; repository: string }>;

export type CredentialRequirementAccountConstraint =
  | null
  | Readonly<{ accountId: string | null; accountLabel: string | null }>;

export type CredentialRequirementV1 = Readonly<{
  type: typeof CREDENTIAL_REQUIREMENT_CAPABILITY_ID;
  version: typeof CREDENTIAL_REQUIREMENT_CAPABILITY_VERSION;
  provider: string;
  environment: string;
  scopes: readonly string[];
  operations: readonly string[];
  projectBinding: CredentialRequirementProjectBinding;
  injectionName: string;
  accountConstraint: CredentialRequirementAccountConstraint;
}>;

type CredentialRequirementWireV1 = Readonly<{
  type: typeof CREDENTIAL_REQUIREMENT_CAPABILITY_ID;
  version: typeof CREDENTIAL_REQUIREMENT_CAPABILITY_VERSION;
  provider: string;
  environment: string;
  scopes: readonly string[];
  operations: readonly string[];
  projectBindingPolicy: 'any-project' | 'exact-repository';
  repository: string | null;
  injectionName: string;
  accountId: string | null;
  accountLabel: string | null;
}>;

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasExactKeys = (value: Readonly<Record<string, unknown>>, keys: readonly string[]): boolean =>
  Object.keys(value).toSorted().join('\u0000') === keys.toSorted().join('\u0000');

const isIdentity = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= MAX_IDENTITY_LENGTH &&
  !value.includes('\0') && IDENTITY_PATTERN.test(value);

const isAccountLabel = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= MAX_ACCOUNT_LABEL_LENGTH &&
  !value.includes('\0');

const isRepository = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= MAX_REPOSITORY_LENGTH &&
  !value.includes('\0');

const parseRequirementSet = (
  value: unknown,
  label: string
): TeleportResult<readonly string[]> => {
  if (!Array.isArray(value) || value.length > MAX_REQUIREMENTS || !value.every(isIdentity)) {
    return err({ code: 'capability-invalid', message: `Credential requirement ${label} are invalid.` });
  }
  const normalized: readonly string[] = value.toSorted();
  return new Set(normalized).size === normalized.length
    ? ok(normalized)
    : err({ code: 'capability-invalid', message: `Credential requirement ${label} must be unique.` });
};

const parseProjectBinding = (
  policy: unknown,
  repository: unknown
): TeleportResult<CredentialRequirementProjectBinding> => {
  if (policy === 'any-project' && repository === null) return ok({ policy, repository });
  if (policy === 'exact-repository' && isRepository(repository)) return ok({ policy, repository });
  return err({ code: 'capability-invalid', message: 'Credential requirement project binding is invalid.' });
};

const parseAccountConstraint = (
  accountId: unknown,
  accountLabel: unknown
): TeleportResult<CredentialRequirementAccountConstraint> => {
  if (accountId === null && accountLabel === null) return ok(null);
  if ((accountId === null || isIdentity(accountId)) && (accountLabel === null || isAccountLabel(accountLabel))) {
    return ok({ accountId, accountLabel });
  }
  return err({ code: 'capability-invalid', message: 'Credential requirement account constraint is invalid.' });
};

const parseWire = (value: unknown): TeleportResult<CredentialRequirementV1> => {
  if (!isRecord(value) || !hasExactKeys(value, [
    'accountId',
    'accountLabel',
    'environment',
    'injectionName',
    'operations',
    'projectBindingPolicy',
    'provider',
    'repository',
    'scopes',
    'type',
    'version'
  ])) return err({ code: 'capability-invalid', message: 'Credential requirement wire shape is invalid.' });
  if (value['type'] !== CREDENTIAL_REQUIREMENT_CAPABILITY_ID ||
      value['version'] !== CREDENTIAL_REQUIREMENT_CAPABILITY_VERSION ||
      !isIdentity(value['provider']) || !isIdentity(value['environment']) ||
      typeof value['injectionName'] !== 'string' || !INJECTION_NAME_PATTERN.test(value['injectionName'])) {
    return err({ code: 'capability-invalid', message: 'Credential requirement wire values are invalid.' });
  }
  const scopes = parseRequirementSet(value['scopes'], 'scopes');
  const operations = parseRequirementSet(value['operations'], 'operations');
  const projectBinding = parseProjectBinding(value['projectBindingPolicy'], value['repository']);
  const accountConstraint = parseAccountConstraint(value['accountId'], value['accountLabel']);
  if (!scopes.ok) return scopes;
  if (!operations.ok) return operations;
  if (!projectBinding.ok) return projectBinding;
  if (!accountConstraint.ok) return accountConstraint;
  return ok({
    type: CREDENTIAL_REQUIREMENT_CAPABILITY_ID,
    version: CREDENTIAL_REQUIREMENT_CAPABILITY_VERSION,
    provider: value['provider'],
    environment: value['environment'],
    scopes: scopes.value,
    operations: operations.value,
    projectBinding: projectBinding.value,
    injectionName: value['injectionName'],
    accountConstraint: accountConstraint.value
  });
};

const projectWire = (value: CredentialRequirementV1): TeleportResult<CredentialRequirementWireV1> => {
  const candidate: CredentialRequirementWireV1 = {
    type: value.type,
    version: value.version,
    provider: value.provider,
    environment: value.environment,
    scopes: value.scopes,
    operations: value.operations,
    projectBindingPolicy: value.projectBinding.policy,
    repository: value.projectBinding.repository,
    injectionName: value.injectionName,
    accountId: value.accountConstraint?.accountId ?? null,
    accountLabel: value.accountConstraint?.accountLabel ?? null
  };
  const parsed = parseWire(candidate);
  if (!parsed.ok) return parsed;
  return ok({
    type: parsed.value.type,
    version: parsed.value.version,
    provider: parsed.value.provider,
    environment: parsed.value.environment,
    scopes: parsed.value.scopes,
    operations: parsed.value.operations,
    projectBindingPolicy: parsed.value.projectBinding.policy,
    repository: parsed.value.projectBinding.repository,
    injectionName: parsed.value.injectionName,
    accountId: parsed.value.accountConstraint?.accountId ?? null,
    accountLabel: parsed.value.accountConstraint?.accountLabel ?? null
  });
};

export const credentialRequirementCapabilityCodec: TeleportCapabilityCodec<CredentialRequirementV1> = {
  capabilityId: CREDENTIAL_REQUIREMENT_CAPABILITY_ID,
  currentVersion: CREDENTIAL_REQUIREMENT_CAPABILITY_VERSION,
  acceptedVersions: [CREDENTIAL_REQUIREMENT_CAPABILITY_VERSION],
  securityClass: 'public',
  codec: 'dag-cbor',
  budget: {
    maxBlockBytes: 32 * 1024,
    maxDepth: 6,
    maxNodes: 192,
    maxStringBytes: 16 * 1024,
    maxCollectionEntries: 160
  },
  encode: projectWire,
  decode: (version, value) => version === CREDENTIAL_REQUIREMENT_CAPABILITY_VERSION
    ? parseWire(value)
    : err({ code: 'unsupported-version', message: 'Credential requirement schema version is unsupported.' }),
  dependencies: (): readonly [] => [],
  restorePlan: (_value, context) => ok([{
    id: `credential-requirement:${context.instanceId}`,
    capabilityInstanceId: context.instanceId,
    effect: 'unresolved-retain',
    dependsOn: [],
    resources: [],
    requiresConfirmation: false,
    reversible: true,
    verification: 'credential requirement is retained and reported without provider, keychain, or consent activity',
    rollback: 'retain the unresolved credential requirement'
  }])
};
