import { createHash } from 'node:crypto';
import { lstatSync, mkdirSync } from 'node:fs';
import { dirname, isAbsolute, join, normalize } from 'node:path';

import type { Database, SQLQueryBindings } from 'bun:sqlite';

import { parseCredentialReference, type CredentialReference } from './lease.ts';
import {
  andThenJournalResult,
  journalErr,
  journalOk,
  mapJournalResult,
  parseConsentId,
  parseJournalOperationId,
  parseLeaseJournalId,
  parseReceiverCorrelation,
  parseRedactedAuthorityDigest,
  parseRedactedPlanDigest,
  parseTransferId,
  validateAttemptReservation,
  validateAttemptTransition,
  validateGrantWithConsent,
  validateLeaseCreation,
  validateLeaseTransition,
  validateTransferConsumption,
  type AttemptJournalRecord,
  type AttemptJournalState,
  type AuthorityDatabasePath,
  type AuthorityJournal,
  type CommitGrantWithConsent,
  type ConsentEvidenceRecord,
  type ConsentId,
  type ConsumeTransfer,
  type CreateLease,
  type GrantJournalRecord,
  type JournalOperationId,
  type JournalMutation,
  type JournalResult,
  type LeaseJournalId,
  type LeaseJournalRecord,
  type LifecycleKind,
  type ProfilePathPort,
  type ReceiverCorrelation,
  type ReserveAttempt,
  type TransferId,
  type TransferReplayRecord,
  type TransitionAttempt,
  type TransitionLease,
  type TrustedLocalApplicationDataPort
} from './journal.ts';
import {
  parseCanonicalRepository,
  parseCredentialSlotId,
  parseGrantId,
  parseProcessAttemptId,
  parseRecipeRevision,
  type CanonicalRepository,
  type CredentialSlotId,
  type GrantId,
  type ProcessAttemptId,
  type RecipeRevision
} from './primitives.ts';

const CURRENT_SCHEMA_VERSION = 1;
const DEFAULT_BUSY_TIMEOUT_MS = 250;
const MAXIMUM_BUSY_TIMEOUT_MS = 5_000;
const AUTHORITY_DATABASE_SUFFIX = ['wx-teleport-cartridge', 'broker', 'v1', 'broker.sqlite3'] as const;

const SCHEMA_V1_STATEMENTS = [
  `CREATE TABLE schema_migrations (
    version INTEGER PRIMARY KEY,
    checksum TEXT NOT NULL,
    application_version TEXT NOT NULL,
    applied_at_ms INTEGER NOT NULL CHECK (applied_at_ms >= 0)
  ) STRICT`,
  `CREATE TABLE consents (
    consent_id TEXT PRIMARY KEY,
    operation_id TEXT NOT NULL UNIQUE,
    repository TEXT NOT NULL,
    recipe_revision TEXT NOT NULL,
    authority_digest TEXT NOT NULL,
    prompt_version TEXT NOT NULL,
    delivery_mode TEXT NOT NULL CHECK (delivery_mode = 'cooperative-bootstrap'),
    grant_expires_at_ms INTEGER NOT NULL,
    occurred_at_ms INTEGER NOT NULL,
    outcome TEXT NOT NULL CHECK (outcome IN ('approved', 'denied')),
    CHECK (grant_expires_at_ms > occurred_at_ms)
  ) STRICT`,
  `CREATE TABLE consent_slots (
    consent_id TEXT NOT NULL REFERENCES consents(consent_id) ON DELETE RESTRICT,
    slot_id TEXT NOT NULL,
    PRIMARY KEY (consent_id, slot_id)
  ) STRICT`,
  `CREATE TABLE grants (
    grant_id TEXT PRIMARY KEY,
    operation_id TEXT NOT NULL UNIQUE,
    repository TEXT NOT NULL,
    recipe_revision TEXT NOT NULL,
    credential_reference TEXT NOT NULL,
    consent_id TEXT NOT NULL UNIQUE REFERENCES consents(consent_id) ON DELETE RESTRICT,
    generation INTEGER NOT NULL CHECK (generation >= 1),
    issued_at_ms INTEGER NOT NULL CHECK (issued_at_ms >= 0),
    expires_at_ms INTEGER NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('active', 'revoked')),
    CHECK (expires_at_ms > issued_at_ms)
  ) STRICT`,
  `CREATE TABLE grant_slots (
    grant_id TEXT NOT NULL REFERENCES grants(grant_id) ON DELETE RESTRICT,
    slot_id TEXT NOT NULL,
    PRIMARY KEY (grant_id, slot_id)
  ) STRICT`,
  `CREATE TABLE attempts (
    attempt_id TEXT PRIMARY KEY,
    reserve_operation_id TEXT NOT NULL UNIQUE,
    repository TEXT NOT NULL,
    recipe_revision TEXT NOT NULL,
    plan_digest TEXT NOT NULL,
    lifecycle TEXT NOT NULL CHECK (lifecycle IN ('one-shot', 'service')),
    receiver_correlation TEXT,
    state TEXT NOT NULL CHECK (state IN (
      'reserved', 'materializing', 'running', 'stopping', 'succeeded', 'failed',
      'cancelled', 'cleanup-required', 'recovery-required', 'cleaned'
    )),
    state_version INTEGER NOT NULL CHECK (state_version >= 1),
    created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
    updated_at_ms INTEGER NOT NULL CHECK (updated_at_ms >= created_at_ms)
  ) STRICT`,
  `CREATE TABLE attempt_transitions (
    operation_id TEXT PRIMARY KEY,
    attempt_id TEXT NOT NULL REFERENCES attempts(attempt_id) ON DELETE RESTRICT,
    expected_state TEXT NOT NULL,
    next_state TEXT NOT NULL,
    at_ms INTEGER NOT NULL CHECK (at_ms >= 0),
    receiver_correlation TEXT,
    resulting_version INTEGER NOT NULL CHECK (resulting_version >= 2)
  ) STRICT`,
  `CREATE TABLE leases (
    lease_id TEXT PRIMARY KEY,
    operation_id TEXT NOT NULL UNIQUE,
    grant_id TEXT NOT NULL REFERENCES grants(grant_id) ON DELETE RESTRICT,
    grant_generation INTEGER NOT NULL CHECK (grant_generation >= 1),
    process_attempt_id TEXT NOT NULL REFERENCES attempts(attempt_id) ON DELETE RESTRICT,
    issued_at_ms INTEGER NOT NULL CHECK (issued_at_ms >= 0),
    expires_at_ms INTEGER NOT NULL,
    terminated_at_ms INTEGER,
    state TEXT NOT NULL CHECK (state IN ('authorized', 'active', 'consumed', 'revoked')),
    CHECK (expires_at_ms > issued_at_ms),
    CHECK (terminated_at_ms IS NULL OR terminated_at_ms >= issued_at_ms)
  ) STRICT`,
  `CREATE TABLE lease_transitions (
    operation_id TEXT PRIMARY KEY,
    lease_id TEXT NOT NULL REFERENCES leases(lease_id) ON DELETE RESTRICT,
    expected_state TEXT NOT NULL CHECK (expected_state IN ('authorized', 'active')),
    next_state TEXT NOT NULL CHECK (next_state IN ('active', 'consumed', 'revoked')),
    at_ms INTEGER NOT NULL CHECK (at_ms >= 0)
  ) STRICT`,
  `CREATE TABLE transfer_replays (
    transfer_id TEXT PRIMARY KEY,
    operation_id TEXT NOT NULL UNIQUE,
    destination_grant_id TEXT NOT NULL REFERENCES grants(grant_id) ON DELETE RESTRICT,
    issued_at_ms INTEGER NOT NULL CHECK (issued_at_ms >= 0),
    expires_at_ms INTEGER NOT NULL,
    consumed_at_ms INTEGER NOT NULL,
    state TEXT NOT NULL CHECK (state = 'consumed'),
    CHECK (expires_at_ms > issued_at_ms),
    CHECK (consumed_at_ms >= issued_at_ms AND consumed_at_ms < expires_at_ms)
  ) STRICT`
] as const;

const SCHEMA_V1_CHECKSUM = createHash('sha256')
  .update(SCHEMA_V1_STATEMENTS.join('\n-- statement boundary --\n'))
  .digest('hex');

export type BunSqliteJournalOptions = Readonly<{
  profilePath: ProfilePathPort;
  applicationVersion: string;
  busyTimeoutMs?: number;
  clock: Readonly<{ nowMs: () => number }>;
}>;

type ResolvedOptions = Readonly<{
  profilePath: ProfilePathPort;
  applicationVersion: string;
  busyTimeoutMs: number;
  clock: Readonly<{ nowMs: () => number }>;
}>;

type GrantBase = Omit<GrantJournalRecord, 'credentialSlotIds'>;
type ConsentBase = Omit<ConsentEvidenceRecord, 'credentialSlotIds'>;

type LeaseTransitionRow = Readonly<{
  operationId: JournalOperationId;
  leaseId: LeaseJournalId;
  expectedState: LeaseJournalRecord['state'];
  nextState: LeaseJournalRecord['state'];
  atMs: number;
}>;

type AttemptTransitionRow = Readonly<{
  operationId: JournalOperationId;
  attemptId: ProcessAttemptId;
  expectedState: AttemptJournalState;
  nextState: AttemptJournalState;
  atMs: number;
  receiverCorrelation: ReceiverCorrelation | null;
  resultingVersion: number;
}>;

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const corrupt = <T>(message: string = 'The authority journal contains invalid persisted state.'): JournalResult<T> =>
  journalErr({ code: 'journal-corrupt', message });

const conflict = <T>(message: string): JournalResult<T> =>
  journalErr({ code: 'journal-conflict', message });

const notFound = <T>(message: string): JournalResult<T> =>
  journalErr({ code: 'journal-not-found', message });

const recoveryRequired = <T>(message: string): JournalResult<T> =>
  journalErr({ code: 'journal-recovery-required', message });

const parseSafeInteger = (value: unknown): JournalResult<number> =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? journalOk(value) : corrupt();

const parsePositiveInteger = (value: unknown): JournalResult<number> =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 ? journalOk(value) : corrupt();

const parseNullableSafeInteger = (value: unknown): JournalResult<number | null> =>
  value === null ? journalOk(null) : parseSafeInteger(value);

const parseText = (value: unknown, maximumLength: number = 512): JournalResult<string> =>
  typeof value === 'string' && value.length > 0 && value.length <= maximumLength && !value.includes('\0')
    ? journalOk(value)
    : corrupt();

const parseCanonicalRepositoryRow = (value: unknown): JournalResult<CanonicalRepository> =>
  parseCanonicalRepository(value).match(value_ => journalOk(value_), () => corrupt());
const parseRecipeRevisionRow = (value: unknown): JournalResult<RecipeRevision> =>
  parseRecipeRevision(value).match(value_ => journalOk(value_), () => corrupt());
const parseGrantIdRow = (value: unknown): JournalResult<GrantId> =>
  parseGrantId(value).match(value_ => journalOk(value_), () => corrupt());
const parseCredentialSlotIdRow = (value: unknown): JournalResult<CredentialSlotId> =>
  parseCredentialSlotId(value).match(value_ => journalOk(value_), () => corrupt());
const parseProcessAttemptIdRow = (value: unknown): JournalResult<ProcessAttemptId> =>
  parseProcessAttemptId(value).match(value_ => journalOk(value_), () => corrupt());
const parseCredentialReferenceRow = (value: unknown): JournalResult<CredentialReference> =>
  parseCredentialReference(value).match(value_ => journalOk(value_), () => corrupt());

const parseConsentIdRow = (value: unknown): JournalResult<ConsentId> => {
  const result = parseConsentId(value);
  return result.type === 'ok' ? result : corrupt();
};

const parseLeaseIdRow = (value: unknown): JournalResult<LeaseJournalId> => {
  const result = parseLeaseJournalId(value);
  return result.type === 'ok' ? result : corrupt();
};

const parseTransferIdRow = (value: unknown): JournalResult<TransferId> => {
  const result = parseTransferId(value);
  return result.type === 'ok' ? result : corrupt();
};

const parseOperationIdRow = (value: unknown): JournalResult<JournalOperationId> => {
  const result = parseJournalOperationId(value);
  return result.type === 'ok' ? result : corrupt();
};

const parseAuthorityDigestRow = (value: unknown) => {
  const result = parseRedactedAuthorityDigest(value);
  return result.type === 'ok' ? result : corrupt<never>();
};

const parsePlanDigestRow = (value: unknown) => {
  const result = parseRedactedPlanDigest(value);
  return result.type === 'ok' ? result : corrupt<never>();
};

const parseReceiverCorrelationRow = (value: unknown): JournalResult<ReceiverCorrelation> => {
  const result = parseReceiverCorrelation(value);
  return result.type === 'ok' ? result : corrupt();
};

const consentOutcome = (value: unknown): JournalResult<ConsentEvidenceRecord['outcome']> =>
  value === 'approved' || value === 'denied' ? journalOk(value) : corrupt();

const grantState = (value: unknown): JournalResult<GrantJournalRecord['state']> =>
  value === 'active' || value === 'revoked' ? journalOk(value) : corrupt();

const leaseState = (value: unknown): JournalResult<LeaseJournalRecord['state']> =>
  value === 'authorized' || value === 'active' || value === 'consumed' || value === 'revoked'
    ? journalOk(value)
    : corrupt();

const attemptStates = [
  'reserved', 'materializing', 'running', 'stopping', 'succeeded', 'failed', 'cancelled',
  'cleanup-required', 'recovery-required', 'cleaned'
] as const satisfies readonly AttemptJournalState[];

const isAttemptState = (value: unknown): value is AttemptJournalState =>
  typeof value === 'string' && attemptStates.some(state => state === value);

const attemptState = (value: unknown): JournalResult<AttemptJournalState> =>
  isAttemptState(value) ? journalOk(value) : corrupt();

const lifecycleKind = (value: unknown): JournalResult<LifecycleKind> =>
  value === 'one-shot' || value === 'service' ? journalOk(value) : corrupt();

const preparedGet = <Row>(
  database: Database,
  sql: string,
  params: readonly SQLQueryBindings[]
): Row | null => {
  using statement = database.prepare<Row, SQLQueryBindings[]>(sql);
  return statement.get(...params);
};

const preparedAll = <Row>(
  database: Database,
  sql: string,
  params: readonly SQLQueryBindings[]
): readonly Row[] => {
  using statement = database.prepare<Row, SQLQueryBindings[]>(sql);
  return statement.all(...params);
};

const preparedRun = (
  database: Database,
  sql: string,
  params: readonly SQLQueryBindings[]
): number => {
  using statement = database.prepare<unknown, SQLQueryBindings[]>(sql);
  return statement.run(...params).changes;
};

const firstScalar = (row: unknown): JournalResult<unknown> => {
  if (!isRecord(row)) return corrupt();
  const values: readonly unknown[] = Object.values(row);
  return values.length === 1 ? journalOk(values[0]) : corrupt();
};

const readScalarPragma = (database: Database, sql: string): JournalResult<unknown> =>
  firstScalar(preparedGet<unknown>(database, sql, []));

const decodeSlotRows = (rows: readonly unknown[]): JournalResult<readonly CredentialSlotId[]> =>
  rows.reduce<JournalResult<readonly CredentialSlotId[]>>((decoded, row) => {
    if (decoded.type === 'err') return decoded;
    if (!isRecord(row)) return corrupt();
    return mapJournalResult(
      parseCredentialSlotIdRow(row['slot_id']),
      (slot): readonly CredentialSlotId[] => [...decoded.value, slot]
    );
  }, journalOk<readonly CredentialSlotId[]>([]));

const decodeGrantBase = (row: unknown): JournalResult<GrantBase> => {
  if (!isRecord(row)) return corrupt();
  const id = parseGrantIdRow(row['grant_id']);
  const operationId = parseOperationIdRow(row['operation_id']);
  const repository = parseCanonicalRepositoryRow(row['repository']);
  const recipeRevision = parseRecipeRevisionRow(row['recipe_revision']);
  const credentialReference = parseCredentialReferenceRow(row['credential_reference']);
  const consentId = parseConsentIdRow(row['consent_id']);
  const generation = parsePositiveInteger(row['generation']);
  const issuedAtMs = parseSafeInteger(row['issued_at_ms']);
  const expiresAtMs = parseSafeInteger(row['expires_at_ms']);
  const state = grantState(row['state']);
  if (id.type === 'err') return id;
  if (operationId.type === 'err') return operationId;
  if (repository.type === 'err') return repository;
  if (recipeRevision.type === 'err') return recipeRevision;
  if (credentialReference.type === 'err') return credentialReference;
  if (consentId.type === 'err') return consentId;
  if (generation.type === 'err') return generation;
  if (issuedAtMs.type === 'err') return issuedAtMs;
  if (expiresAtMs.type === 'err') return expiresAtMs;
  if (state.type === 'err') return state;
  if (expiresAtMs.value <= issuedAtMs.value) return corrupt();
  return journalOk({
    id: id.value,
    operationId: operationId.value,
    repository: repository.value,
    recipeRevision: recipeRevision.value,
    credentialReference: credentialReference.value,
    consentId: consentId.value,
    generation: generation.value,
    issuedAtMs: issuedAtMs.value,
    expiresAtMs: expiresAtMs.value,
    state: state.value
  });
};

const decodeConsentBase = (row: unknown): JournalResult<ConsentBase> => {
  if (!isRecord(row)) return corrupt();
  const id = parseConsentIdRow(row['consent_id']);
  const operationId = parseOperationIdRow(row['operation_id']);
  const repository = parseCanonicalRepositoryRow(row['repository']);
  const recipeRevision = parseRecipeRevisionRow(row['recipe_revision']);
  const authorityDigest = parseAuthorityDigestRow(row['authority_digest']);
  const promptVersion = parseText(row['prompt_version'], 128);
  const grantExpiresAtMs = parseSafeInteger(row['grant_expires_at_ms']);
  const occurredAtMs = parseSafeInteger(row['occurred_at_ms']);
  const outcome = consentOutcome(row['outcome']);
  if (id.type === 'err') return id;
  if (operationId.type === 'err') return operationId;
  if (repository.type === 'err') return repository;
  if (recipeRevision.type === 'err') return recipeRevision;
  if (authorityDigest.type === 'err') return authorityDigest;
  if (promptVersion.type === 'err') return promptVersion;
  if (grantExpiresAtMs.type === 'err') return grantExpiresAtMs;
  if (occurredAtMs.type === 'err') return occurredAtMs;
  if (outcome.type === 'err') return outcome;
  if (row['delivery_mode'] !== 'cooperative-bootstrap' || grantExpiresAtMs.value <= occurredAtMs.value) return corrupt();
  return journalOk({
    id: id.value,
    operationId: operationId.value,
    repository: repository.value,
    recipeRevision: recipeRevision.value,
    authorityDigest: authorityDigest.value,
    promptVersion: promptVersion.value,
    deliveryMode: 'cooperative-bootstrap',
    grantExpiresAtMs: grantExpiresAtMs.value,
    occurredAtMs: occurredAtMs.value,
    outcome: outcome.value
  });
};

const readGrantInDatabase = (database: Database, id: GrantId): JournalResult<GrantJournalRecord | null> => {
  const row = preparedGet<unknown>(database, `SELECT
      grant_id, operation_id, repository, recipe_revision, credential_reference, consent_id,
      generation, issued_at_ms, expires_at_ms, state
    FROM grants WHERE grant_id = ?`, [id]);
  if (row === null) return journalOk(null);
  const base = decodeGrantBase(row);
  if (base.type === 'err') return base;
  const slots = decodeSlotRows(preparedAll<unknown>(
    database,
    'SELECT slot_id FROM grant_slots WHERE grant_id = ? ORDER BY slot_id',
    [id]
  ));
  return mapJournalResult(slots, credentialSlotIds => ({ ...base.value, credentialSlotIds }));
};

const readGrantByOperation = (
  database: Database,
  operationId: string
): JournalResult<GrantJournalRecord | null> => {
  const row = preparedGet<unknown>(database, 'SELECT grant_id FROM grants WHERE operation_id = ?', [operationId]);
  if (row === null) return journalOk(null);
  if (!isRecord(row)) return corrupt();
  const id = parseGrantIdRow(row['grant_id']);
  return andThenJournalResult(id, parsed => readGrantInDatabase(database, parsed));
};

const readConsentInDatabase = (
  database: Database,
  id: ReturnType<typeof parseConsentId> extends JournalResult<infer T> ? T : never
): JournalResult<ConsentEvidenceRecord | null> => {
  const row = preparedGet<unknown>(database, `SELECT
      consent_id, operation_id, repository, recipe_revision, authority_digest, prompt_version,
      delivery_mode, grant_expires_at_ms, occurred_at_ms, outcome
    FROM consents WHERE consent_id = ?`, [id.value]);
  if (row === null) return journalOk(null);
  const base = decodeConsentBase(row);
  if (base.type === 'err') return base;
  const slots = decodeSlotRows(preparedAll<unknown>(
    database,
    'SELECT slot_id FROM consent_slots WHERE consent_id = ? ORDER BY slot_id',
    [id.value]
  ));
  return mapJournalResult(slots, credentialSlotIds => ({ ...base.value, credentialSlotIds }));
};

const decodeLease = (row: unknown): JournalResult<LeaseJournalRecord> => {
  if (!isRecord(row)) return corrupt();
  const id = parseLeaseIdRow(row['lease_id']);
  const operationId = parseOperationIdRow(row['operation_id']);
  const grantId = parseGrantIdRow(row['grant_id']);
  const grantGeneration = parsePositiveInteger(row['grant_generation']);
  const processAttemptId = parseProcessAttemptIdRow(row['process_attempt_id']);
  const issuedAtMs = parseSafeInteger(row['issued_at_ms']);
  const expiresAtMs = parseSafeInteger(row['expires_at_ms']);
  const terminatedAtMs = parseNullableSafeInteger(row['terminated_at_ms']);
  const state = leaseState(row['state']);
  if (id.type === 'err') return id;
  if (operationId.type === 'err') return operationId;
  if (grantId.type === 'err') return grantId;
  if (grantGeneration.type === 'err') return grantGeneration;
  if (processAttemptId.type === 'err') return processAttemptId;
  if (issuedAtMs.type === 'err') return issuedAtMs;
  if (expiresAtMs.type === 'err') return expiresAtMs;
  if (terminatedAtMs.type === 'err') return terminatedAtMs;
  if (state.type === 'err') return state;
  if (expiresAtMs.value <= issuedAtMs.value ||
      (terminatedAtMs.value !== null && terminatedAtMs.value < issuedAtMs.value)) return corrupt();
  return journalOk({
    id: id.value,
    operationId: operationId.value,
    grantId: grantId.value,
    grantGeneration: grantGeneration.value,
    processAttemptId: processAttemptId.value,
    issuedAtMs: issuedAtMs.value,
    expiresAtMs: expiresAtMs.value,
    terminatedAtMs: terminatedAtMs.value,
    state: state.value
  });
};

const readLeaseInDatabase = (database: Database, id: string): JournalResult<LeaseJournalRecord | null> => {
  const row = preparedGet<unknown>(database, `SELECT
      lease_id, operation_id, grant_id, grant_generation, process_attempt_id,
      issued_at_ms, expires_at_ms, terminated_at_ms, state
    FROM leases WHERE lease_id = ?`, [id]);
  return row === null ? journalOk(null) : mapJournalResult(decodeLease(row), value => value);
};

const readLeaseByOperation = (database: Database, operationId: string): JournalResult<LeaseJournalRecord | null> => {
  const row = preparedGet<unknown>(database, 'SELECT lease_id FROM leases WHERE operation_id = ?', [operationId]);
  if (row === null) return journalOk(null);
  if (!isRecord(row) || typeof row['lease_id'] !== 'string') return corrupt();
  return readLeaseInDatabase(database, row['lease_id']);
};

const decodeLeaseTransition = (row: unknown): JournalResult<LeaseTransitionRow> => {
  if (!isRecord(row)) return corrupt();
  const operationId = parseOperationIdRow(row['operation_id']);
  const leaseId = parseLeaseIdRow(row['lease_id']);
  const expectedState = leaseState(row['expected_state']);
  const nextState = leaseState(row['next_state']);
  const atMs = parseSafeInteger(row['at_ms']);
  if (operationId.type === 'err') return operationId;
  if (leaseId.type === 'err') return leaseId;
  if (expectedState.type === 'err') return expectedState;
  if (nextState.type === 'err') return nextState;
  if (atMs.type === 'err') return atMs;
  if (!['authorized', 'active'].includes(expectedState.value) ||
      !['active', 'consumed', 'revoked'].includes(nextState.value)) return corrupt();
  return journalOk({
    operationId: operationId.value,
    leaseId: leaseId.value,
    expectedState: expectedState.value,
    nextState: nextState.value,
    atMs: atMs.value
  });
};

const readLeaseTransitionByOperation = (
  database: Database,
  operationId: string
): JournalResult<LeaseTransitionRow | null> => {
  const row = preparedGet<unknown>(database, `SELECT
      operation_id, lease_id, expected_state, next_state, at_ms
    FROM lease_transitions WHERE operation_id = ?`, [operationId]);
  return row === null ? journalOk(null) : mapJournalResult(decodeLeaseTransition(row), value => value);
};

const decodeAttempt = (row: unknown): JournalResult<AttemptJournalRecord> => {
  if (!isRecord(row)) return corrupt();
  const id = parseProcessAttemptIdRow(row['attempt_id']);
  const reserveOperationId = parseOperationIdRow(row['reserve_operation_id']);
  const repository = parseCanonicalRepositoryRow(row['repository']);
  const recipeRevision = parseRecipeRevisionRow(row['recipe_revision']);
  const planDigest = parsePlanDigestRow(row['plan_digest']);
  const lifecycle = lifecycleKind(row['lifecycle']);
  const receiverCorrelation = row['receiver_correlation'] === null
    ? journalOk<ReturnType<typeof parseReceiverCorrelationRow> extends JournalResult<infer T> ? T | null : never>(null)
    : parseReceiverCorrelationRow(row['receiver_correlation']);
  const state = attemptState(row['state']);
  const stateVersion = parsePositiveInteger(row['state_version']);
  const createdAtMs = parseSafeInteger(row['created_at_ms']);
  const updatedAtMs = parseSafeInteger(row['updated_at_ms']);
  if (id.type === 'err') return id;
  if (reserveOperationId.type === 'err') return reserveOperationId;
  if (repository.type === 'err') return repository;
  if (recipeRevision.type === 'err') return recipeRevision;
  if (planDigest.type === 'err') return planDigest;
  if (lifecycle.type === 'err') return lifecycle;
  if (receiverCorrelation.type === 'err') return receiverCorrelation;
  if (state.type === 'err') return state;
  if (stateVersion.type === 'err') return stateVersion;
  if (createdAtMs.type === 'err') return createdAtMs;
  if (updatedAtMs.type === 'err') return updatedAtMs;
  if (updatedAtMs.value < createdAtMs.value) return corrupt();
  return journalOk({
    id: id.value,
    reserveOperationId: reserveOperationId.value,
    repository: repository.value,
    recipeRevision: recipeRevision.value,
    planDigest: planDigest.value,
    lifecycle: lifecycle.value,
    receiverCorrelation: receiverCorrelation.value,
    state: state.value,
    stateVersion: stateVersion.value,
    createdAtMs: createdAtMs.value,
    updatedAtMs: updatedAtMs.value
  });
};

const readAttemptInDatabase = (database: Database, id: ProcessAttemptId): JournalResult<AttemptJournalRecord | null> => {
  const row = preparedGet<unknown>(database, `SELECT
      attempt_id, reserve_operation_id, repository, recipe_revision, plan_digest, lifecycle,
      receiver_correlation, state, state_version, created_at_ms, updated_at_ms
    FROM attempts WHERE attempt_id = ?`, [id]);
  return row === null ? journalOk(null) : mapJournalResult(decodeAttempt(row), value => value);
};

const readAttemptByReserveOperation = (
  database: Database,
  operationId: string
): JournalResult<AttemptJournalRecord | null> => {
  const row = preparedGet<unknown>(
    database,
    'SELECT attempt_id FROM attempts WHERE reserve_operation_id = ?',
    [operationId]
  );
  if (row === null) return journalOk(null);
  if (!isRecord(row)) return corrupt();
  const id = parseProcessAttemptIdRow(row['attempt_id']);
  return andThenJournalResult(id, parsed => readAttemptInDatabase(database, parsed));
};

const decodeAttemptTransition = (row: unknown): JournalResult<AttemptTransitionRow> => {
  if (!isRecord(row)) return corrupt();
  const operationId = parseOperationIdRow(row['operation_id']);
  const attemptId = parseProcessAttemptIdRow(row['attempt_id']);
  const expectedState = attemptState(row['expected_state']);
  const nextState = attemptState(row['next_state']);
  const atMs = parseSafeInteger(row['at_ms']);
  const receiverCorrelation = row['receiver_correlation'] === null
    ? journalOk<ReturnType<typeof parseReceiverCorrelationRow> extends JournalResult<infer T> ? T | null : never>(null)
    : parseReceiverCorrelationRow(row['receiver_correlation']);
  const resultingVersion = parsePositiveInteger(row['resulting_version']);
  if (operationId.type === 'err') return operationId;
  if (attemptId.type === 'err') return attemptId;
  if (expectedState.type === 'err') return expectedState;
  if (nextState.type === 'err') return nextState;
  if (atMs.type === 'err') return atMs;
  if (receiverCorrelation.type === 'err') return receiverCorrelation;
  if (resultingVersion.type === 'err') return resultingVersion;
  if (resultingVersion.value < 2) return corrupt();
  return journalOk({
    operationId: operationId.value,
    attemptId: attemptId.value,
    expectedState: expectedState.value,
    nextState: nextState.value,
    atMs: atMs.value,
    receiverCorrelation: receiverCorrelation.value,
    resultingVersion: resultingVersion.value
  });
};

const decodeTransfer = (row: unknown): JournalResult<TransferReplayRecord> => {
  if (!isRecord(row)) return corrupt();
  const id = parseTransferIdRow(row['transfer_id']);
  const operationId = parseOperationIdRow(row['operation_id']);
  const destinationGrantId = parseGrantIdRow(row['destination_grant_id']);
  const issuedAtMs = parseSafeInteger(row['issued_at_ms']);
  const expiresAtMs = parseSafeInteger(row['expires_at_ms']);
  const consumedAtMs = parseSafeInteger(row['consumed_at_ms']);
  if (id.type === 'err') return id;
  if (operationId.type === 'err') return operationId;
  if (destinationGrantId.type === 'err') return destinationGrantId;
  if (issuedAtMs.type === 'err') return issuedAtMs;
  if (expiresAtMs.type === 'err') return expiresAtMs;
  if (consumedAtMs.type === 'err') return consumedAtMs;
  if (row['state'] !== 'consumed' || expiresAtMs.value <= issuedAtMs.value ||
      consumedAtMs.value < issuedAtMs.value || consumedAtMs.value >= expiresAtMs.value) return corrupt();
  return journalOk({
    id: id.value,
    operationId: operationId.value,
    destinationGrantId: destinationGrantId.value,
    issuedAtMs: issuedAtMs.value,
    expiresAtMs: expiresAtMs.value,
    consumedAtMs: consumedAtMs.value,
    state: 'consumed'
  });
};

const readTransferInDatabase = (database: Database, id: string): JournalResult<TransferReplayRecord | null> => {
  const row = preparedGet<unknown>(database, `SELECT
      transfer_id, operation_id, destination_grant_id, issued_at_ms, expires_at_ms, consumed_at_ms, state
    FROM transfer_replays WHERE transfer_id = ?`, [id]);
  return row === null ? journalOk(null) : mapJournalResult(decodeTransfer(row), value => value);
};

const readTransferByOperation = (
  database: Database,
  operationId: string
): JournalResult<TransferReplayRecord | null> => {
  const row = preparedGet<unknown>(
    database,
    'SELECT transfer_id FROM transfer_replays WHERE operation_id = ?',
    [operationId]
  );
  if (row === null) return journalOk(null);
  if (!isRecord(row) || typeof row['transfer_id'] !== 'string') return corrupt();
  return readTransferInDatabase(database, row['transfer_id']);
};

const sameSlots = (left: readonly CredentialSlotId[], right: readonly CredentialSlotId[]): boolean =>
  left.length === right.length && left.every(slot => right.includes(slot));

const sameGrant = (left: GrantJournalRecord, right: GrantJournalRecord): boolean =>
  left.id === right.id && left.operationId.value === right.operationId.value && left.repository === right.repository &&
  left.recipeRevision === right.recipeRevision &&
  left.credentialReference.value === right.credentialReference.value && left.consentId.value === right.consentId.value &&
  left.generation === right.generation && left.issuedAtMs === right.issuedAtMs && left.expiresAtMs === right.expiresAtMs &&
  left.state === right.state && sameSlots(left.credentialSlotIds, right.credentialSlotIds);

const sameConsent = (left: ConsentEvidenceRecord, right: ConsentEvidenceRecord): boolean =>
  left.id.value === right.id.value && left.operationId.value === right.operationId.value &&
  left.repository === right.repository && left.recipeRevision === right.recipeRevision &&
  left.authorityDigest.value === right.authorityDigest.value && left.promptVersion === right.promptVersion &&
  left.grantExpiresAtMs === right.grantExpiresAtMs &&
  left.occurredAtMs === right.occurredAtMs && left.outcome === right.outcome &&
  sameSlots(left.credentialSlotIds, right.credentialSlotIds);

const sameLease = (left: LeaseJournalRecord, right: LeaseJournalRecord): boolean =>
  left.id.value === right.id.value && left.operationId.value === right.operationId.value &&
  left.grantId === right.grantId && left.grantGeneration === right.grantGeneration &&
  left.processAttemptId === right.processAttemptId && left.issuedAtMs === right.issuedAtMs &&
  left.expiresAtMs === right.expiresAtMs && left.terminatedAtMs === right.terminatedAtMs && left.state === right.state;

const sameAttempt = (left: AttemptJournalRecord, right: AttemptJournalRecord): boolean =>
  left.id === right.id && left.reserveOperationId.value === right.reserveOperationId.value &&
  left.repository === right.repository && left.recipeRevision === right.recipeRevision &&
  left.planDigest.value === right.planDigest.value && left.lifecycle === right.lifecycle &&
  left.receiverCorrelation?.value === right.receiverCorrelation?.value && left.state === right.state &&
  left.stateVersion === right.stateVersion && left.createdAtMs === right.createdAtMs && left.updatedAtMs === right.updatedAtMs;

const sameTransition = (left: AttemptTransitionRow, right: TransitionAttempt): boolean =>
  left.operationId.value === right.operationId.value && left.attemptId === right.attemptId &&
  left.expectedState === right.expectedState && left.nextState === right.nextState && left.atMs === right.atMs &&
  left.receiverCorrelation?.value === right.receiverCorrelation?.value;

const sameTransfer = (left: TransferReplayRecord, right: TransferReplayRecord): boolean =>
  left.id.value === right.id.value && left.operationId.value === right.operationId.value &&
  left.destinationGrantId === right.destinationGrantId && left.issuedAtMs === right.issuedAtMs &&
  left.expiresAtMs === right.expiresAtMs && left.consumedAtMs === right.consumedAtMs;

const insertConsentAndGrant = (database: Database, command: CommitGrantWithConsent): void => {
  const { consent, grant } = command;
  preparedRun(database, `INSERT INTO consents (
      consent_id, operation_id, repository, recipe_revision, authority_digest, prompt_version,
      delivery_mode, grant_expires_at_ms, occurred_at_ms, outcome
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    consent.id.value,
    consent.operationId.value,
    consent.repository,
    consent.recipeRevision,
    consent.authorityDigest.value,
    consent.promptVersion,
    consent.deliveryMode,
    consent.grantExpiresAtMs,
    consent.occurredAtMs,
    consent.outcome
  ]);
  consent.credentialSlotIds.forEach(slot => preparedRun(
    database,
    'INSERT INTO consent_slots (consent_id, slot_id) VALUES (?, ?)',
    [consent.id.value, slot]
  ));
  preparedRun(database, `INSERT INTO grants (
      grant_id, operation_id, repository, recipe_revision, credential_reference, consent_id,
      generation, issued_at_ms, expires_at_ms, state
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    grant.id,
    grant.operationId.value,
    grant.repository,
    grant.recipeRevision,
    grant.credentialReference.value,
    grant.consentId.value,
    grant.generation,
    grant.issuedAtMs,
    grant.expiresAtMs,
    grant.state
  ]);
  grant.credentialSlotIds.forEach(slot => preparedRun(
    database,
    'INSERT INTO grant_slots (grant_id, slot_id) VALUES (?, ?)',
    [grant.id, slot]
  ));
};

const commitGrantWithConsentInDatabase = (
  database: Database,
  command: CommitGrantWithConsent
): JournalResult<JournalMutation<GrantJournalRecord>> => database.transaction(
  (): JournalResult<JournalMutation<GrantJournalRecord>> => {
  const existingGrant = readGrantByOperation(database, command.operationId.value);
  if (existingGrant.type === 'err') return existingGrant;
  if (existingGrant.value !== null) {
    const existingConsent = readConsentInDatabase(database, existingGrant.value.consentId);
    if (existingConsent.type === 'err') return existingConsent;
    return existingConsent.value !== null && sameGrant(existingGrant.value, command.grant) &&
      sameConsent(existingConsent.value, command.consent)
      ? journalOk({ status: 'already-committed', record: existingGrant.value })
      : conflict('The journal operation id is already bound to different grant authority.');
  }
  insertConsentAndGrant(database, command);
  return journalOk({ status: 'committed', record: command.grant });
  }
).immediate();

const insertAttempt = (database: Database, attempt: AttemptJournalRecord): void => {
  preparedRun(database, `INSERT INTO attempts (
      attempt_id, reserve_operation_id, repository, recipe_revision, plan_digest, lifecycle,
      receiver_correlation, state, state_version, created_at_ms, updated_at_ms
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    attempt.id,
    attempt.reserveOperationId.value,
    attempt.repository,
    attempt.recipeRevision,
    attempt.planDigest.value,
    attempt.lifecycle,
    attempt.receiverCorrelation?.value ?? null,
    attempt.state,
    attempt.stateVersion,
    attempt.createdAtMs,
    attempt.updatedAtMs
  ]);
};

const reserveAttemptInDatabase = (
  database: Database,
  command: ReserveAttempt
): JournalResult<JournalMutation<AttemptJournalRecord>> => database.transaction(
  (): JournalResult<JournalMutation<AttemptJournalRecord>> => {
  const existing = readAttemptByReserveOperation(database, command.operationId.value);
  if (existing.type === 'err') return existing;
  if (existing.value !== null) return sameAttempt(existing.value, command.attempt)
    ? journalOk({ status: 'already-committed', record: existing.value })
    : conflict('The journal operation id is already bound to a different process attempt.');
  insertAttempt(database, command.attempt);
  return journalOk({ status: 'committed', record: command.attempt });
  }
).immediate();

const transitionOutcomeRecord = (
  attempt: AttemptJournalRecord,
  transition: AttemptTransitionRow
): AttemptJournalRecord => ({
  id: attempt.id,
  reserveOperationId: attempt.reserveOperationId,
  repository: attempt.repository,
  recipeRevision: attempt.recipeRevision,
  planDigest: attempt.planDigest,
  lifecycle: attempt.lifecycle,
  receiverCorrelation: transition.receiverCorrelation,
  state: transition.nextState,
  stateVersion: transition.resultingVersion,
  createdAtMs: attempt.createdAtMs,
  updatedAtMs: transition.atMs
});

const readAttemptTransitionByOperation = (
  database: Database,
  operationId: string
): JournalResult<AttemptTransitionRow | null> => {
  const row = preparedGet<unknown>(database, `SELECT
      operation_id, attempt_id, expected_state, next_state, at_ms, receiver_correlation, resulting_version
    FROM attempt_transitions WHERE operation_id = ?`, [operationId]);
  return row === null ? journalOk(null) : mapJournalResult(decodeAttemptTransition(row), value => value);
};

const transitionAttemptInDatabase = (
  database: Database,
  command: TransitionAttempt
): JournalResult<JournalMutation<AttemptJournalRecord>> => database.transaction(
  (): JournalResult<JournalMutation<AttemptJournalRecord>> => {
  const priorTransition = readAttemptTransitionByOperation(database, command.operationId.value);
  if (priorTransition.type === 'err') return priorTransition;
  const attempt = readAttemptInDatabase(database, command.attemptId);
  if (attempt.type === 'err') return attempt;
  if (attempt.value === null) return notFound('The process attempt does not exist.');
  if (priorTransition.value !== null) return sameTransition(priorTransition.value, command)
    ? journalOk({ status: 'already-committed', record: transitionOutcomeRecord(attempt.value, priorTransition.value) })
    : conflict('The journal operation id is already bound to a different attempt transition.');
  if (attempt.value.state !== command.expectedState || command.atMs < attempt.value.updatedAtMs) {
    return conflict('The process attempt state or generation changed before this transition.');
  }
  const nextVersion = attempt.value.stateVersion + 1;
  const changes = preparedRun(database, `UPDATE attempts
      SET state = ?, state_version = ?, updated_at_ms = ?, receiver_correlation = ?
      WHERE attempt_id = ? AND state = ? AND state_version = ?`, [
    command.nextState,
    nextVersion,
    command.atMs,
    command.receiverCorrelation?.value ?? null,
    command.attemptId,
    command.expectedState,
    attempt.value.stateVersion
  ]);
  if (changes !== 1) return conflict('The process attempt changed concurrently.');
  preparedRun(database, `INSERT INTO attempt_transitions (
      operation_id, attempt_id, expected_state, next_state, at_ms, receiver_correlation, resulting_version
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`, [
    command.operationId.value,
    command.attemptId,
    command.expectedState,
    command.nextState,
    command.atMs,
    command.receiverCorrelation?.value ?? null,
    nextVersion
  ]);
  return journalOk({
    status: 'committed',
    record: {
      ...attempt.value,
      receiverCorrelation: command.receiverCorrelation,
      state: command.nextState,
      stateVersion: nextVersion,
      updatedAtMs: command.atMs
    }
  });
  }
).immediate();

const createLeaseInDatabase = (
  database: Database,
  command: CreateLease
): JournalResult<JournalMutation<LeaseJournalRecord>> => database.transaction(
  (): JournalResult<JournalMutation<LeaseJournalRecord>> => {
  const existing = readLeaseByOperation(database, command.operationId.value);
  if (existing.type === 'err') return existing;
  if (existing.value !== null) return sameLease(existing.value, command.lease)
    ? journalOk({ status: 'already-committed', record: existing.value })
    : conflict('The journal operation id is already bound to a different secret lease.');
  const grant = readGrantInDatabase(database, command.lease.grantId);
  if (grant.type === 'err') return grant;
  if (grant.value === null) return notFound('The lease grant does not exist.');
  const attempt = readAttemptInDatabase(database, command.lease.processAttemptId);
  if (attempt.type === 'err') return attempt;
  if (attempt.value === null) return notFound('The lease process attempt does not exist.');
  if (grant.value.state !== 'active' || grant.value.generation !== command.lease.grantGeneration ||
      command.lease.issuedAtMs < grant.value.issuedAtMs || command.lease.expiresAtMs > grant.value.expiresAtMs ||
      attempt.value.repository !== grant.value.repository || attempt.value.recipeRevision !== grant.value.recipeRevision ||
      ['succeeded', 'failed', 'cancelled', 'cleaned'].includes(attempt.value.state)) {
    return conflict('The lease exceeds current grant or process-attempt authority.');
  }
  preparedRun(database, `INSERT INTO leases (
      lease_id, operation_id, grant_id, grant_generation, process_attempt_id,
      issued_at_ms, expires_at_ms, terminated_at_ms, state
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    command.lease.id.value,
    command.lease.operationId.value,
    command.lease.grantId,
    command.lease.grantGeneration,
    command.lease.processAttemptId,
    command.lease.issuedAtMs,
    command.lease.expiresAtMs,
    command.lease.terminatedAtMs,
    command.lease.state
  ]);
  return journalOk({ status: 'committed', record: command.lease });
  }
).immediate();

const sameLeaseTransition = (left: LeaseTransitionRow, right: TransitionLease): boolean =>
  left.operationId.value === right.operationId.value && left.leaseId.value === right.leaseId.value &&
  left.expectedState === right.expectedState && left.nextState === right.nextState && left.atMs === right.atMs;

const leaseTransitionOutcome = (
  lease: LeaseJournalRecord,
  transition: LeaseTransitionRow
): LeaseJournalRecord => ({
  id: lease.id,
  operationId: lease.operationId,
  grantId: lease.grantId,
  grantGeneration: lease.grantGeneration,
  processAttemptId: lease.processAttemptId,
  issuedAtMs: lease.issuedAtMs,
  expiresAtMs: lease.expiresAtMs,
  terminatedAtMs: transition.nextState === 'active' ? null : transition.atMs,
  state: transition.nextState
});

const transitionLeaseInDatabase = (
  database: Database,
  command: TransitionLease
): JournalResult<JournalMutation<LeaseJournalRecord>> => database.transaction(
  (): JournalResult<JournalMutation<LeaseJournalRecord>> => {
    const priorTransition = readLeaseTransitionByOperation(database, command.operationId.value);
    if (priorTransition.type === 'err') return priorTransition;
    const lease = readLeaseInDatabase(database, command.leaseId.value);
    if (lease.type === 'err') return lease;
    if (lease.value === null) return notFound('The secret lease does not exist.');
    if (priorTransition.value !== null) return sameLeaseTransition(priorTransition.value, command)
      ? journalOk({ status: 'already-committed', record: leaseTransitionOutcome(lease.value, priorTransition.value) })
      : conflict('The journal operation id is already bound to a different lease transition.');
    if (lease.value.state !== command.expectedState || command.atMs < lease.value.issuedAtMs ||
        command.atMs >= lease.value.expiresAtMs) {
      return conflict('The secret lease state or lifetime changed before this transition.');
    }
    const terminatedAtMs = command.nextState === 'active' ? null : command.atMs;
    const changes = preparedRun(database, `UPDATE leases
        SET state = ?, terminated_at_ms = ?
        WHERE lease_id = ? AND state = ?`, [
      command.nextState,
      terminatedAtMs,
      command.leaseId.value,
      command.expectedState
    ]);
    if (changes !== 1) return conflict('The secret lease changed concurrently.');
    preparedRun(database, `INSERT INTO lease_transitions (
        operation_id, lease_id, expected_state, next_state, at_ms
      ) VALUES (?, ?, ?, ?, ?)`, [
      command.operationId.value,
      command.leaseId.value,
      command.expectedState,
      command.nextState,
      command.atMs
    ]);
    return journalOk({
      status: 'committed',
      record: {
        ...lease.value,
        terminatedAtMs,
        state: command.nextState
      }
    });
  }
).immediate();

const consumeTransferInDatabase = (
  database: Database,
  command: ConsumeTransfer
): JournalResult<JournalMutation<TransferReplayRecord>> => database.transaction(
  (): JournalResult<JournalMutation<TransferReplayRecord>> => {
  const byOperation = readTransferByOperation(database, command.operationId.value);
  if (byOperation.type === 'err') return byOperation;
  if (byOperation.value !== null) return sameTransfer(byOperation.value, command.transfer)
    ? journalOk({ status: 'already-committed', record: byOperation.value })
    : conflict('The journal operation id is already bound to a different transfer.');
  const byTransfer = readTransferInDatabase(database, command.transfer.id.value);
  if (byTransfer.type === 'err') return byTransfer;
  if (byTransfer.value !== null) return journalErr({
    code: 'transfer-replayed',
    message: 'The encrypted-cartridge transfer was already consumed.'
  });
  const grant = readGrantInDatabase(database, command.transfer.destinationGrantId);
  if (grant.type === 'err') return grant;
  if (grant.value === null || grant.value.state !== 'active' || grant.value.expiresAtMs <= command.transfer.consumedAtMs) {
    return conflict('The transfer destination grant is unavailable.');
  }
  preparedRun(database, `INSERT INTO transfer_replays (
      transfer_id, operation_id, destination_grant_id, issued_at_ms, expires_at_ms, consumed_at_ms, state
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`, [
    command.transfer.id.value,
    command.transfer.operationId.value,
    command.transfer.destinationGrantId,
    command.transfer.issuedAtMs,
    command.transfer.expiresAtMs,
    command.transfer.consumedAtMs,
    command.transfer.state
  ]);
  return journalOk({ status: 'committed', record: command.transfer });
  }
).immediate();

const isLocalAbsolutePath = (value: string): boolean =>
  isAbsolute(value) && !value.startsWith('\\\\') && !value.includes('\0');

const authorityDatabasePath = (value: string): JournalResult<AuthorityDatabasePath> =>
  isLocalAbsolutePath(value)
    ? journalOk({ kind: 'authority-database-path', value: normalize(value) })
    : journalErr({ code: 'journal-invalid', message: 'The authority database path is not a local absolute path.' });

export const createWindowsProfilePathPort = (
  localApplicationData: TrustedLocalApplicationDataPort
): ProfilePathPort => ({
  resolveAuthorityDatabasePath: () => Promise.resolve()
    .then(() => localApplicationData.resolveCurrentUserRoot())
    .then(
      root => root.type === 'err'
        ? root
        : authorityDatabasePath(join(root.value.value, ...AUTHORITY_DATABASE_SUFFIX)),
      () => journalErr({ code: 'journal-unavailable', message: 'The current-user profile location is unavailable.' })
    )
});

export const createTestOnlyProfilePathPort = (databasePath: string): ProfilePathPort => ({
  resolveAuthorityDatabasePath: () => Promise.resolve(authorityDatabasePath(databasePath))
});

const validateOptions = (options: BunSqliteJournalOptions): JournalResult<ResolvedOptions> => {
  const busyTimeoutMs = options.busyTimeoutMs ?? DEFAULT_BUSY_TIMEOUT_MS;
  return Number.isSafeInteger(busyTimeoutMs) && busyTimeoutMs >= 1 && busyTimeoutMs <= MAXIMUM_BUSY_TIMEOUT_MS &&
    options.applicationVersion.length > 0 && options.applicationVersion.length <= 128 &&
    !options.applicationVersion.includes('\0')
    ? journalOk({ ...options, busyTimeoutMs })
    : journalErr({ code: 'journal-invalid', message: 'The authority journal configuration is invalid.' });
};

const sqliteFailure = <T>(cause: unknown): JournalResult<T> => {
  const code = isRecord(cause) && typeof cause['code'] === 'string' ? cause['code'] : undefined;
  if (code?.startsWith('SQLITE_BUSY') === true || code?.startsWith('SQLITE_LOCKED') === true) {
    return journalErr({ code: 'journal-busy', message: 'The authority journal remained locked past its bounded timeout.' });
  }
  if (code?.startsWith('SQLITE_CONSTRAINT') === true) {
    return conflict('The authority journal rejected conflicting state.');
  }
  if (code?.startsWith('SQLITE_CORRUPT') === true || code?.startsWith('SQLITE_NOTADB') === true) {
    return corrupt();
  }
  return journalErr({ code: 'journal-unavailable', message: 'The authority journal operation failed.' });
};

const prepareParentDirectory = (path: AuthorityDatabasePath): JournalResult<void> => {
  const parent = dirname(path.value);
  mkdirSync(parent, { recursive: true });
  return lstatSync(parent).isSymbolicLink()
    ? journalErr({ code: 'journal-invalid', message: 'The authority profile path is not a real local directory.' })
    : journalOk(undefined);
};

const migrationTableExists = (database: Database): JournalResult<boolean> => {
  const row = preparedGet<unknown>(
    database,
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
    ['schema_migrations']
  );
  return row === null ? journalOk(false) : isRecord(row) && row['name'] === 'schema_migrations'
    ? journalOk(true)
    : corrupt();
};

const countUserTables = (database: Database): JournalResult<number> => {
  const row = preparedGet<unknown>(
    database,
    "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
    []
  );
  return isRecord(row) ? parseSafeInteger(row['count']) : corrupt();
};

const verifyCurrentMigration = (database: Database): JournalResult<void> => {
  const exists = migrationTableExists(database);
  if (exists.type === 'err') return exists;
  if (!exists.value) return recoveryRequired('The authority schema marker exists without its migration evidence.');
  const rows = preparedAll<unknown>(
    database,
    'SELECT version, checksum, application_version, applied_at_ms FROM schema_migrations ORDER BY version',
    []
  );
  if (rows.length !== 1 || !isRecord(rows[0])) return recoveryRequired('The authority migration history is incomplete.');
  const row = rows[0];
  const version = parsePositiveInteger(row['version']);
  const appliedAtMs = parseSafeInteger(row['applied_at_ms']);
  const applicationVersion = parseText(row['application_version'], 128);
  if (version.type === 'err' || appliedAtMs.type === 'err' || applicationVersion.type === 'err' ||
      version.value !== CURRENT_SCHEMA_VERSION || row['checksum'] !== SCHEMA_V1_CHECKSUM) {
    return recoveryRequired('The authority migration history does not match the admitted schema.');
  }
  return journalOk(undefined);
};

const applySchemaV1 = (database: Database, options: ResolvedOptions): JournalResult<void> => {
  const userTables = countUserTables(database);
  if (userTables.type === 'err') return userTables;
  if (userTables.value !== 0) return recoveryRequired('An unversioned authority database already contains tables.');
  const appliedAtMs = options.clock.nowMs();
  if (!Number.isSafeInteger(appliedAtMs) || appliedAtMs < 0) {
    return journalErr({ code: 'journal-invalid', message: 'The supplied journal clock is invalid.' });
  }
  database.transaction((): void => {
    SCHEMA_V1_STATEMENTS.forEach(sql => {
      database.run(sql);
    });
    preparedRun(database, `INSERT INTO schema_migrations (
        version, checksum, application_version, applied_at_ms
      ) VALUES (?, ?, ?, ?)`, [CURRENT_SCHEMA_VERSION, SCHEMA_V1_CHECKSUM, options.applicationVersion, appliedAtMs]);
    database.run(`PRAGMA user_version = ${CURRENT_SCHEMA_VERSION}`);
  }).immediate();
  return journalOk(undefined);
};

const migrateSchema = (database: Database, options: ResolvedOptions): JournalResult<void> => {
  const versionScalar = readScalarPragma(database, 'PRAGMA user_version');
  if (versionScalar.type === 'err') return versionScalar;
  const version = parseSafeInteger(versionScalar.value);
  if (version.type === 'err') return version;
  if (version.value > CURRENT_SCHEMA_VERSION) {
    return journalErr({
      code: 'journal-schema-newer',
      message: 'The authority database belongs to a newer broker schema.'
    });
  }
  if (version.value === CURRENT_SCHEMA_VERSION) return verifyCurrentMigration(database);
  if (version.value !== 0) return recoveryRequired('The authority schema requires an unavailable migration.');
  const markerExists = migrationTableExists(database);
  if (markerExists.type === 'err') return markerExists;
  return markerExists.value
    ? recoveryRequired('An interrupted authority migration requires recovery.')
    : applySchemaV1(database, options);
};

const configureConnection = (database: Database, options: ResolvedOptions): JournalResult<void> => {
  database.run(`PRAGMA busy_timeout = ${options.busyTimeoutMs}`);
  database.run('PRAGMA foreign_keys = ON');
  database.run('PRAGMA synchronous = FULL');
  const journalMode = readScalarPragma(database, 'PRAGMA journal_mode = WAL');
  if (journalMode.type === 'err' || journalMode.value !== 'wal') {
    return journalErr({ code: 'journal-unavailable', message: 'The authority journal durability mode is unavailable.' });
  }
  const foreignKeys = readScalarPragma(database, 'PRAGMA foreign_keys');
  const busyTimeout = readScalarPragma(database, 'PRAGMA busy_timeout');
  const synchronous = readScalarPragma(database, 'PRAGMA synchronous');
  if (foreignKeys.type === 'err' || foreignKeys.value !== 1 || busyTimeout.type === 'err' ||
      busyTimeout.value !== options.busyTimeoutMs || synchronous.type === 'err' || synchronous.value !== 2) {
    return journalErr({ code: 'journal-unavailable', message: 'The authority journal connection policy was not applied.' });
  }
  return journalOk(undefined);
};

const boundedIntegrityCheck = (database: Database): JournalResult<void> => {
  const result = readScalarPragma(database, 'PRAGMA quick_check(1)');
  return result.type === 'ok' && result.value === 'ok'
    ? journalOk(undefined)
    : corrupt('The authority journal failed its bounded startup integrity check.');
};

const closeWithResult = <T>(database: Database, result: JournalResult<T>): Promise<JournalResult<T>> =>
  Promise.resolve()
    .then(() => database.close(true))
    .then(
      () => result,
      () => journalErr({ code: 'journal-closed', message: 'The authority journal could not close cleanly.' })
    );

const initializeDatabase = (database: Database, options: ResolvedOptions): JournalResult<void> => {
  const configured = configureConnection(database, options);
  if (configured.type === 'err') return configured;
  const migrated = migrateSchema(database, options);
  if (migrated.type === 'err') return migrated;
  return boundedIntegrityCheck(database);
};

const withDatabase = <T>(
  rawOptions: BunSqliteJournalOptions,
  operation: (database: Database) => JournalResult<T>
): Promise<JournalResult<T>> => {
  const options = validateOptions(rawOptions);
  if (options.type === 'err') return Promise.resolve(options);
  return Promise.resolve()
    .then(() => options.value.profilePath.resolveAuthorityDatabasePath())
    .then(
      path => path.type === 'err'
        ? path
        : Promise.resolve()
          .then(() => prepareParentDirectory(path.value))
          .then(
            prepared => prepared.type === 'err'
              ? prepared
              : Promise.resolve()
                .then(() => import('bun:sqlite'))
                .then(sqlite => new sqlite.Database(
                  path.value.value,
                  { create: true, readwrite: true, safeIntegers: false, strict: true }
                ))
                .then(
                  database => Promise.resolve()
                    .then(() => initializeDatabase(database, options.value))
                    .then(initialized => initialized.type === 'err' ? initialized : operation(database))
                    .then(
                      result => closeWithResult(database, result),
                      cause => closeWithResult(database, sqliteFailure(cause))
                    ),
                  cause => sqliteFailure(cause)
                ),
            cause => sqliteFailure(cause)
          ),
      () => journalErr({ code: 'journal-unavailable', message: 'The authority database path is unavailable.' })
    );
};

const runValidated = <Command, T>(
  options: BunSqliteJournalOptions,
  validation: JournalResult<Command>,
  operation: (database: Database, command: Command) => JournalResult<T>
): Promise<JournalResult<T>> => validation.type === 'err'
  ? Promise.resolve(validation)
  : withDatabase(options, database => operation(database, validation.value));

export const createBunSqliteAuthorityJournal = (options: BunSqliteJournalOptions): AuthorityJournal => ({
  grants: {
    commitWithConsent: command => runValidated(
      options,
      validateGrantWithConsent(command),
      commitGrantWithConsentInDatabase
    ),
    readGrant: id => withDatabase(options, database => readGrantInDatabase(database, id)),
    readConsent: id => withDatabase(options, database => readConsentInDatabase(database, id))
  },
  leases: {
    create: command => runValidated(options, validateLeaseCreation(command), createLeaseInDatabase),
    transition: command => runValidated(options, validateLeaseTransition(command), transitionLeaseInDatabase),
    read: id => withDatabase(options, database => readLeaseInDatabase(database, id.value))
  },
  attempts: {
    reserve: command => runValidated(options, validateAttemptReservation(command), reserveAttemptInDatabase),
    transition: command => runValidated(options, validateAttemptTransition(command), transitionAttemptInDatabase),
    read: id => withDatabase(options, database => readAttemptInDatabase(database, id))
  },
  transfers: {
    consume: command => runValidated(options, validateTransferConsumption(command), consumeTransferInDatabase),
    read: id => withDatabase(options, database => readTransferInDatabase(database, id.value))
  }
});
