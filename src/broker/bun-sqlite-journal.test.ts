import { Database } from 'bun:sqlite';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Result } from 'neverthrow';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import {
  createBunSqliteAuthorityJournal,
  createTestOnlyProfilePathPort,
  createWindowsProfilePathPort
} from './bun-sqlite-journal.ts';
import {
  journalOk,
  parseBootstrapExchangeJournalId,
  parseCheckedInRecipeLocator,
  parseConsentId,
  parseJournalOperationId,
  parseLeaseJournalId,
  parseProcessIncarnation,
  parseReceiverCorrelation,
  parseReceiverEntryIdentity,
  parseRedactedAuthorityDigest,
  parseRedactedPlanDigest,
  parseTransferId,
  type AuthorityJournal,
  type BindBootstrapAttempt,
  type BootstrapAttemptBinding,
  type ClaimAuthorizedBootstrapLease,
  type CommitGrantWithConsent,
  type JournalResult,
  type ReserveGrantQualifiedMaterializingAttempt,
  type ReserveAttempt
} from './journal.ts';
import {
  parseCredentialReference,
  parseSecretExposureCleanupReceiptId,
  parseSecretExposureCorrelation
} from './lease.ts';
import {
  parseCanonicalRepository,
  parseCredentialSlotId,
  parseGrantId,
  parseProcessAttemptId,
  parseReceiverId,
  parseRecipeRevision
} from './primitives.ts';

const unwrapJournal = <T>(result: JournalResult<T>): T => {
  if (result.type === 'err') throw new Error(result.issues[0].message);
  return result.value;
};

const unwrapBroker = <T>(result: Result<T, unknown>): T => {
  if (result.isErr()) throw new Error('broker primitive fixture failed');
  return result.value;
};

const operationId = (value: string) => unwrapJournal(parseJournalOperationId(value));
const launchMetadataDigest = 'a'.repeat(64);
const slotIndependentPlanDigest = 'b'.repeat(64);

const authorityFixture = (suffix: string = '1'): CommitGrantWithConsent => {
  const operation = operationId(`operation-enroll-${suffix}`);
  const consentId = unwrapJournal(parseConsentId(`consent-${suffix}`));
  const repository = unwrapBroker(parseCanonicalRepository('R:\\Code\\example'));
  const recipeRevision = unwrapBroker(parseRecipeRevision('sha256:recipe-v1'));
  const slot = unwrapBroker(parseCredentialSlotId('weather-api'));
  return {
    operationId: operation,
    consent: {
      id: consentId,
      operationId: operation,
      repository,
      recipeRevision,
      authorityDigest: unwrapJournal(parseRedactedAuthorityDigest('sha256:redacted-authority')),
      promptVersion: 'nebular-consent/v1',
      credentialSlotIds: [slot],
      deliveryMode: 'cooperative-bootstrap',
      grantExpiresAtMs: 10_000,
      occurredAtMs: 1_000,
      outcome: 'approved'
    },
    grant: {
      id: unwrapBroker(parseGrantId('grant-1')),
      operationId: operation,
      repository,
      recipeRevision,
      credentialBindings: [{
        slotId: slot,
        credentialReference: unwrapBroker(parseCredentialReference('credential-reference-1'))
      }],
      consentId,
      generation: 1,
      issuedAtMs: 1_000,
      expiresAtMs: 10_000,
      state: 'active'
    }
  };
};

const twoSlotAuthorityFixture = (repeatReference: boolean = false): CommitGrantWithConsent => {
  const base = authorityFixture();
  const secondSlot = unwrapBroker(parseCredentialSlotId('radar-api'));
  const firstReference = base.grant.credentialBindings[0].credentialReference;
  const secondReference = repeatReference
    ? firstReference
    : unwrapBroker(parseCredentialReference('credential-reference-2'));
  return {
    ...base,
    consent: {
      ...base.consent,
      credentialSlotIds: [base.grant.credentialBindings[0].slotId, secondSlot]
    },
    grant: {
      ...base.grant,
      credentialBindings: [
        { slotId: secondSlot, credentialReference: secondReference },
        base.grant.credentialBindings[0]
      ]
    }
  };
};

const attemptFixture = (authority: CommitGrantWithConsent): ReserveAttempt => {
  const operation = operationId('operation-attempt-reserve-1');
  return {
    operationId: operation,
    attempt: {
      id: unwrapBroker(parseProcessAttemptId('attempt-1')),
      reserveOperationId: operation,
      repository: authority.grant.repository,
      recipeRevision: authority.grant.recipeRevision,
      planDigest: unwrapJournal(parseRedactedPlanDigest(launchMetadataDigest)),
      lifecycle: 'one-shot',
      receiverCorrelation: null,
      state: 'reserved',
      stateVersion: 1,
      createdAtMs: 1_100,
      updatedAtMs: 1_100,
      bootstrapBinding: null
    }
  };
};

const bootstrapBindingFixture = (
  authority: CommitGrantWithConsent,
  generation: number = 1,
  incarnation: string = 'windows-created:9001'
): BootstrapAttemptBinding => ({
  format: 'bootstrap-attempt-binding/v2',
  bindingGeneration: generation,
  grantId: authority.grant.id,
  grantGeneration: authority.grant.generation,
  receiverId: unwrapBroker(parseReceiverId('pm2')),
  receiverEntryIdentity: unwrapJournal(parseReceiverEntryIdentity(`pm2-entry:attempt-1:generation-${generation}`)),
  helperParentProcessId: 4_100 + generation,
  helperParentProcessIncarnation: unwrapJournal(parseProcessIncarnation(incarnation)),
  recipeLocator: unwrapJournal(parseCheckedInRecipeLocator('.nebular/recipe.xml'))
});

const bootstrapBindFixture = (
  authority: CommitGrantWithConsent,
  attempt: ReserveAttempt,
  suffix: string = '1'
): BindBootstrapAttempt => ({
  operationId: operationId(`operation-attempt-bind-${suffix}`),
  attemptId: attempt.attempt.id,
  mode: 'initial',
  expectedState: 'materializing',
  expectedStateVersion: 2,
  priorBindingGeneration: null,
  atMs: 1_225,
  receiverCorrelation: unwrapJournal(parseReceiverCorrelation('pm2:attempt-1')),
  binding: bootstrapBindingFixture(authority)
});

const claimFixture = (
  authority: CommitGrantWithConsent,
  attempt: ReserveAttempt,
  suffix: string,
  state: 'materializing' | 'running' = 'materializing',
  stateVersion: number = 3,
  binding: BootstrapAttemptBinding = bootstrapBindingFixture(authority),
  exchangeSuffix: string = suffix
): ClaimAuthorizedBootstrapLease => {
  const claimOperation = operationId(`operation-bootstrap-claim-${suffix}`);
  return {
    operationId: claimOperation,
    exchangeId: unwrapJournal(parseBootstrapExchangeJournalId(`bootstrap-exchange-${exchangeSuffix}`)),
    expectedAttempt: {
      id: attempt.attempt.id,
      state,
      stateVersion,
      binding
    },
    lease: {
      id: unwrapJournal(parseLeaseJournalId(`bootstrap-lease-${suffix}`)),
      operationId: claimOperation,
      grantId: authority.grant.id,
      grantGeneration: authority.grant.generation,
      processAttemptId: attempt.attempt.id,
      receiverId: binding.receiverId,
      exposureCorrelation: unwrapBroker(parseSecretExposureCorrelation(`bootstrap-exposure-${suffix}`)),
      issuedAtMs: 1_300,
      expiresAtMs: 5_000,
      updatedAtMs: 1_300,
      cleanupReceipt: null,
      state: 'authorized'
    }
  };
};

const readScalar = (database: Database, sql: string, bindings: readonly (string | number)[] = []): unknown => {
  using statement = database.prepare<unknown, (string | number)[]>(sql);
  const row = statement.get(...bindings);
  if (typeof row !== 'object' || row === null || Array.isArray(row)) return undefined;
  return Object.values(row)[0];
};

const materializingReservationFixture = (
  authority: CommitGrantWithConsent,
  attempt: ReserveAttempt,
  authorityCheckedAtMs: number = 1_200
): ReserveGrantQualifiedMaterializingAttempt => ({
  authorityCheckedAtMs,
  authority: {
    grantId: authority.grant.id,
    grantGeneration: authority.grant.generation,
    repository: authority.grant.repository,
    recipeRevision: authority.grant.recipeRevision,
    credentialSlotIds: authority.grant.credentialBindings.map(binding => binding.slotId),
    grantExpiresAtMs: authority.grant.expiresAtMs
  },
  admission: {
    format: 'grant-qualified-launch-admission/v1',
    bindingGeneration: 1,
    receiverId: unwrapBroker(parseReceiverId('pm2')),
    receiverSlotIdentity: 'nebular-one-shot:00',
    receiverProcessName: 'nebular-one-shot-00',
    receiverEntryIdentity: bootstrapBindingFixture(authority).receiverEntryIdentity,
    recipeLocator: unwrapJournal(parseCheckedInRecipeLocator('.nebular/recipe.xml')),
    slotIndependentPlanDigest: unwrapJournal(parseRedactedPlanDigest(slotIndependentPlanDigest)),
    launchMetadataDigest,
    deadlineAtMs: 5_000
  },
  reservation: attempt,
  materialization: {
    operationId: operationId('operation-attempt-transition-1'),
    attemptId: attempt.attempt.id,
    expectedState: 'reserved',
    nextState: 'materializing',
    atMs: 1_200,
    receiverCorrelation: unwrapJournal(parseReceiverCorrelation('pm2:attempt-1'))
  }
});

const reserveMaterializingAttempt = (
  authorityJournal: AuthorityJournal,
  authority: CommitGrantWithConsent,
  attempt: ReserveAttempt
) => authorityJournal.attempts.reserveGrantQualifiedMaterializing(
  materializingReservationFixture(authority, attempt)
);

const downgradeCurrentSchemaToV4 = (database: Database): void => {
  database.run('PRAGMA foreign_keys = OFF');
  database.run('DROP INDEX leases_one_nonterminal_per_grant_attempt');
  database.run('ALTER TABLE bootstrap_lease_claims RENAME TO bootstrap_lease_claims_v5');
  database.run('ALTER TABLE lease_transitions RENAME TO lease_transitions_v5');
  database.run('ALTER TABLE leases RENAME TO leases_v5');
  database.run(`CREATE TABLE leases (
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
  ) STRICT`);
  database.run(`INSERT INTO leases (
      lease_id, operation_id, grant_id, grant_generation, process_attempt_id,
      issued_at_ms, expires_at_ms, terminated_at_ms, state
    ) SELECT
      lease_id, operation_id, grant_id, grant_generation, process_attempt_id,
      issued_at_ms, expires_at_ms,
      CASE WHEN state IN ('closed', 'revoked') THEN updated_at_ms ELSE NULL END,
      CASE
        WHEN state = 'authorized' THEN 'authorized'
        WHEN state IN ('closed', 'revoked') THEN 'revoked'
        ELSE 'active'
      END
    FROM leases_v5`);
  database.run(`CREATE TABLE lease_transitions (
    operation_id TEXT PRIMARY KEY,
    lease_id TEXT NOT NULL REFERENCES leases(lease_id) ON DELETE RESTRICT,
    expected_state TEXT NOT NULL CHECK (expected_state IN ('authorized', 'active')),
    next_state TEXT NOT NULL CHECK (next_state IN ('active', 'consumed', 'revoked')),
    at_ms INTEGER NOT NULL CHECK (at_ms >= 0)
  ) STRICT`);
  database.run(`CREATE TABLE bootstrap_lease_claims (
    operation_id TEXT PRIMARY KEY REFERENCES journal_operations(operation_id) ON DELETE RESTRICT,
    lease_id TEXT NOT NULL UNIQUE REFERENCES leases(lease_id) ON DELETE RESTRICT,
    attempt_id TEXT NOT NULL REFERENCES bootstrap_attempt_bindings(attempt_id) ON DELETE RESTRICT,
    exchange_id TEXT NOT NULL,
    expected_attempt_state TEXT NOT NULL CHECK (expected_attempt_state IN ('materializing', 'running')),
    expected_attempt_version INTEGER NOT NULL CHECK (expected_attempt_version >= 1),
    expected_binding_generation INTEGER NOT NULL CHECK (expected_binding_generation >= 1),
    expected_grant_id TEXT NOT NULL,
    expected_grant_generation INTEGER NOT NULL CHECK (expected_grant_generation >= 1),
    expected_receiver_id TEXT NOT NULL,
    expected_receiver_entry_identity TEXT NOT NULL,
    expected_helper_parent_process_id INTEGER NOT NULL CHECK (expected_helper_parent_process_id >= 1),
    expected_helper_parent_process_incarnation TEXT NOT NULL,
    expected_recipe_locator TEXT NOT NULL,
    UNIQUE (attempt_id, exchange_id),
    FOREIGN KEY (operation_id) REFERENCES leases(operation_id) ON DELETE RESTRICT
  ) STRICT`);
  database.run('DROP TABLE bootstrap_lease_claims_v5');
  database.run('DROP TABLE lease_transitions_v5');
  database.run('DROP TABLE leases_v5');
  database.run(`CREATE UNIQUE INDEX leases_one_nonterminal_per_grant_attempt
    ON leases (grant_id, grant_generation, process_attempt_id)
    WHERE state IN ('authorized', 'active')`);
  database.run('DELETE FROM schema_migrations WHERE version = 5');
  database.run('PRAGMA user_version = 4');
};

const downgradeCurrentSchemaToV3 = (database: Database): void => {
  downgradeCurrentSchemaToV4(database);
  database.run('DROP TABLE attempt_launch_admission_slots');
  database.run('DROP TABLE attempt_launch_admissions');
  database.run('DELETE FROM schema_migrations WHERE version = 4');
  database.run('PRAGMA user_version = 3');
};

const downgradeCurrentSchemaToV2 = (database: Database): void => {
  downgradeCurrentSchemaToV3(database);
  database.run('DROP TABLE grant_bindings');
  database.run('DELETE FROM schema_migrations WHERE version = 3');
  database.run('PRAGMA user_version = 2');
};

const downgradeCurrentSchemaToV1 = (database: Database): void => {
  downgradeCurrentSchemaToV2(database);
  database.run('DROP INDEX leases_one_nonterminal_per_grant_attempt');
  database.run('DROP TABLE bootstrap_lease_claims');
  database.run('DROP TABLE bootstrap_attempt_binding_events');
  database.run('DROP TABLE bootstrap_attempt_bindings');
  database.run('DROP TABLE journal_operations');
  database.run('DELETE FROM schema_migrations WHERE version = 2');
  database.run('PRAGMA user_version = 1');
};

const materializeAttempt = (authorityJournal: AuthorityJournal, attempt: ReserveAttempt) =>
  authorityJournal.attempts.transition({
    operationId: operationId('operation-attempt-transition-1'),
    attemptId: attempt.attempt.id,
    expectedState: 'reserved',
    nextState: 'materializing',
    atMs: 1_200,
    receiverCorrelation: unwrapJournal(parseReceiverCorrelation('pm2:attempt-1'))
  });

const bindBootstrapAttempt = (
  authorityJournal: AuthorityJournal,
  authority: CommitGrantWithConsent,
  attempt: ReserveAttempt,
  suffix: string = '1'
) => authorityJournal.attempts.bindBootstrap(bootstrapBindFixture(authority, attempt, suffix));

describe('Bun SQLite nonsecret authority journal', () => {
  let temporaryRoot = '';
  let databasePath = '';
  let journalNowMs = 1_250;
  let journal: AuthorityJournal;

  beforeEach(() => {
    journalNowMs = 1_250;
    temporaryRoot = mkdtempSync(join(tmpdir(), 'nebular-journal-'));
    databasePath = join(temporaryRoot, 'broker.sqlite3');
    journal = createBunSqliteAuthorityJournal({
      profilePath: createTestOnlyProfilePathPort(databasePath),
      applicationVersion: 'test-build-1',
      busyTimeoutMs: 50,
      clock: { nowMs: () => journalNowMs }
    });
  });

  afterEach(() => {
    rmSync(temporaryRoot, { recursive: true, force: true });
  });

  it('creates schema v5 and atomically commits consent with its exact grant bindings', async () => {
    const command = authorityFixture();
    const committed = await journal.grants.commitWithConsent(command);
    expect(committed).toEqual({ type: 'ok', value: { status: 'committed', record: command.grant } });

    const retried = await journal.grants.commitWithConsent(command);
    expect(retried).toEqual({ type: 'ok', value: { status: 'already-committed', record: command.grant } });
    expect(await journal.grants.readConsent(command.consent.id)).toEqual({ type: 'ok', value: command.consent });
    expect(await journal.grants.readGrant(command.grant.id)).toEqual({ type: 'ok', value: command.grant });

    using database = new Database(databasePath, { readonly: true, strict: true });
    expect(readScalar(database, 'PRAGMA user_version')).toBe(5);
    expect(readScalar(database, 'SELECT COUNT(*) FROM schema_migrations')).toBe(5);
    expect(readScalar(database, 'SELECT application_version FROM schema_migrations WHERE version = 1'))
      .toBe('test-build-1');
    expect(readScalar(database, 'SELECT length(checksum) FROM schema_migrations WHERE version = 1')).toBe(64);
    expect(readScalar(database, 'SELECT length(checksum) FROM schema_migrations WHERE version = 2')).toBe(64);
    expect(readScalar(database, 'SELECT length(checksum) FROM schema_migrations WHERE version = 3')).toBe(64);
    expect(readScalar(database, 'SELECT length(checksum) FROM schema_migrations WHERE version = 4')).toBe(64);
    expect(readScalar(database, 'SELECT COUNT(*) FROM attempt_launch_admissions')).toBe(0);
    expect(readScalar(database, 'SELECT COUNT(*) FROM attempt_launch_admission_slots')).toBe(0);
  });

  it('round-trips distinct per-slot references and compares them for idempotency', async () => {
    const command = twoSlotAuthorityFixture();
    expect(await journal.grants.commitWithConsent(command)).toEqual({
      type: 'ok', value: { status: 'committed', record: command.grant }
    });
    expect(await journal.grants.readGrant(command.grant.id)).toEqual({ type: 'ok', value: command.grant });
    expect(await journal.grants.commitWithConsent(command)).toEqual({
      type: 'ok', value: { status: 'already-committed', record: command.grant }
    });

    const secondBinding = command.grant.credentialBindings[1];
    if (secondBinding === undefined) throw new Error('expected a second grant binding fixture');
    const drifted = {
      ...command,
      grant: {
        ...command.grant,
        credentialBindings: [
          command.grant.credentialBindings[0],
          {
            ...secondBinding,
            credentialReference: unwrapBroker(parseCredentialReference('credential-reference-drift'))
          }
        ] as const
      }
    };
    expect(await journal.grants.commitWithConsent(drifted)).toEqual(expect.objectContaining({
      type: 'err',
      issues: [expect.objectContaining({ code: 'journal-conflict' })]
    }));
  });

  it('atomically reserves an exact grant-qualified materializing admission and replays it after reopen', async () => {
    const authority = authorityFixture();
    const attempt = attemptFixture(authority);
    const command = materializingReservationFixture(authority, attempt);
    expect((await journal.grants.commitWithConsent(authority)).type).toBe('ok');

    const committed = await journal.attempts.reserveGrantQualifiedMaterializing(command);
    expect(committed).toEqual({
      type: 'ok',
      value: {
        status: 'committed',
        record: {
          attempt: {
            ...attempt.attempt,
            receiverCorrelation: command.materialization.receiverCorrelation,
            state: 'materializing',
            stateVersion: 2,
            updatedAtMs: command.materialization.atMs
          },
          authority: command.authority,
          admission: command.admission
        }
      }
    });

    const reopened = createBunSqliteAuthorityJournal({
      profilePath: createTestOnlyProfilePathPort(databasePath),
      applicationVersion: 'test-build-1',
      busyTimeoutMs: 50,
      clock: { nowMs: () => journalNowMs }
    });
    expect(await reopened.attempts.readGrantQualifiedMaterializing(attempt.attempt.id)).toEqual({
      type: 'ok',
      value: committed.type === 'ok' ? committed.value.record : null
    });
    journalNowMs = 1_300;
    expect(await reopened.attempts.reserveGrantQualifiedMaterializing({
      ...command,
      authorityCheckedAtMs: 1_300
    })).toEqual(expect.objectContaining({
      type: 'ok',
      value: expect.objectContaining({ status: 'already-committed' })
    }));

    const drifted = {
      ...command,
      authorityCheckedAtMs: 1_300,
      admission: { ...command.admission, receiverProcessName: 'nebular-one-shot-drift' }
    };
    expect(await reopened.attempts.reserveGrantQualifiedMaterializing(drifted)).toEqual(expect.objectContaining({
      type: 'err',
      issues: [expect.objectContaining({ code: 'journal-conflict' })]
    }));

    expect((await reopened.attempts.transition({
      operationId: operationId('operation-attempt-running-after-admission'),
      attemptId: attempt.attempt.id,
      expectedState: 'materializing',
      nextState: 'running',
      atMs: 1_400,
      receiverCorrelation: command.materialization.receiverCorrelation
    })).type).toBe('ok');
    expect(await reopened.attempts.readGrantQualifiedAttempt(attempt.attempt.id)).toEqual(expect.objectContaining({
      type: 'ok',
      value: expect.objectContaining({
        attempt: expect.objectContaining({ state: 'running', stateVersion: 3 }),
        authority: command.authority,
        admission: command.admission
      })
    }));
    expect(await reopened.attempts.readGrantQualifiedMaterializing(attempt.attempt.id)).toEqual({
      type: 'ok',
      value: null
    });

    using database = new Database(databasePath, { strict: true });
    expect(readScalar(database, 'SELECT COUNT(*) FROM attempts')).toBe(1);
    expect(readScalar(database, 'SELECT COUNT(*) FROM attempt_transitions')).toBe(2);
    expect(readScalar(database, 'SELECT COUNT(*) FROM attempt_launch_admissions')).toBe(1);
    expect(readScalar(database, 'SELECT COUNT(*) FROM attempt_launch_admission_slots')).toBe(1);
    expect(readScalar(
      database,
      'SELECT receiver_process_name FROM attempt_launch_admissions WHERE attempt_id = ?',
      [attempt.attempt.id]
    )).toBe(command.admission.receiverProcessName);
  });

  it('uses trusted transaction time for initial admission and exact retry without reviving expired admission', async () => {
    const authority = authorityFixture();
    const attempt = attemptFixture(authority);
    const command = materializingReservationFixture(authority, attempt);
    expect((await journal.grants.commitWithConsent(authority)).type).toBe('ok');

    const wrongSlot = unwrapBroker(parseCredentialSlotId('ungranted-api'));
    expect(await journal.attempts.reserveGrantQualifiedMaterializing({
      ...command,
      authority: { ...command.authority, credentialSlotIds: [wrongSlot] }
    })).toEqual(expect.objectContaining({
      type: 'err',
      issues: [expect.objectContaining({ code: 'journal-authority-stale' })]
    }));
    {
      using database = new Database(databasePath, { readonly: true, strict: true });
      expect(readScalar(database, 'SELECT COUNT(*) FROM attempts')).toBe(0);
      expect(readScalar(database, 'SELECT COUNT(*) FROM attempt_transitions')).toBe(0);
      expect(readScalar(database, 'SELECT COUNT(*) FROM attempt_launch_admissions')).toBe(0);
      expect(readScalar(database, 'SELECT COUNT(*) FROM journal_operations')).toBe(1);
    }

    journalNowMs = command.admission.deadlineAtMs;
    expect(await journal.attempts.reserveGrantQualifiedMaterializing(command)).toEqual(expect.objectContaining({
      type: 'err',
      issues: [expect.objectContaining({ code: 'journal-authority-stale' })]
    }));
    {
      using database = new Database(databasePath, { readonly: true, strict: true });
      expect(readScalar(database, 'SELECT COUNT(*) FROM attempts')).toBe(0);
      expect(readScalar(database, 'SELECT COUNT(*) FROM journal_operations')).toBe(1);
    }

    journalNowMs = 1_250;
    expect((await journal.attempts.reserveGrantQualifiedMaterializing(command)).type).toBe('ok');
    journalNowMs = command.admission.deadlineAtMs - 1;
    expect(await journal.attempts.reserveGrantQualifiedMaterializing({
      ...command,
      authorityCheckedAtMs: 1_400
    })).toEqual(expect.objectContaining({
      type: 'ok',
      value: expect.objectContaining({ status: 'already-committed' })
    }));
    journalNowMs = command.admission.deadlineAtMs;
    expect(await journal.attempts.reserveGrantQualifiedMaterializing({
      ...command,
      authorityCheckedAtMs: 1_400
    })).toEqual(expect.objectContaining({
      type: 'err',
      issues: [expect.objectContaining({ code: 'journal-authority-stale' })]
    }));
    expect((await journal.attempts.readGrantQualifiedMaterializing(attempt.attempt.id)).type).toBe('ok');
  });

  it('fails closed when a normalized grant binding is missing from persisted authority', async () => {
    const command = twoSlotAuthorityFixture();
    expect((await journal.grants.commitWithConsent(command)).type).toBe('ok');
    const removed = command.grant.credentialBindings[0];
    {
      using database = new Database(databasePath, { strict: true });
      database.run('DELETE FROM grant_bindings WHERE grant_id = ? AND slot_id = ?', [
        command.grant.id,
        removed.slotId
      ]);
    }

    expect(await journal.grants.readGrant(command.grant.id)).toEqual(expect.objectContaining({
      type: 'err',
      issues: [expect.objectContaining({ code: 'journal-corrupt' })]
    }));
  });

  it('rolls consent back when its grant conflicts inside the same transaction', async () => {
    const first = authorityFixture();
    expect((await journal.grants.commitWithConsent(first)).type).toBe('ok');
    const secondOperation = operationId('operation-enroll-2');
    const secondConsentId = unwrapJournal(parseConsentId('consent-2'));
    const conflicting = {
      operationId: secondOperation,
      consent: {
        ...first.consent,
        id: secondConsentId,
        operationId: secondOperation
      },
      grant: {
        ...first.grant,
        operationId: secondOperation,
        consentId: secondConsentId
      }
    };
    const result = await journal.grants.commitWithConsent(conflicting);
    expect(result).toEqual(expect.objectContaining({
      type: 'err',
      issues: [expect.objectContaining({ code: 'journal-conflict' })]
    }));

    using database = new Database(databasePath, { readonly: true, strict: true });
    expect(readScalar(database, 'SELECT COUNT(*) FROM consents WHERE consent_id = ?', [secondConsentId.value])).toBe(0);
  });

  it('persists only explicit redacted projections, never an arbitrary request or secret canary', async () => {
    const canary = 'SECRET_CANARY_SQLITE_MUST_NEVER_PERSIST';
    const authority = authorityFixture();
    const contaminatedInput = {
      ...authority,
      requestEnvelope: { providerToken: canary },
      consent: { ...authority.consent, pinInput: canary },
      grant: { ...authority.grant, plaintextCredential: canary }
    };
    expect((await journal.grants.commitWithConsent(contaminatedInput)).type).toBe('ok');

    const files = [databasePath, `${databasePath}-wal`, `${databasePath}-shm`].filter(existsSync);
    expect(files.length).toBeGreaterThan(0);
    files.forEach(file => expect(readFileSync(file).includes(Buffer.from(canary))).toBe(false));

    using database = new Database(databasePath, { readonly: true, strict: true });
    const schemaText = String(readScalar(
      database,
      "SELECT group_concat(sql, ' ') FROM sqlite_master WHERE sql IS NOT NULL"
    ));
    expect(schemaText).not.toMatch(/plaintext|passphrase|pin_input|request_json|secret_value|token_value/iu);
  });

  it('compares attempt state and generation transactionally before lease creation', async () => {
    const authority = authorityFixture();
    const attempt = attemptFixture(authority);
    expect((await journal.grants.commitWithConsent(authority)).type).toBe('ok');
    expect((await journal.attempts.reserve(attempt)).type).toBe('ok');

    const transition = {
      operationId: operationId('operation-attempt-transition-1'),
      attemptId: attempt.attempt.id,
      expectedState: 'reserved' as const,
      nextState: 'materializing' as const,
      atMs: 1_200,
      receiverCorrelation: unwrapJournal(parseReceiverCorrelation('pm2:attempt-1'))
    };
    const transitioned = await journal.attempts.transition(transition);
    expect(transitioned).toEqual(expect.objectContaining({
      type: 'ok',
      value: expect.objectContaining({ status: 'committed', record: expect.objectContaining({
        state: 'materializing',
        stateVersion: 2
      }) })
    }));
    expect((await journal.attempts.transition(transition))).toEqual(expect.objectContaining({
      type: 'ok',
      value: expect.objectContaining({ status: 'already-committed' })
    }));

    const stale = await journal.attempts.transition({
      ...transition,
      operationId: operationId('operation-attempt-transition-stale'),
      receiverCorrelation: transition.receiverCorrelation
    });
    expect(stale).toEqual(expect.objectContaining({
      type: 'err',
      issues: [expect.objectContaining({ code: 'journal-conflict' })]
    }));

    const leaseOperation = operationId('operation-lease-1');
    const lease = {
      id: unwrapJournal(parseLeaseJournalId('lease-1')),
      operationId: leaseOperation,
      grantId: authority.grant.id,
      grantGeneration: authority.grant.generation,
      processAttemptId: attempt.attempt.id,
      receiverId: unwrapBroker(parseReceiverId('pm2')),
      exposureCorrelation: unwrapBroker(parseSecretExposureCorrelation('lease-exposure-1')),
      issuedAtMs: 1_300,
      expiresAtMs: 5_000,
      updatedAtMs: 1_300,
      cleanupReceipt: null,
      state: 'authorized' as const
    };
    expect(await journal.leases.create({ operationId: leaseOperation, lease })).toEqual({
      type: 'ok',
      value: { status: 'committed', record: lease }
    });
    expect((await journal.leases.create({ operationId: leaseOperation, lease })).type).toBe('ok');
    expect(await journal.leases.read(lease.id)).toEqual({ type: 'ok', value: lease });

    const deliveryStart = {
      operationId: operationId('operation-lease-activate'),
      leaseId: lease.id,
      exposureCorrelation: lease.exposureCorrelation,
      expectedState: 'authorized' as const,
      nextState: 'delivering' as const,
      atMs: 1_400,
      cleanupReceipt: null
    };
    expect(await journal.leases.transition(deliveryStart)).toEqual({
      type: 'ok',
      value: { status: 'committed', record: { ...lease, state: 'delivering', updatedAtMs: 1_400 } }
    });
    expect(await journal.leases.transition(deliveryStart)).toEqual({
      type: 'ok',
      value: { status: 'already-committed', record: { ...lease, state: 'delivering', updatedAtMs: 1_400 } }
    });
    const recovery = {
      operationId: operationId('operation-lease-consume'),
      leaseId: lease.id,
      exposureCorrelation: lease.exposureCorrelation,
      expectedState: 'delivering' as const,
      nextState: 'recovery-required' as const,
      atMs: 1_500,
      cleanupReceipt: null
    };
    expect(await journal.leases.transition(recovery)).toEqual({
      type: 'ok',
      value: {
        status: 'committed',
        record: { ...lease, state: 'recovery-required', updatedAtMs: 1_500 }
      }
    });
    expect(await journal.leases.read(lease.id)).toEqual({
      type: 'ok',
      value: { ...lease, state: 'recovery-required', updatedAtMs: 1_500 }
    });

    const wrongGenerationOperation = operationId('operation-lease-wrong-generation');
    const rejected = await journal.leases.create({
      operationId: wrongGenerationOperation,
      lease: {
        ...lease,
        id: unwrapJournal(parseLeaseJournalId('lease-wrong-generation')),
        operationId: wrongGenerationOperation,
        grantGeneration: 2
      }
    });
    expect(rejected).toEqual(expect.objectContaining({
      type: 'err',
      issues: [expect.objectContaining({ code: 'journal-conflict' })]
    }));
  });

  it('lists bounded nonterminal exposure facts for an exact attempt in lease-id order', async () => {
    const firstAuthority = authorityFixture();
    const secondBase = authorityFixture('2');
    const secondAuthority: CommitGrantWithConsent = {
      ...secondBase,
      grant: { ...secondBase.grant, id: unwrapBroker(parseGrantId('grant-2')) }
    };
    const attempt = attemptFixture(firstAuthority);
    expect((await journal.grants.commitWithConsent(firstAuthority)).type).toBe('ok');
    expect((await journal.grants.commitWithConsent(secondAuthority)).type).toBe('ok');
    expect((await journal.attempts.reserve(attempt)).type).toBe('ok');
    const lease = (authority: CommitGrantWithConsent, suffix: string) => {
      const operation = operationId(`operation-list-lease-${suffix}`);
      return {
        id: unwrapJournal(parseLeaseJournalId(`list-lease-${suffix}`)),
        operationId: operation,
        grantId: authority.grant.id,
        grantGeneration: authority.grant.generation,
        processAttemptId: attempt.attempt.id,
        receiverId: unwrapBroker(parseReceiverId('list-receiver')),
        exposureCorrelation: unwrapBroker(parseSecretExposureCorrelation(`list-exposure-${suffix}`)),
        issuedAtMs: 1_300,
        expiresAtMs: 5_000,
        updatedAtMs: 1_300,
        cleanupReceipt: null,
        state: 'authorized' as const
      };
    };
    const zLease = lease(firstAuthority, 'z');
    const aLease = lease(secondAuthority, 'a');
    expect((await journal.leases.create({ operationId: zLease.operationId, lease: zLease })).type).toBe('ok');
    expect((await journal.leases.create({ operationId: aLease.operationId, lease: aLease })).type).toBe('ok');
    expect(await journal.leases.readNonterminalForAttempt(attempt.attempt.id)).toEqual({
      type: 'ok',
      value: [aLease, zLease]
    });
    expect((await journal.leases.transition({
      operationId: operationId('operation-list-revoke-z'),
      leaseId: zLease.id,
      exposureCorrelation: zLease.exposureCorrelation,
      expectedState: 'authorized',
      nextState: 'revoked',
      atMs: 1_400,
      cleanupReceipt: null
    })).type).toBe('ok');
    expect(await journal.leases.readNonterminalForAttempt(attempt.attempt.id)).toEqual({
      type: 'ok',
      value: [aLease]
    });
  });

  it('keeps legacy attempts non-bootstrapable while exact v2 claims are retry-idempotent', async () => {
    const authority = authorityFixture();
    const legacyAttempt = attemptFixture(authority);
    expect((await journal.grants.commitWithConsent(authority)).type).toBe('ok');
    expect((await journal.attempts.reserve(legacyAttempt)).type).toBe('ok');
    expect((await materializeAttempt(journal, legacyAttempt)).type).toBe('ok');

    const command = claimFixture(authority, legacyAttempt, 'legacy-rejected');
    const rejected = await journal.leases.claimAuthorized(command);
    expect(rejected).toEqual(expect.objectContaining({
      type: 'err',
      issues: [expect.objectContaining({ code: 'journal-conflict' })]
    }));

    using database = new Database(databasePath, { readonly: true, strict: true });
    expect(readScalar(database, 'SELECT COUNT(*) FROM bootstrap_lease_claims')).toBe(0);
    expect(readScalar(database, 'SELECT COUNT(*) FROM leases')).toBe(0);
  });

  it('reserves attempts unbound and binds an exact materialized process with CAS history', async () => {
    const authority = authorityFixture();
    const attempt = attemptFixture(authority);
    expect((await journal.grants.commitWithConsent(authority)).type).toBe('ok');

    const invalidReservation = {
      ...attempt,
      attempt: { ...attempt.attempt, bootstrapBinding: bootstrapBindingFixture(authority) }
    } as unknown as ReserveAttempt;
    expect(await journal.attempts.reserve(invalidReservation)).toEqual(expect.objectContaining({
      type: 'err',
      issues: [expect.objectContaining({ code: 'journal-invalid' })]
    }));

    expect((await reserveMaterializingAttempt(journal, authority, attempt)).type).toBe('ok');
    const binding = bootstrapBindFixture(authority, attempt);
    expect(await journal.attempts.bindBootstrap(binding)).toEqual(expect.objectContaining({
      type: 'ok',
      value: expect.objectContaining({
        status: 'committed',
        record: expect.objectContaining({
          state: 'materializing',
          stateVersion: 3,
          bootstrapBinding: binding.binding
        })
      })
    }));
    expect(await journal.attempts.bindBootstrap(binding)).toEqual(expect.objectContaining({
      type: 'ok',
      value: expect.objectContaining({ status: 'already-committed' })
    }));

    const stale = await journal.attempts.bindBootstrap({
      ...binding,
      operationId: operationId('operation-attempt-bind-stale')
    });
    expect(stale).toEqual(expect.objectContaining({
      type: 'err',
      issues: [expect.objectContaining({ code: 'journal-conflict' })]
    }));

    const invalidFormat = await journal.attempts.bindBootstrap({
      ...binding,
      operationId: operationId('operation-attempt-bind-invalid-format'),
      binding: { ...binding.binding, format: 'bootstrap-attempt-binding/v1' }
    } as unknown as BindBootstrapAttempt);
    expect(invalidFormat).toEqual(expect.objectContaining({
      type: 'err',
      issues: [expect.objectContaining({ code: 'journal-invalid' })]
    }));

    using database = new Database(databasePath, { readonly: true, strict: true });
    expect(readScalar(database, 'SELECT COUNT(*) FROM bootstrap_attempt_binding_events')).toBe(1);
    expect(readScalar(database, 'SELECT COUNT(*) FROM journal_operations')).toBe(4);
  });

  it('rejects a recovered rebind until its next-generation launch admission exists', async () => {
    const authority = authorityFixture();
    const attempt = attemptFixture(authority);
    expect((await journal.grants.commitWithConsent(authority)).type).toBe('ok');
    expect((await reserveMaterializingAttempt(journal, authority, attempt)).type).toBe('ok');
    expect((await bindBootstrapAttempt(journal, authority, attempt)).type).toBe('ok');

    const lease = claimFixture(authority, attempt, 'before-rebind');
    expect((await journal.leases.claimAuthorized(lease)).type).toBe('ok');
    expect((await journal.attempts.transition({
      operationId: operationId('operation-attempt-recovery-required'),
      attemptId: attempt.attempt.id,
      expectedState: 'materializing',
      nextState: 'recovery-required',
      atMs: 1_400,
      receiverCorrelation: unwrapJournal(parseReceiverCorrelation('pm2:attempt-1'))
    })).type).toBe('ok');

    const generationTwo = bootstrapBindingFixture(authority, 2, 'windows-created:9002');
    const rebind: BindBootstrapAttempt = {
      operationId: operationId('operation-attempt-rebind-2'),
      attemptId: attempt.attempt.id,
      mode: 'rebind-after-recovery',
      expectedState: 'recovery-required',
      expectedStateVersion: 4,
      priorBindingGeneration: 1,
      atMs: 5_100,
      receiverCorrelation: unwrapJournal(parseReceiverCorrelation('pm2:attempt-1:recovered')),
      binding: generationTwo
    };
    expect(await journal.attempts.bindBootstrap(rebind)).toEqual(expect.objectContaining({
      type: 'err',
      issues: [expect.objectContaining({ code: 'journal-conflict' })]
    }));

    expect(await journal.leases.transition({
      operationId: operationId('operation-expired-lease-revoke'),
      leaseId: lease.lease.id,
      exposureCorrelation: lease.lease.exposureCorrelation,
      expectedState: 'authorized',
      nextState: 'revoked',
      atMs: lease.lease.expiresAtMs,
      cleanupReceipt: null
    })).toEqual(expect.objectContaining({
      type: 'ok',
      value: expect.objectContaining({ record: expect.objectContaining({ state: 'revoked' }) })
    }));
    expect(await journal.attempts.bindBootstrap(rebind)).toEqual(expect.objectContaining({
      type: 'err',
      issues: [expect.objectContaining({ code: 'journal-conflict' })]
    }));
    using database = new Database(databasePath, { readonly: true, strict: true });
    expect(readScalar(database, 'SELECT COUNT(*) FROM attempt_launch_admissions')).toBe(1);
    expect(readScalar(database, 'SELECT COUNT(*) FROM bootstrap_attempt_binding_events')).toBe(1);
  });

  it('binds operation ids globally across journal domains without partial writes', async () => {
    const authority = authorityFixture();
    expect((await journal.grants.commitWithConsent(authority)).type).toBe('ok');
    const candidate = attemptFixture(authority);
    const crossKind: ReserveAttempt = {
      operationId: authority.operationId,
      attempt: { ...candidate.attempt, reserveOperationId: authority.operationId }
    };

    expect(await journal.attempts.reserve(crossKind)).toEqual(expect.objectContaining({
      type: 'err',
      issues: [expect.objectContaining({ code: 'journal-conflict' })]
    }));
    using database = new Database(databasePath, { readonly: true, strict: true });
    expect(readScalar(database, 'SELECT COUNT(*) FROM attempts')).toBe(0);
    expect(readScalar(database, 'SELECT COUNT(*) FROM journal_operations')).toBe(1);
  });

  it('claims against exact attempt state, version, binding, and active grant facts in one transaction', async () => {
    const authority = authorityFixture();
    const attempt = attemptFixture(authority);
    expect((await journal.grants.commitWithConsent(authority)).type).toBe('ok');
    expect((await reserveMaterializingAttempt(journal, authority, attempt)).type).toBe('ok');
    expect((await bindBootstrapAttempt(journal, authority, attempt)).type).toBe('ok');

    const command = claimFixture(authority, attempt, 'exact');
    expect(await journal.leases.claimAuthorized(command)).toEqual({
      type: 'ok',
      value: { status: 'committed', record: command.lease }
    });
    expect(await journal.leases.claimAuthorized(command)).toEqual({
      type: 'ok',
      value: { status: 'already-committed', record: command.lease }
    });

    const mismatchedRetry = await journal.leases.claimAuthorized({
      ...command,
      expectedAttempt: {
        ...command.expectedAttempt,
        binding: { ...command.expectedAttempt.binding, bindingGeneration: 2 }
      }
    });
    expect(mismatchedRetry).toEqual(expect.objectContaining({
      type: 'err',
      issues: [expect.objectContaining({ code: 'journal-conflict' })]
    }));
  });

  it('recovers the persisted lease for the same bootstrap exchange after response loss', async () => {
    const authority = authorityFixture();
    const attempt = attemptFixture(authority);
    expect((await journal.grants.commitWithConsent(authority)).type).toBe('ok');
    expect((await reserveMaterializingAttempt(journal, authority, attempt)).type).toBe('ok');
    expect((await bindBootstrapAttempt(journal, authority, attempt)).type).toBe('ok');

    const first = claimFixture(authority, attempt, 'lost-response');
    expect((await journal.leases.claimAuthorized(first)).type).toBe('ok');
    const retriedLater: ClaimAuthorizedBootstrapLease = {
      ...first,
      lease: { ...first.lease, issuedAtMs: 1_400, updatedAtMs: 1_400, expiresAtMs: 5_200 }
    };
    expect(await journal.leases.claimAuthorized(retriedLater)).toEqual({
      type: 'ok',
      value: { status: 'already-committed', record: first.lease }
    });

    const differentExchange = claimFixture(authority, attempt, 'different-exchange');
    expect(await journal.leases.claimAuthorized(differentExchange)).toEqual(expect.objectContaining({
      type: 'err',
      issues: [expect.objectContaining({ code: 'journal-conflict' })]
    }));
  });

  it('rejects stale attempt and grant drift without leaving a partial claim', async () => {
    const authority = authorityFixture();
    const attempt = attemptFixture(authority);
    expect((await journal.grants.commitWithConsent(authority)).type).toBe('ok');
    expect((await reserveMaterializingAttempt(journal, authority, attempt)).type).toBe('ok');
    expect((await bindBootstrapAttempt(journal, authority, attempt)).type).toBe('ok');
    const staleAttemptClaim = claimFixture(authority, attempt, 'stale-attempt');

    expect((await journal.attempts.transition({
      operationId: operationId('operation-attempt-running'),
      attemptId: attempt.attempt.id,
      expectedState: 'materializing',
      nextState: 'running',
      atMs: 1_250,
      receiverCorrelation: unwrapJournal(parseReceiverCorrelation('pm2:attempt-1'))
    })).type).toBe('ok');
    expect(await journal.leases.claimAuthorized(staleAttemptClaim)).toEqual(expect.objectContaining({
      type: 'err',
      issues: [expect.objectContaining({ code: 'journal-conflict' })]
    }));

    const binding = bootstrapBindingFixture(authority);
    const currentOperation = operationId('operation-bootstrap-claim-stale-grant');
    const currentClaim: ClaimAuthorizedBootstrapLease = {
      operationId: currentOperation,
      exchangeId: unwrapJournal(parseBootstrapExchangeJournalId('bootstrap-exchange-stale-grant')),
      expectedAttempt: { id: attempt.attempt.id, state: 'running', stateVersion: 4, binding },
      lease: {
        ...staleAttemptClaim.lease,
        id: unwrapJournal(parseLeaseJournalId('bootstrap-lease-stale-grant')),
        operationId: currentOperation
      }
    };
    {
      using database = new Database(databasePath, { strict: true });
      database.run(
        'UPDATE bootstrap_attempt_bindings SET binding_generation = 2 WHERE attempt_id = ?',
        [attempt.attempt.id]
      );
    }
    expect(await journal.leases.claimAuthorized(currentClaim)).toEqual(expect.objectContaining({
      type: 'err',
      issues: [expect.objectContaining({ code: 'journal-conflict' })]
    }));

    const staleGrantOperation = operationId('operation-bootstrap-claim-stale-grant-generation');
    const staleGrantClaim: ClaimAuthorizedBootstrapLease = {
      ...currentClaim,
      operationId: staleGrantOperation,
      exchangeId: unwrapJournal(parseBootstrapExchangeJournalId('bootstrap-exchange-stale-grant-generation')),
      lease: {
        ...currentClaim.lease,
        id: unwrapJournal(parseLeaseJournalId('bootstrap-lease-stale-grant-generation')),
        operationId: staleGrantOperation
      }
    };
    {
      using database = new Database(databasePath, { strict: true });
      database.run(
        'UPDATE bootstrap_attempt_bindings SET binding_generation = 1 WHERE attempt_id = ?',
        [attempt.attempt.id]
      );
      database.run('UPDATE grants SET generation = 2 WHERE grant_id = ?', [authority.grant.id]);
    }
    expect(await journal.leases.claimAuthorized(staleGrantClaim)).toEqual(expect.objectContaining({
      type: 'err',
      issues: [expect.objectContaining({ code: 'journal-conflict' })]
    }));
    using database = new Database(databasePath, { readonly: true, strict: true });
    expect(readScalar(database, 'SELECT COUNT(*) FROM bootstrap_lease_claims')).toBe(0);
    expect(readScalar(database, 'SELECT COUNT(*) FROM leases')).toBe(0);
  });

  it('serializes independent claimers and permits a new lease only after terminal reuse', async () => {
    const authority = authorityFixture();
    const attempt = attemptFixture(authority);
    expect((await journal.grants.commitWithConsent(authority)).type).toBe('ok');
    expect((await reserveMaterializingAttempt(journal, authority, attempt)).type).toBe('ok');
    expect((await bindBootstrapAttempt(journal, authority, attempt)).type).toBe('ok');

    const competingJournal = createBunSqliteAuthorityJournal({
      profilePath: createTestOnlyProfilePathPort(databasePath),
      applicationVersion: 'test-build-1',
      busyTimeoutMs: 50,
      clock: { nowMs: () => 100 }
    });
    const first = claimFixture(authority, attempt, 'race-a');
    const second = claimFixture(authority, attempt, 'race-b');
    const outcomes = await Promise.all([
      journal.leases.claimAuthorized(first),
      competingJournal.leases.claimAuthorized(second)
    ]);
    expect(outcomes.filter(outcome => outcome.type === 'ok')).toHaveLength(1);
    const winner = outcomes[0]?.type === 'ok' ? first : second;
    const loser = winner === first ? second : first;
    expect(await journal.leases.claimAuthorized(loser)).toEqual(expect.objectContaining({
      type: 'err',
      issues: [expect.objectContaining({ code: 'journal-conflict' })]
    }));

    expect((await journal.leases.transition({
      operationId: operationId('operation-race-activate'),
      leaseId: winner.lease.id,
      exposureCorrelation: winner.lease.exposureCorrelation,
      expectedState: 'authorized',
      nextState: 'delivering',
      atMs: 1_400,
      cleanupReceipt: null
    })).type).toBe('ok');
    expect((await journal.leases.transition({
      operationId: operationId('operation-race-consume'),
      leaseId: winner.lease.id,
      exposureCorrelation: winner.lease.exposureCorrelation,
      expectedState: 'delivering',
      nextState: 'exposed',
      atMs: 1_500,
      cleanupReceipt: null
    })).type).toBe('ok');

    expect(await journal.leases.claimAuthorized(loser)).toEqual(expect.objectContaining({
      type: 'err',
      issues: [expect.objectContaining({ code: 'journal-conflict' })]
    }));
    expect((await journal.leases.transition({
      operationId: operationId('operation-race-request-closure'),
      leaseId: winner.lease.id,
      exposureCorrelation: winner.lease.exposureCorrelation,
      expectedState: 'exposed',
      nextState: 'closure-required',
      atMs: 1_600,
      cleanupReceipt: null
    })).type).toBe('ok');
    const cleanupReceipt = {
      format: 'secret-exposure-cleanup-receipt/v1' as const,
      id: unwrapBroker(parseSecretExposureCleanupReceiptId('operation-race-cleanup-receipt')),
      exposureCorrelation: winner.lease.exposureCorrelation,
      receiverId: winner.lease.receiverId,
      processAttemptId: winner.lease.processAttemptId,
      proof: 'exact-tree-empty' as const,
      observedAtMs: 1_700
    };
    expect((await journal.leases.transition({
      operationId: operationId('operation-race-close'),
      leaseId: winner.lease.id,
      exposureCorrelation: winner.lease.exposureCorrelation,
      expectedState: 'closure-required',
      nextState: 'closed',
      atMs: 1_700,
      cleanupReceipt
    })).type).toBe('ok');

    const reused = claimFixture(authority, attempt, 'terminal-reuse');
    expect(await competingJournal.leases.claimAuthorized(reused)).toEqual({
      type: 'ok',
      value: { status: 'committed', record: reused.lease }
    });
    expect(await journal.leases.claimAuthorized(winner)).toEqual({
      type: 'ok',
      value: {
        status: 'already-committed',
        record: {
          ...winner.lease,
          state: 'closed',
          updatedAtMs: 1_700,
          cleanupReceipt
        }
      }
    });

    using database = new Database(databasePath, { readonly: true, strict: true });
    expect(readScalar(
      database,
      `SELECT COUNT(*) FROM leases WHERE state IN (
        'authorized', 'delivering', 'exposed', 'closure-required', 'recovery-required'
      )`
    )).toBe(1);
  });

  it('makes encrypted-cartridge transfer consumption replay-safe and idempotent', async () => {
    const authority = authorityFixture();
    expect((await journal.grants.commitWithConsent(authority)).type).toBe('ok');
    const transferOperation = operationId('operation-transfer-1');
    const transfer = {
      id: unwrapJournal(parseTransferId('transfer-1')),
      operationId: transferOperation,
      destinationGrantId: authority.grant.id,
      issuedAtMs: 500,
      expiresAtMs: 9_000,
      consumedAtMs: 1_500,
      state: 'consumed' as const
    };
    expect(await journal.transfers.consume({ operationId: transferOperation, transfer })).toEqual({
      type: 'ok',
      value: { status: 'committed', record: transfer }
    });
    expect(await journal.transfers.consume({ operationId: transferOperation, transfer })).toEqual({
      type: 'ok',
      value: { status: 'already-committed', record: transfer }
    });

    const replayOperation = operationId('operation-transfer-replay');
    const replay = await journal.transfers.consume({
      operationId: replayOperation,
      transfer: { ...transfer, operationId: replayOperation }
    });
    expect(replay).toEqual(expect.objectContaining({
      type: 'err',
      issues: [expect.objectContaining({ code: 'transfer-replayed' })]
    }));
    expect(await journal.transfers.read(transfer.id)).toEqual({ type: 'ok', value: transfer });
  });

  it('migrates v4 exposure history conservatively without inventing closure', async () => {
    const authority = authorityFixture();
    expect((await journal.grants.commitWithConsent(authority)).type).toBe('ok');
    const attempt = (suffix: string): ReserveAttempt => {
      const base = attemptFixture(authority);
      const reserveOperation = operationId(`operation-v4-attempt-${suffix}`);
      return {
        operationId: reserveOperation,
        attempt: {
          ...base.attempt,
          id: unwrapBroker(parseProcessAttemptId(`v4-attempt-${suffix}`)),
          reserveOperationId: reserveOperation
        }
      };
    };
    const cases = ['authorized', 'active', 'consumed', 'ambiguous-revoked', 'proven-revoked'] as const;
    const attempts = cases.map(attempt);
    for (const candidate of attempts) expect((await journal.attempts.reserve(candidate)).type).toBe('ok');
    const leases = attempts.map((candidate, index) => {
      const suffix = cases[index] ?? 'missing';
      const createOperation = operationId(`operation-v4-lease-${suffix}`);
      return {
        id: unwrapJournal(parseLeaseJournalId(`v4-lease-${suffix}`)),
        operationId: createOperation,
        grantId: authority.grant.id,
        grantGeneration: authority.grant.generation,
        processAttemptId: candidate.attempt.id,
        receiverId: unwrapBroker(parseReceiverId(`v4-receiver-${suffix}`)),
        exposureCorrelation: unwrapBroker(parseSecretExposureCorrelation(`v4-exposure-${suffix}`)),
        issuedAtMs: 1_300,
        expiresAtMs: 5_000,
        updatedAtMs: 1_300,
        cleanupReceipt: null,
        state: 'authorized' as const
      };
    });
    for (const lease of leases) {
      expect((await journal.leases.create({ operationId: lease.operationId, lease })).type).toBe('ok');
    }
    {
      using database = new Database(databasePath, { strict: true });
      downgradeCurrentSchemaToV4(database);
      const addLegacyTransition = (
        leaseId: string,
        suffix: string,
        expectedState: 'authorized' | 'active',
        nextState: 'active' | 'consumed' | 'revoked',
        atMs: number
      ): void => {
        const transitionOperation = `operation-v4-transition-${suffix}`;
        database.run(`INSERT INTO journal_operations (
            operation_id, operation_kind, subject_identity, registered_at_ms
          ) VALUES (?, 'transition-lease', ?, ?)`, [transitionOperation, leaseId, atMs]);
        database.run(`INSERT INTO lease_transitions (
            operation_id, lease_id, expected_state, next_state, at_ms
          ) VALUES (?, ?, ?, ?, ?)`, [transitionOperation, leaseId, expectedState, nextState, atMs]);
      };
      const active = leases[1];
      const consumed = leases[2];
      const ambiguousRevoked = leases[3];
      const provenRevoked = leases[4];
      if (active === undefined || consumed === undefined || ambiguousRevoked === undefined ||
          provenRevoked === undefined) throw new Error('expected complete v4 migration fixtures');
      database.run("UPDATE leases SET state = 'active' WHERE lease_id = ?", [active.id.value]);
      addLegacyTransition(active.id.value, 'active-begin', 'authorized', 'active', 1_400);
      database.run("UPDATE leases SET state = 'consumed', terminated_at_ms = 1500 WHERE lease_id = ?", [
        consumed.id.value
      ]);
      addLegacyTransition(consumed.id.value, 'consumed-begin', 'authorized', 'active', 1_400);
      addLegacyTransition(consumed.id.value, 'consumed-end', 'active', 'consumed', 1_500);
      database.run("UPDATE leases SET state = 'revoked', terminated_at_ms = 1500 WHERE lease_id = ?", [
        ambiguousRevoked.id.value
      ]);
      addLegacyTransition(ambiguousRevoked.id.value, 'ambiguous-begin', 'authorized', 'active', 1_400);
      addLegacyTransition(ambiguousRevoked.id.value, 'ambiguous-end', 'active', 'revoked', 1_500);
      database.run("UPDATE leases SET state = 'revoked', terminated_at_ms = 1400 WHERE lease_id = ?", [
        provenRevoked.id.value
      ]);
      addLegacyTransition(provenRevoked.id.value, 'proven-revoke', 'authorized', 'revoked', 1_400);
    }

    const expectedStates = [
      'authorized',
      'recovery-required',
      'recovery-required',
      'recovery-required',
      'revoked'
    ] as const;
    for (const [index, lease] of leases.entries()) {
      expect(await journal.leases.read(lease.id)).toEqual(expect.objectContaining({
        type: 'ok',
        value: expect.objectContaining({
          state: expectedStates[index],
          cleanupReceipt: null,
          exposureCorrelation: expect.objectContaining({ value: lease.id.value })
        })
      }));
    }
    using database = new Database(databasePath, { readonly: true, strict: true });
    expect(readScalar(database, 'PRAGMA user_version')).toBe(5);
    expect(readScalar(database, "SELECT COUNT(*) FROM leases WHERE state IN ('active', 'consumed')")).toBe(0);
    expect(readScalar(database, "SELECT COUNT(*) FROM leases WHERE state = 'closed'")).toBe(0);
  });

  it('migrates v3 without inventing launch admission for a legacy attempt', async () => {
    const authority = authorityFixture();
    const legacyAttempt = attemptFixture(authority);
    expect((await journal.grants.commitWithConsent(authority)).type).toBe('ok');
    expect((await journal.attempts.reserve(legacyAttempt)).type).toBe('ok');
    {
      using database = new Database(databasePath, { strict: true });
      downgradeCurrentSchemaToV3(database);
      expect(readScalar(database, 'PRAGMA user_version')).toBe(3);
      expect(readScalar(database, 'SELECT COUNT(*) FROM schema_migrations')).toBe(3);
    }

    expect(await journal.attempts.readGrantQualifiedMaterializing(legacyAttempt.attempt.id)).toEqual({
      type: 'ok',
      value: null
    });
    using database = new Database(databasePath, { readonly: true, strict: true });
    expect(readScalar(database, 'PRAGMA user_version')).toBe(5);
    expect(readScalar(database, 'SELECT COUNT(*) FROM schema_migrations')).toBe(5);
    expect(readScalar(database, 'SELECT COUNT(*) FROM attempt_launch_admissions')).toBe(0);
    expect(readScalar(database, 'SELECT COUNT(*) FROM attempt_launch_admission_slots')).toBe(0);
  });

  it('migrates a v2 one-slot grant losslessly and preserves active authority', async () => {
    const authority = authorityFixture();
    expect((await journal.grants.commitWithConsent(authority)).type).toBe('ok');
    {
      using database = new Database(databasePath, { strict: true });
      downgradeCurrentSchemaToV2(database);
      expect(readScalar(database, 'PRAGMA user_version')).toBe(2);
      expect(readScalar(database, 'SELECT COUNT(*) FROM schema_migrations')).toBe(2);
    }

    expect(await journal.grants.readGrant(authority.grant.id)).toEqual({ type: 'ok', value: authority.grant });
    using database = new Database(databasePath, { readonly: true, strict: true });
    expect(readScalar(database, 'PRAGMA user_version')).toBe(5);
    expect(readScalar(database, 'SELECT COUNT(*) FROM schema_migrations')).toBe(5);
    expect(readScalar(database, 'SELECT COUNT(*) FROM grant_bindings')).toBe(1);
    expect(readScalar(database, 'SELECT COUNT(DISTINCT credential_reference) FROM grant_bindings')).toBe(1);
  });

  it('atomically revokes an ambiguous active v2 multi-slot grant before populating audit bindings', async () => {
    const authority = twoSlotAuthorityFixture(true);
    expect((await journal.grants.commitWithConsent(authority)).type).toBe('ok');
    {
      using database = new Database(databasePath, { strict: true });
      downgradeCurrentSchemaToV2(database);
    }

    expect(await journal.grants.readGrant(authority.grant.id)).toEqual({
      type: 'ok',
      value: { ...authority.grant, state: 'revoked' }
    });
    expect(await journal.grants.commitWithConsent(authority)).toEqual(expect.objectContaining({
      type: 'err',
      issues: [expect.objectContaining({ code: 'journal-conflict' })]
    }));
    using database = new Database(databasePath, { readonly: true, strict: true });
    expect(readScalar(database, 'PRAGMA user_version')).toBe(5);
    expect(readScalar(database, 'SELECT state FROM grants WHERE grant_id = ?', [authority.grant.id])).toBe('revoked');
    expect(readScalar(database, 'SELECT COUNT(*) FROM grant_bindings')).toBe(2);
  });

  it('fails closed when a v2 grant has no complete legacy slot projection', async () => {
    const authority = twoSlotAuthorityFixture(true);
    expect((await journal.grants.commitWithConsent(authority)).type).toBe('ok');
    {
      using database = new Database(databasePath, { strict: true });
      downgradeCurrentSchemaToV2(database);
      database.run('DELETE FROM grant_slots WHERE grant_id = ? AND slot_id = ?', [
        authority.grant.id,
        authority.grant.credentialBindings[1]?.slotId ?? ''
      ]);
    }

    expect(await journal.grants.readGrant(authority.grant.id)).toEqual(expect.objectContaining({
      type: 'err',
      issues: [expect.objectContaining({ code: 'journal-recovery-required' })]
    }));
    using database = new Database(databasePath, { readonly: true, strict: true });
    expect(readScalar(database, 'PRAGMA user_version')).toBe(2);
    expect(readScalar(
      database,
      "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'grant_bindings'"
    )).toBe(0);
  });

  it('migrates v1 monotonically while legacy attempts remain explicitly unbound', async () => {
    const authority = authorityFixture();
    const legacyAttempt = attemptFixture(authority);
    expect((await journal.grants.commitWithConsent(authority)).type).toBe('ok');
    expect((await journal.attempts.reserve(legacyAttempt)).type).toBe('ok');
    {
      using database = new Database(databasePath, { strict: true });
      downgradeCurrentSchemaToV1(database);
      expect(readScalar(database, 'PRAGMA user_version')).toBe(1);
      expect(readScalar(database, 'SELECT COUNT(*) FROM schema_migrations')).toBe(1);
    }

    expect(await journal.attempts.read(legacyAttempt.attempt.id)).toEqual({
      type: 'ok',
      value: legacyAttempt.attempt
    });
    expect(await journal.grants.readGrant(authority.grant.id)).toEqual({ type: 'ok', value: authority.grant });
    using database = new Database(databasePath, { readonly: true, strict: true });
    expect(readScalar(database, 'PRAGMA user_version')).toBe(5);
    expect(readScalar(database, 'SELECT COUNT(*) FROM schema_migrations')).toBe(5);
    expect(readScalar(database, 'SELECT COUNT(*) FROM bootstrap_attempt_bindings')).toBe(0);
    expect(readScalar(database, 'SELECT COUNT(*) FROM grant_bindings')).toBe(1);
  });

  it('rolls the v2 migration back when legacy nonterminal leases violate its unique invariant', async () => {
    const authority = authorityFixture();
    const legacyAttempt = attemptFixture(authority);
    expect((await journal.grants.commitWithConsent(authority)).type).toBe('ok');
    expect((await journal.attempts.reserve(legacyAttempt)).type).toBe('ok');
    const leaseOperation = operationId('operation-legacy-lease-1');
    const lease = {
      id: unwrapJournal(parseLeaseJournalId('legacy-lease-1')),
      operationId: leaseOperation,
      grantId: authority.grant.id,
      grantGeneration: authority.grant.generation,
      processAttemptId: legacyAttempt.attempt.id,
      receiverId: unwrapBroker(parseReceiverId('legacy-receiver')),
      exposureCorrelation: unwrapBroker(parseSecretExposureCorrelation('legacy-exposure-1')),
      issuedAtMs: 1_300,
      expiresAtMs: 5_000,
      updatedAtMs: 1_300,
      cleanupReceipt: null,
      state: 'authorized' as const
    };
    expect((await journal.leases.create({ operationId: leaseOperation, lease })).type).toBe('ok');
    {
      using database = new Database(databasePath, { strict: true });
      downgradeCurrentSchemaToV1(database);
      database.run(`INSERT INTO leases (
          lease_id, operation_id, grant_id, grant_generation, process_attempt_id,
          issued_at_ms, expires_at_ms, terminated_at_ms, state
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
        'legacy-lease-duplicate',
        'operation-legacy-lease-duplicate',
        authority.grant.id,
        authority.grant.generation,
        legacyAttempt.attempt.id,
        1_301,
        5_000,
        null,
        'authorized'
      ]);
    }

    expect(await journal.grants.readGrant(authority.grant.id)).toEqual(expect.objectContaining({
      type: 'err',
      issues: [expect.objectContaining({ code: 'journal-recovery-required' })]
    }));
    using database = new Database(databasePath, { readonly: true, strict: true });
    expect(readScalar(database, 'PRAGMA user_version')).toBe(1);
    expect(readScalar(database, 'SELECT COUNT(*) FROM schema_migrations')).toBe(1);
    expect(readScalar(
      database,
      "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'bootstrap_attempt_bindings'"
    )).toBe(0);
  });

  it('refuses a legacy cross-domain operation collision before applying any v2 DDL', async () => {
    const authority = authorityFixture();
    const attempt = attemptFixture(authority);
    expect((await journal.grants.commitWithConsent(authority)).type).toBe('ok');
    expect((await journal.attempts.reserve(attempt)).type).toBe('ok');
    {
      using database = new Database(databasePath, { strict: true });
      downgradeCurrentSchemaToV1(database);
      database.run('UPDATE attempts SET reserve_operation_id = ? WHERE attempt_id = ?', [
        authority.operationId.value,
        attempt.attempt.id
      ]);
    }

    expect(await journal.attempts.read(attempt.attempt.id)).toEqual(expect.objectContaining({
      type: 'err',
      issues: [expect.objectContaining({ code: 'journal-recovery-required' })]
    }));
    using database = new Database(databasePath, { readonly: true, strict: true });
    expect(readScalar(database, 'PRAGMA user_version')).toBe(1);
    expect(readScalar(database, 'SELECT COUNT(*) FROM schema_migrations')).toBe(1);
    expect(readScalar(
      database,
      "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'journal_operations'"
    )).toBe(0);
  });

  it('verifies the canonical partial unique index rather than trusting migration metadata', async () => {
    const missingGrant = unwrapBroker(parseGrantId('missing-grant'));
    expect((await journal.grants.readGrant(missingGrant)).type).toBe('ok');
    {
      using database = new Database(databasePath, { strict: true });
      database.run('DROP INDEX leases_one_nonterminal_per_grant_attempt');
    }
    expect(await journal.grants.readGrant(missingGrant)).toEqual(expect.objectContaining({
      type: 'err',
      issues: [expect.objectContaining({ code: 'journal-recovery-required' })]
    }));

    {
      using database = new Database(databasePath, { strict: true });
      database.run(`CREATE UNIQUE INDEX leases_one_nonterminal_per_grant_attempt
        ON leases (lease_id)
        WHERE state IN ('authorized', 'delivering', 'exposed', 'closure-required', 'recovery-required')`);
    }
    expect(await journal.grants.readGrant(missingGrant)).toEqual(expect.objectContaining({
      type: 'err',
      issues: [expect.objectContaining({ code: 'journal-recovery-required' })]
    }));
  });

  it('fails closed on newer schemas and migration checksum drift', async () => {
    const missingGrant = unwrapBroker(parseGrantId('missing-grant'));
    expect((await journal.grants.readGrant(missingGrant)).type).toBe('ok');
    {
      using database = new Database(databasePath, { strict: true });
      database.run('PRAGMA user_version = 6');
    }
    const newer = await journal.grants.readGrant(missingGrant);
    expect(newer).toEqual(expect.objectContaining({
      type: 'err',
      issues: [expect.objectContaining({ code: 'journal-schema-newer' })]
    }));

    {
      using database = new Database(databasePath, { strict: true });
      database.run('PRAGMA user_version = 5');
      database.run("UPDATE schema_migrations SET checksum = 'tampered' WHERE version = 5");
    }
    const tampered = await journal.grants.readGrant(missingGrant);
    expect(tampered).toEqual(expect.objectContaining({
      type: 'err',
      issues: [expect.objectContaining({ code: 'journal-recovery-required' })]
    }));
  });

  it('decodes corrupt rows to a typed fail-closed result', async () => {
    const authority = authorityFixture();
    const attempt = attemptFixture(authority);
    expect((await journal.grants.commitWithConsent(authority)).type).toBe('ok');
    expect((await journal.attempts.reserve(attempt)).type).toBe('ok');
    {
      using database = new Database(databasePath, { strict: true });
      database.run('PRAGMA ignore_check_constraints = ON');
      database.run("UPDATE attempts SET state = 'impossible-state' WHERE attempt_id = ?", [attempt.attempt.id]);
    }
    const result = await journal.attempts.read(attempt.attempt.id);
    expect(result).toEqual(expect.objectContaining({
      type: 'err',
      issues: [expect.objectContaining({ code: 'journal-corrupt' })]
    }));
  });

  it('maps lock contention to a bounded busy outcome', async () => {
    const authority = authorityFixture();
    expect((await journal.grants.commitWithConsent(authority)).type).toBe('ok');
    using blocker = new Database(databasePath, { strict: true });
    blocker.run('PRAGMA busy_timeout = 50');
    blocker.run('BEGIN IMMEDIATE');
    const startedAt = performance.now();
    const result = await journal.attempts.reserve(attemptFixture(authority));
    const elapsedMs = performance.now() - startedAt;
    blocker.run('ROLLBACK');

    expect(result).toEqual(expect.objectContaining({
      type: 'err',
      issues: [expect.objectContaining({ code: 'journal-busy' })]
    }));
    expect(elapsedMs).toBeLessThan(1_000);
  });

  it('finalizes statements and closes every short-lived connection', async () => {
    expect((await journal.grants.readGrant(unwrapBroker(parseGrantId('missing-grant')))).type).toBe('ok');
    const movedPath = join(temporaryRoot, 'moved.sqlite3');
    renameSync(databasePath, movedPath);
    renameSync(movedPath, databasePath);
    expect(existsSync(databasePath)).toBe(true);
  });

  it('derives the production path only from a trusted current-user root port', async () => {
    const root = 'C:\\Users\\developer\\AppData\\Local';
    const port = createWindowsProfilePathPort({
      resolveCurrentUserRoot: () => Promise.resolve(journalOk({ kind: 'trusted-profile-root', value: root }))
    });
    const resolved = await port.resolveAuthorityDatabasePath();
    expect(resolved).toEqual({
      type: 'ok',
      value: {
        kind: 'authority-database-path',
        value: join(root, 'epsilonode', 'nebular', 'broker', 'v1', 'authority.sqlite3')
      }
    });

    const invalid = await createTestOnlyProfilePathPort('relative\\broker.sqlite3')
      .resolveAuthorityDatabasePath();
    expect(invalid).toEqual(expect.objectContaining({
      type: 'err',
      issues: [expect.objectContaining({ code: 'journal-invalid' })]
    }));
  });
});
