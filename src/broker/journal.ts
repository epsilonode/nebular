import type {
  CredentialReference,
  SecretExposureCleanupReceipt,
  SecretExposureCorrelation
} from './lease.ts';
import type {
  CanonicalRepository,
  CredentialSlotId,
  GrantId,
  ProcessAttemptId,
  ReceiverId,
  RecipeRevision
} from './primitives.ts';

export type JournalIssueCode =
  | 'journal-busy'
  | 'journal-closed'
  | 'journal-conflict'
  | 'journal-authority-stale'
  | 'journal-corrupt'
  | 'journal-invalid'
  | 'journal-not-found'
  | 'journal-recovery-required'
  | 'journal-schema-newer'
  | 'journal-unavailable'
  | 'transfer-replayed';

export type JournalIssue = Readonly<{
  code: JournalIssueCode;
  message: string;
}>;

export type JournalIssues = readonly [JournalIssue, ...JournalIssue[]];

export type JournalResult<T> =
  | Readonly<{ type: 'ok'; value: T }>
  | Readonly<{ type: 'err'; issues: JournalIssues }>;

export type JournalTaskResult<T> = Promise<JournalResult<T>>;

export const journalOk = <T>(value: T): JournalResult<T> => ({ type: 'ok', value });
export const journalErr = <T = never>(
  issue: JournalIssue,
  ...rest: readonly JournalIssue[]
): JournalResult<T> => ({ type: 'err', issues: [issue, ...rest] });

export const mapJournalResult = <T, U>(
  result: JournalResult<T>,
  map: (value: T) => U
): JournalResult<U> => result.type === 'ok' ? journalOk(map(result.value)) : result;

export const andThenJournalResult = <T, U>(
  result: JournalResult<T>,
  next: (value: T) => JournalResult<U>
): JournalResult<U> => result.type === 'ok' ? next(result.value) : result;

type JournalReference<Kind extends string> = Readonly<{
  kind: Kind;
  value: string;
}>;

export type ConsentId = JournalReference<'consent-id'>;
export type LeaseJournalId = JournalReference<'lease-id'>;
export type TransferId = JournalReference<'transfer-id'>;
export type JournalOperationId = JournalReference<'journal-operation-id'>;
export type BootstrapExchangeJournalId = JournalReference<'bootstrap-exchange-id'>;
export type RedactedAuthorityDigest = JournalReference<'redacted-authority-digest'>;
export type RedactedPlanDigest = JournalReference<'redacted-plan-digest'>;
export type ReceiverCorrelation = JournalReference<'receiver-correlation'>;
export type CheckedInRecipeLocator = JournalReference<'checked-in-recipe-locator'>;
export type ReceiverEntryIdentity = JournalReference<'receiver-entry-identity'>;
export type ProcessIncarnation = JournalReference<'process-incarnation'>;
export type DurableWindowsNamedJobIdentity = JournalReference<'windows-named-job-identity'>;
export type TrustedProfileRoot = JournalReference<'trusted-profile-root'>;
export type AuthorityDatabasePath = JournalReference<'authority-database-path'>;

type PublicJournalReference =
  | ConsentId
  | LeaseJournalId
  | TransferId
  | JournalOperationId
  | BootstrapExchangeJournalId
  | RedactedAuthorityDigest
  | RedactedPlanDigest
  | ReceiverCorrelation
  | CheckedInRecipeLocator
  | ReceiverEntryIdentity
  | ProcessIncarnation
  | DurableWindowsNamedJobIdentity
  | TrustedProfileRoot
  | AuthorityDatabasePath;

const parseReference = <Kind extends PublicJournalReference['kind']>(
  kind: Kind,
  value: unknown,
  maximumLength: number = 256
): JournalResult<JournalReference<Kind>> =>
  typeof value === 'string' && value.length > 0 && value.length <= maximumLength && !value.includes('\0')
    ? journalOk({ kind, value })
    : journalErr({ code: 'journal-invalid', message: `${kind} is invalid.` });

export const parseConsentId = (value: unknown): JournalResult<ConsentId> => parseReference('consent-id', value);
export const parseLeaseJournalId = (value: unknown): JournalResult<LeaseJournalId> => parseReference('lease-id', value);
export const parseTransferId = (value: unknown): JournalResult<TransferId> => parseReference('transfer-id', value);
export const parseJournalOperationId = (value: unknown): JournalResult<JournalOperationId> =>
  parseReference('journal-operation-id', value);
export const parseBootstrapExchangeJournalId = (value: unknown): JournalResult<BootstrapExchangeJournalId> =>
  parseReference('bootstrap-exchange-id', value, 128);
export const parseRedactedAuthorityDigest = (value: unknown): JournalResult<RedactedAuthorityDigest> =>
  parseReference('redacted-authority-digest', value, 512);
export const parseRedactedPlanDigest = (value: unknown): JournalResult<RedactedPlanDigest> =>
  parseReference('redacted-plan-digest', value, 512);
export const parseReceiverCorrelation = (value: unknown): JournalResult<ReceiverCorrelation> =>
  parseReference('receiver-correlation', value, 512);
export const parseReceiverEntryIdentity = (value: unknown): JournalResult<ReceiverEntryIdentity> =>
  parseReference('receiver-entry-identity', value, 512);
export const parseProcessIncarnation = (value: unknown): JournalResult<ProcessIncarnation> =>
  parseReference('process-incarnation', value, 512);
export const parseDurableWindowsNamedJobIdentity = (
  value: unknown
): JournalResult<DurableWindowsNamedJobIdentity> => parseReference('windows-named-job-identity', value, 512);

const isCheckedInRecipeLocator = (value: string): boolean => {
  const normalized = value.replaceAll('\\', '/');
  const segments: readonly string[] = normalized.split('/');
  return value.length <= 1024 && !value.includes('\0') && !value.startsWith('/') &&
    !/^[A-Za-z]:/u.test(value) && segments.every(segment => segment.length > 0 && segment !== '.' && segment !== '..');
};

export const parseCheckedInRecipeLocator = (value: unknown): JournalResult<CheckedInRecipeLocator> =>
  typeof value === 'string' && isCheckedInRecipeLocator(value)
    ? journalOk({ kind: 'checked-in-recipe-locator', value: value.replaceAll('\\', '/') })
    : journalErr({ code: 'journal-invalid', message: 'checked-in-recipe-locator is invalid.' });

export type ConsentOutcome = 'approved' | 'denied';
export type GrantJournalState = 'active' | 'revoked';
export type LeaseJournalState =
  | 'authorized'
  | 'delivering'
  | 'exposed'
  | 'closure-required'
  | 'closed'
  | 'revoked'
  | 'recovery-required';
export type AttemptJournalState =
  | 'reserved'
  | 'materializing'
  | 'running'
  | 'stopping'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'cleanup-required'
  | 'recovery-required'
  | 'cleaned';

export type LifecycleKind = 'one-shot' | 'service';

export type JournalOperationKind =
  | 'commit-grant-with-consent'
  | 'reserve-attempt'
  | 'bind-bootstrap-attempt'
  | 'transition-attempt'
  | 'create-lease'
  | 'claim-bootstrap-lease'
  | 'transition-lease'
  | 'consume-transfer';

export type JournalOperationRecord = Readonly<{
  id: JournalOperationId;
  kind: JournalOperationKind;
  subjectIdentity: string;
  registeredAtMs: number;
}>;

export type ConsentEvidenceRecord = Readonly<{
  id: ConsentId;
  operationId: JournalOperationId;
  repository: CanonicalRepository;
  recipeRevision: RecipeRevision;
  authorityDigest: RedactedAuthorityDigest;
  promptVersion: string;
  credentialSlotIds: readonly CredentialSlotId[];
  deliveryMode: 'cooperative-bootstrap';
  grantExpiresAtMs: number;
  occurredAtMs: number;
  outcome: ConsentOutcome;
}>;

export type GrantCredentialBinding = Readonly<{
  slotId: CredentialSlotId;
  credentialReference: CredentialReference;
}>;

export type GrantCredentialBindingSet = readonly [
  GrantCredentialBinding,
  ...GrantCredentialBinding[]
];

export type GrantJournalRecord = Readonly<{
  id: GrantId;
  operationId: JournalOperationId;
  repository: CanonicalRepository;
  recipeRevision: RecipeRevision;
  credentialBindings: GrantCredentialBindingSet;
  consentId: ConsentId;
  generation: number;
  issuedAtMs: number;
  expiresAtMs: number;
  state: GrantJournalState;
}>;

export type CommitGrantWithConsent = Readonly<{
  operationId: JournalOperationId;
  consent: ConsentEvidenceRecord;
  grant: GrantJournalRecord;
}>;

export type LeaseJournalRecord = Readonly<{
  id: LeaseJournalId;
  operationId: JournalOperationId;
  grantId: GrantId;
  grantGeneration: number;
  processAttemptId: ProcessAttemptId;
  receiverId: ReceiverId;
  exposureCorrelation: SecretExposureCorrelation;
  issuedAtMs: number;
  expiresAtMs: number;
  updatedAtMs: number;
  cleanupReceipt: SecretExposureCleanupReceipt | null;
  state: LeaseJournalState;
}>;

export type CreateLease = Readonly<{
  operationId: JournalOperationId;
  lease: LeaseJournalRecord;
}>;

export type ClaimAuthorizedBootstrapLease = Readonly<{
  operationId: JournalOperationId;
  exchangeId: BootstrapExchangeJournalId;
  lease: LeaseJournalRecord;
  expectedAttempt: Readonly<{
    id: ProcessAttemptId;
    state: 'materializing' | 'running';
    stateVersion: number;
    binding: BootstrapAttemptBinding;
  }>;
}>;

type TransitionLeaseIdentity = Readonly<{
  operationId: JournalOperationId;
  leaseId: LeaseJournalId;
  exposureCorrelation: SecretExposureCorrelation;
  atMs: number;
}>;

export type TransitionLease = TransitionLeaseIdentity & (
  | Readonly<{
      expectedState: 'authorized';
      nextState: 'delivering' | 'revoked' | 'recovery-required';
      cleanupReceipt: null;
    }>
  | Readonly<{
      expectedState: 'delivering';
      nextState: 'exposed' | 'recovery-required';
      cleanupReceipt: null;
    }>
  | Readonly<{
      expectedState: 'exposed';
      nextState: 'closure-required' | 'recovery-required';
      cleanupReceipt: null;
    }>
  | Readonly<{
      expectedState: 'closure-required';
      nextState: 'recovery-required';
      cleanupReceipt: null;
    }>
  | Readonly<{
      expectedState: 'recovery-required';
      nextState: 'closure-required';
      cleanupReceipt: null;
    }>
  | Readonly<{
      expectedState: 'closure-required' | 'recovery-required';
      nextState: 'closed';
      cleanupReceipt: SecretExposureCleanupReceipt;
    }>
);

type AttemptJournalBase = Readonly<{
  id: ProcessAttemptId;
  reserveOperationId: JournalOperationId;
  repository: CanonicalRepository;
  recipeRevision: RecipeRevision;
  planDigest: RedactedPlanDigest;
  lifecycle: LifecycleKind;
  receiverCorrelation: ReceiverCorrelation | null;
  state: AttemptJournalState;
  stateVersion: number;
  createdAtMs: number;
  updatedAtMs: number;
}>;

export type BootstrapAttemptBinding = Readonly<{
  format: 'bootstrap-attempt-binding/v2';
  bindingGeneration: number;
  grantId: GrantId;
  grantGeneration: number;
  receiverId: ReceiverId;
  receiverEntryIdentity: ReceiverEntryIdentity;
  helperParentProcessId: number;
  helperParentProcessIncarnation: ProcessIncarnation;
  recipeLocator: CheckedInRecipeLocator;
}>;

export type LegacyAttemptJournalRecord = AttemptJournalBase & Readonly<{
  bootstrapBinding: null;
}>;

export type BootstrapAttemptJournalRecord = AttemptJournalBase & Readonly<{
  bootstrapBinding: BootstrapAttemptBinding;
}>;

export type AttemptJournalRecord = LegacyAttemptJournalRecord | BootstrapAttemptJournalRecord;

export type ReserveAttempt = Readonly<{
  operationId: JournalOperationId;
  attempt: LegacyAttemptJournalRecord;
}>;

/**
 * Redacted current grant facts which must still be exact when an execution
 * attempt first becomes eligible for materialization.
 */
export type GrantQualifiedAttemptAuthority = Readonly<{
  grantId: GrantId;
  grantGeneration: number;
  repository: CanonicalRepository;
  recipeRevision: RecipeRevision;
  credentialSlotIds: readonly CredentialSlotId[];
  grantExpiresAtMs: number;
}>;

export type GrantQualifiedOneShotLaunchAdmission = Readonly<{
  format: 'grant-qualified-launch-admission/v1';
  bindingGeneration: number;
  receiverId: ReceiverId;
  receiverSlotIdentity: string;
  receiverProcessName: string;
  receiverEntryIdentity: ReceiverEntryIdentity;
  recipeLocator: CheckedInRecipeLocator;
  slotIndependentPlanDigest: RedactedPlanDigest;
  launchMetadataDigest: string;
  deadlineAtMs: number;
}>;

/**
 * One SQLite transaction reserves an attempt and records its first
 * `reserved -> materializing` transition after re-reading exact grant facts.
 */
export type ReserveGrantQualifiedMaterializingAttempt = Readonly<{
  authorityCheckedAtMs: number;
  authority: GrantQualifiedAttemptAuthority;
  admission: GrantQualifiedOneShotLaunchAdmission;
  reservation: ReserveAttempt;
  materialization: TransitionAttempt & Readonly<{
    expectedState: 'reserved';
    nextState: 'materializing';
    receiverCorrelation: ReceiverCorrelation;
  }>;
}>;

export type GrantQualifiedMaterializingAttemptRecord = Readonly<{
  attempt: AttemptJournalRecord;
  authority: GrantQualifiedAttemptAuthority;
  admission: GrantQualifiedOneShotLaunchAdmission;
}>;

export type VerifiedWindowsJobPolicy = Readonly<{
  format: 'windows-job-policy/v1';
  extendedLimit: 'kill-on-job-close-only';
  uiRestrictions: 'none';
  breakaway: 'forbidden';
}>;

/**
 * Durable redacted evidence created only after the exact PM2 root incarnation
 * has passed the read-only Windows Job membership and policy proof. The record
 * repeats every authority-bearing launch fact deliberately: a later cleanup
 * process can establish one exact join without trusting a caller projection.
 */
export type VerifiedWindowsAttemptContainmentBinding = Readonly<{
  format: 'verified-windows-attempt-containment/v1';
  bindingGeneration: number;
  processAttemptId: ProcessAttemptId;
  repository: CanonicalRepository;
  recipeRevision: RecipeRevision;
  grantId: GrantId;
  grantGeneration: number;
  credentialSlotIds: readonly CredentialSlotId[];
  grantExpiresAtMs: number;
  receiverId: ReceiverId;
  receiverCorrelation: ReceiverCorrelation;
  receiverEntryIdentity: ReceiverEntryIdentity;
  receiverSlotIdentity: string;
  receiverProcessName: string;
  receiverPmId: number;
  recipeLocator: CheckedInRecipeLocator;
  slotIndependentPlanDigest: RedactedPlanDigest;
  launchMetadataDigest: string;
  deadlineAtMs: number;
  rootProcessId: number;
  rootProcessIncarnation: ProcessIncarnation;
  jobIdentity: DurableWindowsNamedJobIdentity;
  jobPolicy: VerifiedWindowsJobPolicy;
  membershipVerifiedAtMs: number;
}>;

export type BindVerifiedWindowsContainmentAndStart = Readonly<{
  operationId: JournalOperationId;
  expectedState: 'materializing';
  expectedStateVersion: number;
  binding: VerifiedWindowsAttemptContainmentBinding;
}>;

export type GrantQualifiedContainedAttemptRecord = GrantQualifiedMaterializingAttemptRecord & Readonly<{
  containmentBinding: VerifiedWindowsAttemptContainmentBinding;
}>;

export type VerifiedWindowsTreeCleanupProof = Readonly<{
  format: 'verified-windows-tree-cleanup/v1';
  proof: 'exact-tree-empty';
  basis: 'job-terminated-empty' | 'job-already-empty' | 'job-missing-root-exited';
  jobIdentity: DurableWindowsNamedJobIdentity;
  rootProcessId: number;
  rootProcessIncarnation: ProcessIncarnation;
  observedAtMs: number;
}>;

export type ExactPm2RecordDeletionReceipt = Readonly<{
  format: 'pm2-exact-record-deletion/v1';
  disposition: 'deleted' | 'already-absent';
  receiverId: ReceiverId;
  receiverCorrelation: ReceiverCorrelation;
  receiverSlotIdentity: string;
  receiverProcessName: string;
  receiverPmId: number;
  processAttemptId: ProcessAttemptId;
  launchMetadataDigest: string;
  deletedAtMs: number;
}>;

export type VerifiedWindowsTerminalCleanupRecord = Readonly<{
  format: 'verified-windows-terminal-cleanup/v1';
  operationId: JournalOperationId;
  processAttemptId: ProcessAttemptId;
  bindingGeneration: number;
  terminalDisposition: 'succeeded' | 'failed' | 'cancelled';
  treeCleanup: VerifiedWindowsTreeCleanupProof;
  pm2Deletion: ExactPm2RecordDeletionReceipt;
  closedExposureCount: number;
  cleanedAtMs: number;
}>;

export type FinalizeVerifiedWindowsTerminalCleanup = Readonly<{
  cleanup: VerifiedWindowsTerminalCleanupRecord;
  expectedAttemptState: Exclude<AttemptJournalState, 'cleaned'>;
  expectedAttemptStateVersion: number;
}>;

type BindBootstrapAttemptBase = Readonly<{
  operationId: JournalOperationId;
  attemptId: ProcessAttemptId;
  expectedStateVersion: number;
  atMs: number;
  receiverCorrelation: ReceiverCorrelation;
  binding: BootstrapAttemptBinding;
}>;

export type BindBootstrapAttempt = BindBootstrapAttemptBase & (
  | Readonly<{
    mode: 'initial';
    expectedState: 'materializing';
    priorBindingGeneration: null;
  }>
  | Readonly<{
    mode: 'rebind-after-recovery';
    expectedState: 'recovery-required';
    priorBindingGeneration: number;
  }>
);

export type TransitionAttempt = Readonly<{
  operationId: JournalOperationId;
  attemptId: ProcessAttemptId;
  expectedState: AttemptJournalState;
  nextState: AttemptJournalState;
  atMs: number;
  receiverCorrelation: ReceiverCorrelation | null;
}>;

export type TransferReplayRecord = Readonly<{
  id: TransferId;
  operationId: JournalOperationId;
  destinationGrantId: GrantId;
  issuedAtMs: number;
  expiresAtMs: number;
  consumedAtMs: number;
  state: 'consumed';
}>;

export type ConsumeTransfer = Readonly<{
  operationId: JournalOperationId;
  transfer: TransferReplayRecord;
}>;

export type JournalMutation<T> = Readonly<{
  status: 'committed' | 'already-committed';
  record: T;
}>;

const isUnknownRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isInstant = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const isGeneration = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 1;
const isPositiveProcessId = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 1;
const isBoundedText = (value: unknown, maximumLength: number): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= maximumLength && !value.includes('\0');
const isReference = (value: unknown, kind: string, maximumLength: number): boolean =>
  isUnknownRecord(value) && value['kind'] === kind && isBoundedText(value['value'], maximumLength);
const hasDistinctSlots = (slots: readonly CredentialSlotId[]): boolean =>
  slots.length > 0 && slots.every((slot, index) => slots.indexOf(slot) === index);
const hasValidGrantBindings = (bindings: readonly GrantCredentialBinding[]): boolean => {
  const slots: readonly CredentialSlotId[] = bindings.map(binding => binding.slotId);
  return hasDistinctSlots(slots) && bindings.every(binding => isBoundedText(binding.slotId, 128) &&
    isReference(binding.credentialReference, 'credential-reference', 256));
};

const invalid = <T>(message: string): JournalResult<T> => journalErr({ code: 'journal-invalid', message });

export const validateGrantWithConsent = (command: CommitGrantWithConsent): JournalResult<CommitGrantWithConsent> => {
  const { consent, grant, operationId } = command;
  if (operationId.value !== consent.operationId.value || operationId.value !== grant.operationId.value) {
    return invalid('The journal operation identity is inconsistent.');
  }
  if (consent.outcome !== 'approved') return invalid('A grant requires approved consent evidence.');
  if (consent.id.value !== grant.consentId.value || consent.repository !== grant.repository ||
      consent.recipeRevision !== grant.recipeRevision) {
    return invalid('Consent evidence and grant authority do not match.');
  }
  const bindingSlotIds: readonly CredentialSlotId[] = grant.credentialBindings.map(binding => binding.slotId);
  if (!hasDistinctSlots(consent.credentialSlotIds) || !hasValidGrantBindings(grant.credentialBindings) ||
      consent.credentialSlotIds.length !== bindingSlotIds.length ||
      !consent.credentialSlotIds.every(slot => bindingSlotIds.includes(slot))) {
    return invalid('Consent and grant credential slots do not match.');
  }
  if (consent.promptVersion.length === 0 || consent.promptVersion.length > 128 || consent.promptVersion.includes('\0')) {
    return invalid('Consent evidence contains an invalid prompt or delivery fact.');
  }
  if (!isGeneration(grant.generation) || !isInstant(consent.occurredAtMs) || !isInstant(grant.issuedAtMs) ||
      !isInstant(grant.expiresAtMs) || consent.grantExpiresAtMs !== grant.expiresAtMs ||
      grant.issuedAtMs < consent.occurredAtMs || grant.expiresAtMs <= grant.issuedAtMs || grant.state !== 'active') {
    return invalid('Consent or grant lifetime facts are invalid.');
  }
  return journalOk(command);
};

export const validateLeaseCreation = (command: CreateLease): JournalResult<CreateLease> => {
  const { lease, operationId } = command;
  if (operationId.value !== lease.operationId.value || !isGeneration(lease.grantGeneration) ||
      !isInstant(lease.issuedAtMs) || !isInstant(lease.expiresAtMs) || lease.expiresAtMs <= lease.issuedAtMs ||
      lease.updatedAtMs !== lease.issuedAtMs || lease.cleanupReceipt !== null || lease.state !== 'authorized' ||
      !isBoundedText(lease.receiverId, 128) ||
      !isReference(lease.exposureCorrelation, 'secret-exposure-correlation', 256)) {
    return invalid('The journal lease facts are invalid.');
  }
  return journalOk(command);
};

const validateBootstrapAttemptBinding = (binding: unknown): boolean => {
  if (!isUnknownRecord(binding)) return false;
  const recipeLocator = binding['recipeLocator'];
  return binding['format'] === 'bootstrap-attempt-binding/v2' && isGeneration(binding['bindingGeneration']) &&
    isGeneration(binding['grantGeneration']) && isBoundedText(binding['grantId'], 128) &&
    isBoundedText(binding['receiverId'], 128) &&
    isReference(binding['receiverEntryIdentity'], 'receiver-entry-identity', 512) &&
    isPositiveProcessId(binding['helperParentProcessId']) &&
    isReference(binding['helperParentProcessIncarnation'], 'process-incarnation', 512) &&
    isReference(recipeLocator, 'checked-in-recipe-locator', 1024) && isUnknownRecord(recipeLocator) &&
    typeof recipeLocator['value'] === 'string' && isCheckedInRecipeLocator(recipeLocator['value']);
};

export const validateBootstrapAttemptBind = (
  command: BindBootstrapAttempt
): JournalResult<BindBootstrapAttempt> => {
  const raw: unknown = command;
  if (!isUnknownRecord(raw)) return invalid('The bootstrap attempt binding facts are invalid.');
  const binding = raw['binding'];
  const bindingGeneration = isUnknownRecord(binding) ? binding['bindingGeneration'] : undefined;
  const priorGeneration = raw['priorBindingGeneration'];
  const initial = raw['mode'] === 'initial' && raw['expectedState'] === 'materializing' &&
    priorGeneration === null && bindingGeneration === 1;
  const rebind = raw['mode'] === 'rebind-after-recovery' && raw['expectedState'] === 'recovery-required' &&
    isGeneration(priorGeneration) && priorGeneration < Number.MAX_SAFE_INTEGER &&
    bindingGeneration === priorGeneration + 1;
  return (initial || rebind) && isGeneration(raw['expectedStateVersion']) && isInstant(raw['atMs']) &&
    isReference(raw['receiverCorrelation'], 'receiver-correlation', 512) && validateBootstrapAttemptBinding(binding)
    ? journalOk(command)
    : invalid('The bootstrap attempt binding facts are invalid.');
};

export const validateBootstrapLeaseClaim = (
  command: ClaimAuthorizedBootstrapLease
): JournalResult<ClaimAuthorizedBootstrapLease> => {
  const lease = validateLeaseCreation(command);
  const { expectedAttempt } = command;
  return lease.type === 'ok' && isReference(command.exchangeId, 'bootstrap-exchange-id', 128) &&
    expectedAttempt.id === command.lease.processAttemptId &&
    isGeneration(expectedAttempt.stateVersion) && validateBootstrapAttemptBinding(expectedAttempt.binding) &&
    expectedAttempt.binding.grantId === command.lease.grantId &&
    expectedAttempt.binding.grantGeneration === command.lease.grantGeneration &&
    expectedAttempt.binding.receiverId === command.lease.receiverId
    ? journalOk(command)
    : invalid('The bootstrap lease claim facts are invalid.');
};

const validCleanupReceipt = (
  receipt: SecretExposureCleanupReceipt,
  command: TransitionLease
): boolean => {
  const raw: Readonly<Record<string, unknown>> = receipt;
  return raw['format'] === 'secret-exposure-cleanup-receipt/v1' && raw['proof'] === 'exact-tree-empty' &&
    isReference(receipt.id, 'secret-exposure-cleanup-receipt-id', 256) &&
    isReference(receipt.exposureCorrelation, 'secret-exposure-correlation', 256) &&
    receipt.exposureCorrelation.value === command.exposureCorrelation.value &&
    isBoundedText(receipt.receiverId, 128) && isBoundedText(receipt.processAttemptId, 128) &&
    isInstant(receipt.observedAtMs) && receipt.observedAtMs === command.atMs;
};

const allowedLeaseTransitionPairs = [
  ['authorized', 'delivering'],
  ['authorized', 'revoked'],
  ['authorized', 'recovery-required'],
  ['delivering', 'exposed'],
  ['delivering', 'recovery-required'],
  ['exposed', 'closure-required'],
  ['exposed', 'recovery-required'],
  ['closure-required', 'recovery-required'],
  ['closure-required', 'closed'],
  ['recovery-required', 'closure-required'],
  ['recovery-required', 'closed']
] as const;

export const validateLeaseTransition = (command: TransitionLease): JournalResult<TransitionLease> => {
  const raw: unknown = command;
  if (!isUnknownRecord(raw) || !isInstant(command.atMs) ||
      !isReference(command.exposureCorrelation, 'secret-exposure-correlation', 256)) {
    return invalid('The requested lease transition is invalid.');
  }
  const allowed = allowedLeaseTransitionPairs.some(
    ([expected, next]) => raw['expectedState'] === expected && raw['nextState'] === next
  );
  const closes = command.nextState === 'closed';
  const cleanupIsExact = closes
    ? isUnknownRecord(raw['cleanupReceipt']) && validCleanupReceipt(command.cleanupReceipt, command)
    : raw['cleanupReceipt'] === null;
  return allowed && cleanupIsExact ? journalOk(command) : invalid('The requested lease transition is invalid.');
};

const allowedAttemptTransitions: Readonly<Record<AttemptJournalState, readonly AttemptJournalState[]>> = {
  reserved: ['materializing', 'cancelled', 'recovery-required'],
  materializing: ['running', 'failed', 'cancelled', 'cleanup-required', 'recovery-required'],
  running: ['stopping', 'succeeded', 'failed', 'cancelled', 'cleanup-required', 'recovery-required'],
  stopping: ['succeeded', 'failed', 'cancelled', 'cleanup-required', 'recovery-required'],
  succeeded: ['cleaned', 'cleanup-required'],
  failed: ['cleaned', 'cleanup-required'],
  cancelled: ['cleaned', 'cleanup-required'],
  'cleanup-required': ['cleaned', 'recovery-required'],
  'recovery-required': ['materializing', 'running', 'stopping', 'failed', 'cancelled', 'cleanup-required', 'cleaned'],
  cleaned: []
};

export const isAttemptTransitionAllowed = (
  expected: AttemptJournalState,
  next: AttemptJournalState
): boolean => allowedAttemptTransitions[expected].includes(next);

export const validateAttemptReservation = (command: ReserveAttempt): JournalResult<ReserveAttempt> => {
  const { attempt, operationId } = command;
  const rawAttempt: unknown = attempt;
  if (operationId.value !== attempt.reserveOperationId.value || attempt.state !== 'reserved' ||
      attempt.stateVersion !== 1 || !isInstant(attempt.createdAtMs) || attempt.updatedAtMs !== attempt.createdAtMs ||
      !isUnknownRecord(rawAttempt) || rawAttempt['bootstrapBinding'] !== null) {
    return invalid('The attempt reservation facts are invalid.');
  }
  return journalOk(command);
};

export const validateGrantQualifiedMaterializingAttempt = (
  command: ReserveGrantQualifiedMaterializingAttempt
): JournalResult<ReserveGrantQualifiedMaterializingAttempt> => {
  const reserved = validateAttemptReservation(command.reservation);
  const { attempt } = command.reservation;
  const { admission, authority, materialization } = command;
  const rawAdmission: Readonly<Record<string, unknown>> = admission;
  const rawMaterialization: Readonly<Record<string, unknown>> = materialization;
  const slotIds = authority.credentialSlotIds;
  const exactSlots = hasDistinctSlots(slotIds) && slotIds.every(slot => isBoundedText(slot, 128));
  const exactAttempt = attempt.lifecycle === 'one-shot' && isBoundedText(attempt.id, 128) &&
    isBoundedText(attempt.repository, 4_096) && isBoundedText(attempt.recipeRevision, 256) &&
    isReference(attempt.planDigest, 'redacted-plan-digest', 512) && attempt.receiverCorrelation === null;
  const exactAuthority = isInstant(command.authorityCheckedAtMs) &&
    command.authorityCheckedAtMs >= materialization.atMs && isBoundedText(authority.grantId, 128) &&
    isGeneration(authority.grantGeneration) &&
    authority.repository === attempt.repository && authority.recipeRevision === attempt.recipeRevision &&
    exactSlots && isInstant(authority.grantExpiresAtMs) && authority.grantExpiresAtMs > materialization.atMs;
  const exactTransition = materialization.attemptId === attempt.id &&
    materialization.operationId.value !== command.reservation.operationId.value &&
    rawMaterialization['expectedState'] === 'reserved' && rawMaterialization['nextState'] === 'materializing' &&
    materialization.atMs >= attempt.createdAtMs &&
    isReference(materialization.receiverCorrelation, 'receiver-correlation', 512);
  const transitioned = exactTransition
    ? validateAttemptTransition(materialization)
    : invalid<TransitionAttempt>('The requested attempt transition is invalid.');
  const exactAdmission = rawAdmission['format'] === 'grant-qualified-launch-admission/v1' &&
    admission.bindingGeneration === 1 && isBoundedText(admission.receiverId, 128) &&
    isBoundedText(admission.receiverSlotIdentity, 128) &&
    isBoundedText(admission.receiverProcessName, 128) &&
    isReference(admission.receiverEntryIdentity, 'receiver-entry-identity', 512) &&
    isReference(admission.recipeLocator, 'checked-in-recipe-locator', 1_024) &&
    isCheckedInRecipeLocator(admission.recipeLocator.value) &&
    isReference(admission.slotIndependentPlanDigest, 'redacted-plan-digest', 512) &&
    /^[a-f0-9]{64}$/u.test(admission.launchMetadataDigest) &&
    attempt.planDigest.value === admission.launchMetadataDigest && isInstant(admission.deadlineAtMs) &&
    admission.deadlineAtMs > materialization.atMs && admission.deadlineAtMs <= authority.grantExpiresAtMs;
  return reserved.type === 'ok' && transitioned.type === 'ok' && exactAttempt && exactAuthority && exactTransition &&
    exactAdmission
    ? journalOk(command)
    : invalid('The grant-qualified materializing attempt facts are invalid.');
};

const hasExactWindowsJobPolicy = (value: unknown): value is VerifiedWindowsJobPolicy =>
  isUnknownRecord(value) && value['format'] === 'windows-job-policy/v1' &&
  value['extendedLimit'] === 'kill-on-job-close-only' && value['uiRestrictions'] === 'none' &&
  value['breakaway'] === 'forbidden';

export const validateVerifiedWindowsAttemptContainmentBinding = (
  binding: VerifiedWindowsAttemptContainmentBinding
): JournalResult<VerifiedWindowsAttemptContainmentBinding> => {
  const raw: unknown = binding;
  if (!isUnknownRecord(raw)) return invalid('The verified Windows containment binding is invalid.');
  const exactSlots = hasDistinctSlots(binding.credentialSlotIds) &&
    binding.credentialSlotIds.every(slot => isBoundedText(slot, 128));
  const valid = raw['format'] === 'verified-windows-attempt-containment/v1' &&
    isGeneration(binding.bindingGeneration) && isBoundedText(binding.processAttemptId, 128) &&
    isBoundedText(binding.repository, 4_096) && isBoundedText(binding.recipeRevision, 256) &&
    isBoundedText(binding.grantId, 128) && isGeneration(binding.grantGeneration) && exactSlots &&
    isInstant(binding.grantExpiresAtMs) && isBoundedText(binding.receiverId, 128) &&
    isReference(binding.receiverCorrelation, 'receiver-correlation', 512) &&
    isReference(binding.receiverEntryIdentity, 'receiver-entry-identity', 512) &&
    isBoundedText(binding.receiverSlotIdentity, 128) && isBoundedText(binding.receiverProcessName, 128) &&
    Number.isSafeInteger(binding.receiverPmId) && binding.receiverPmId >= 0 &&
    isReference(binding.recipeLocator, 'checked-in-recipe-locator', 1_024) &&
    isCheckedInRecipeLocator(binding.recipeLocator.value) &&
    isReference(binding.slotIndependentPlanDigest, 'redacted-plan-digest', 512) &&
    /^[a-f0-9]{64}$/u.test(binding.launchMetadataDigest) && isInstant(binding.deadlineAtMs) &&
    isPositiveProcessId(binding.rootProcessId) &&
    isReference(binding.rootProcessIncarnation, 'process-incarnation', 512) &&
    isReference(binding.jobIdentity, 'windows-named-job-identity', 512) &&
    binding.jobIdentity.value.startsWith('Local\\epsilonode.nebular.job.v1.') &&
    hasExactWindowsJobPolicy(binding.jobPolicy) && isInstant(binding.membershipVerifiedAtMs) &&
    binding.membershipVerifiedAtMs < binding.deadlineAtMs &&
    binding.membershipVerifiedAtMs < binding.grantExpiresAtMs;
  return valid ? journalOk(binding) : invalid('The verified Windows containment binding is invalid.');
};

export const validateVerifiedWindowsContainmentBind = (
  command: BindVerifiedWindowsContainmentAndStart
): JournalResult<BindVerifiedWindowsContainmentAndStart> => {
  const raw: unknown = command;
  return isUnknownRecord(raw) && raw['expectedState'] === 'materializing' &&
  isGeneration(command.expectedStateVersion) &&
  validateVerifiedWindowsAttemptContainmentBinding(command.binding).type === 'ok'
    ? journalOk(command)
    : invalid('The verified Windows containment bind command is invalid.');
};

const validTreeCleanupProof = (proof: unknown): proof is VerifiedWindowsTreeCleanupProof =>
  isUnknownRecord(proof) && proof['format'] === 'verified-windows-tree-cleanup/v1' &&
  proof['proof'] === 'exact-tree-empty' &&
  (proof['basis'] === 'job-terminated-empty' || proof['basis'] === 'job-already-empty' ||
    proof['basis'] === 'job-missing-root-exited') &&
  isReference(proof['jobIdentity'], 'windows-named-job-identity', 512) &&
  isPositiveProcessId(proof['rootProcessId']) &&
  isReference(proof['rootProcessIncarnation'], 'process-incarnation', 512) &&
  isInstant(proof['observedAtMs']);

const validPm2DeletionReceipt = (receipt: unknown): receipt is ExactPm2RecordDeletionReceipt =>
  isUnknownRecord(receipt) && receipt['format'] === 'pm2-exact-record-deletion/v1' &&
  (receipt['disposition'] === 'deleted' || receipt['disposition'] === 'already-absent') &&
  isBoundedText(receipt['receiverId'], 128) &&
  isReference(receipt['receiverCorrelation'], 'receiver-correlation', 512) &&
  isBoundedText(receipt['receiverSlotIdentity'], 128) && isBoundedText(receipt['receiverProcessName'], 128) &&
  Number.isSafeInteger(receipt['receiverPmId']) && typeof receipt['receiverPmId'] === 'number' &&
  receipt['receiverPmId'] >= 0 && isBoundedText(receipt['processAttemptId'], 128) &&
  isBoundedText(receipt['launchMetadataDigest'], 64) && /^[a-f0-9]{64}$/u.test(receipt['launchMetadataDigest']) &&
  isInstant(receipt['deletedAtMs']);

export const validateVerifiedWindowsTerminalCleanupFinalization = (
  command: FinalizeVerifiedWindowsTerminalCleanup
): JournalResult<FinalizeVerifiedWindowsTerminalCleanup> => {
  const { cleanup } = command;
  const rawCleanup: unknown = cleanup;
  const valid = isUnknownRecord(rawCleanup) &&
    rawCleanup['format'] === 'verified-windows-terminal-cleanup/v1' &&
    isGeneration(cleanup.bindingGeneration) &&
    (rawCleanup['terminalDisposition'] === 'succeeded' || rawCleanup['terminalDisposition'] === 'failed' ||
      rawCleanup['terminalDisposition'] === 'cancelled') &&
    validTreeCleanupProof(cleanup.treeCleanup) && validPm2DeletionReceipt(cleanup.pm2Deletion) &&
    cleanup.processAttemptId === cleanup.pm2Deletion.processAttemptId &&
    cleanup.treeCleanup.observedAtMs <= cleanup.pm2Deletion.deletedAtMs &&
    cleanup.pm2Deletion.deletedAtMs <= cleanup.cleanedAtMs && isInstant(cleanup.cleanedAtMs) &&
    Number.isSafeInteger(cleanup.closedExposureCount) && cleanup.closedExposureCount >= 0 &&
    isGeneration(command.expectedAttemptStateVersion);
  return valid ? journalOk(command) : invalid('The verified Windows terminal cleanup finalization is invalid.');
};

export const validateAttemptTransition = (command: TransitionAttempt): JournalResult<TransitionAttempt> =>
  isInstant(command.atMs) && isAttemptTransitionAllowed(command.expectedState, command.nextState)
    ? journalOk(command)
    : invalid('The requested attempt transition is invalid.');

export const validateTransferConsumption = (command: ConsumeTransfer): JournalResult<ConsumeTransfer> => {
  const { operationId, transfer } = command;
  if (operationId.value !== transfer.operationId.value || !isInstant(transfer.issuedAtMs) ||
      !isInstant(transfer.expiresAtMs) || !isInstant(transfer.consumedAtMs) ||
      transfer.expiresAtMs <= transfer.issuedAtMs || transfer.consumedAtMs < transfer.issuedAtMs ||
      transfer.consumedAtMs >= transfer.expiresAtMs) {
    return invalid('The transfer replay facts are invalid.');
  }
  return journalOk(command);
};

export type GrantJournal = Readonly<{
  commitWithConsent: (command: CommitGrantWithConsent) => JournalTaskResult<JournalMutation<GrantJournalRecord>>;
  readGrant: (id: GrantId) => JournalTaskResult<GrantJournalRecord | null>;
  readConsent: (id: ConsentId) => JournalTaskResult<ConsentEvidenceRecord | null>;
}>;

export type LeaseJournal = Readonly<{
  create: (command: CreateLease) => JournalTaskResult<JournalMutation<LeaseJournalRecord>>;
  claimAuthorized: (
    command: ClaimAuthorizedBootstrapLease
  ) => JournalTaskResult<JournalMutation<LeaseJournalRecord>>;
  transition: (command: TransitionLease) => JournalTaskResult<JournalMutation<LeaseJournalRecord>>;
  read: (id: LeaseJournalId) => JournalTaskResult<LeaseJournalRecord | null>;
  /** Bounded redacted exposure facts, ordered by durable lease identity. */
  readNonterminalForAttempt: (
    id: ProcessAttemptId
  ) => JournalTaskResult<readonly LeaseJournalRecord[]>;
  /** Redacted durable count used to make terminal cleanup replay exact. */
  readClosedCountForAttempt: (id: ProcessAttemptId) => JournalTaskResult<number>;
}>;

export type AttemptJournal = Readonly<{
  reserve: (command: ReserveAttempt) => JournalTaskResult<JournalMutation<AttemptJournalRecord>>;
  reserveGrantQualifiedMaterializing: (
    command: ReserveGrantQualifiedMaterializingAttempt
  ) => JournalTaskResult<JournalMutation<GrantQualifiedMaterializingAttemptRecord>>;
  readGrantQualifiedMaterializing: (
    id: ProcessAttemptId
  ) => JournalTaskResult<GrantQualifiedMaterializingAttemptRecord | null>;
  /** Durable launch authority/admission joined to the current attempt in any lifecycle state. */
  readGrantQualifiedAttempt: (
    id: ProcessAttemptId
  ) => JournalTaskResult<GrantQualifiedMaterializingAttemptRecord | null>;
  bindVerifiedWindowsContainmentAndStart: (
    command: BindVerifiedWindowsContainmentAndStart
  ) => JournalTaskResult<JournalMutation<GrantQualifiedContainedAttemptRecord>>;
  readGrantQualifiedContainedAttempt: (
    id: ProcessAttemptId
  ) => JournalTaskResult<GrantQualifiedContainedAttemptRecord | null>;
  finalizeVerifiedWindowsTerminalCleanup: (
    command: FinalizeVerifiedWindowsTerminalCleanup
  ) => JournalTaskResult<JournalMutation<VerifiedWindowsTerminalCleanupRecord>>;
  readVerifiedWindowsTerminalCleanup: (
    id: ProcessAttemptId
  ) => JournalTaskResult<VerifiedWindowsTerminalCleanupRecord | null>;
  bindBootstrap: (command: BindBootstrapAttempt) => JournalTaskResult<JournalMutation<BootstrapAttemptJournalRecord>>;
  transition: (command: TransitionAttempt) => JournalTaskResult<JournalMutation<AttemptJournalRecord>>;
  read: (id: ProcessAttemptId) => JournalTaskResult<AttemptJournalRecord | null>;
}>;

export type TransferReplayJournal = Readonly<{
  consume: (command: ConsumeTransfer) => JournalTaskResult<JournalMutation<TransferReplayRecord>>;
  read: (id: TransferId) => JournalTaskResult<TransferReplayRecord | null>;
}>;

export type AuthorityJournal = Readonly<{
  grants: GrantJournal;
  leases: LeaseJournal;
  attempts: AttemptJournal;
  transfers: TransferReplayJournal;
}>;

export type ProfilePathPort = Readonly<{
  resolveAuthorityDatabasePath: () => JournalTaskResult<AuthorityDatabasePath>;
}>;

export type TrustedLocalApplicationDataPort = Readonly<{
  resolveCurrentUserRoot: () => JournalTaskResult<TrustedProfileRoot>;
}>;
