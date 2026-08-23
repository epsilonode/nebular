import type { CredentialReference } from './lease.ts';
import type {
  CanonicalRepository,
  CredentialSlotId,
  GrantId,
  ProcessAttemptId,
  RecipeRevision
} from './primitives.ts';

export type JournalIssueCode =
  | 'journal-busy'
  | 'journal-closed'
  | 'journal-conflict'
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
export type RedactedAuthorityDigest = JournalReference<'redacted-authority-digest'>;
export type RedactedPlanDigest = JournalReference<'redacted-plan-digest'>;
export type ReceiverCorrelation = JournalReference<'receiver-correlation'>;
export type TrustedProfileRoot = JournalReference<'trusted-profile-root'>;
export type AuthorityDatabasePath = JournalReference<'authority-database-path'>;

type PublicJournalReference =
  | ConsentId
  | LeaseJournalId
  | TransferId
  | JournalOperationId
  | RedactedAuthorityDigest
  | RedactedPlanDigest
  | ReceiverCorrelation
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
export const parseRedactedAuthorityDigest = (value: unknown): JournalResult<RedactedAuthorityDigest> =>
  parseReference('redacted-authority-digest', value, 512);
export const parseRedactedPlanDigest = (value: unknown): JournalResult<RedactedPlanDigest> =>
  parseReference('redacted-plan-digest', value, 512);
export const parseReceiverCorrelation = (value: unknown): JournalResult<ReceiverCorrelation> =>
  parseReference('receiver-correlation', value, 512);

export type ConsentOutcome = 'approved' | 'denied';
export type GrantJournalState = 'active' | 'revoked';
export type LeaseJournalState = 'authorized' | 'active' | 'consumed' | 'revoked';
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

export type GrantJournalRecord = Readonly<{
  id: GrantId;
  operationId: JournalOperationId;
  repository: CanonicalRepository;
  recipeRevision: RecipeRevision;
  credentialReference: CredentialReference;
  credentialSlotIds: readonly CredentialSlotId[];
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
  issuedAtMs: number;
  expiresAtMs: number;
  terminatedAtMs: number | null;
  state: LeaseJournalState;
}>;

export type CreateLease = Readonly<{
  operationId: JournalOperationId;
  lease: LeaseJournalRecord;
}>;

export type TransitionLease = Readonly<{
  operationId: JournalOperationId;
  leaseId: LeaseJournalId;
  expectedState: LeaseJournalState;
  nextState: LeaseJournalState;
  atMs: number;
}>;

export type AttemptJournalRecord = Readonly<{
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

export type ReserveAttempt = Readonly<{
  operationId: JournalOperationId;
  attempt: AttemptJournalRecord;
}>;

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

const isInstant = (value: number): boolean => Number.isSafeInteger(value) && value >= 0;
const isGeneration = (value: number): boolean => Number.isSafeInteger(value) && value >= 1;
const hasDistinctSlots = (slots: readonly CredentialSlotId[]): boolean =>
  slots.length > 0 && slots.every((slot, index) => slots.indexOf(slot) === index);

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
  if (!hasDistinctSlots(consent.credentialSlotIds) || !hasDistinctSlots(grant.credentialSlotIds) ||
      consent.credentialSlotIds.length !== grant.credentialSlotIds.length ||
      !consent.credentialSlotIds.every(slot => grant.credentialSlotIds.includes(slot))) {
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
      lease.terminatedAtMs !== null || lease.state !== 'authorized') {
    return invalid('The journal lease facts are invalid.');
  }
  return journalOk(command);
};

const allowedLeaseTransitions: Readonly<Record<LeaseJournalState, readonly LeaseJournalState[]>> = {
  authorized: ['active', 'revoked'],
  active: ['consumed', 'revoked'],
  consumed: [],
  revoked: []
};

export const validateLeaseTransition = (command: TransitionLease): JournalResult<TransitionLease> =>
  isInstant(command.atMs) && allowedLeaseTransitions[command.expectedState].includes(command.nextState)
    ? journalOk(command)
    : invalid('The requested lease transition is invalid.');

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
  if (operationId.value !== attempt.reserveOperationId.value || attempt.state !== 'reserved' ||
      attempt.stateVersion !== 1 || !isInstant(attempt.createdAtMs) || attempt.updatedAtMs !== attempt.createdAtMs) {
    return invalid('The attempt reservation facts are invalid.');
  }
  return journalOk(command);
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
  transition: (command: TransitionLease) => JournalTaskResult<JournalMutation<LeaseJournalRecord>>;
  read: (id: LeaseJournalId) => JournalTaskResult<LeaseJournalRecord | null>;
}>;

export type AttemptJournal = Readonly<{
  reserve: (command: ReserveAttempt) => JournalTaskResult<JournalMutation<AttemptJournalRecord>>;
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
