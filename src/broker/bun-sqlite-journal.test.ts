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
  parseConsentId,
  parseJournalOperationId,
  parseLeaseJournalId,
  parseReceiverCorrelation,
  parseRedactedAuthorityDigest,
  parseRedactedPlanDigest,
  parseTransferId,
  type AuthorityJournal,
  type CommitGrantWithConsent,
  type JournalResult,
  type ReserveAttempt
} from './journal.ts';
import { parseCredentialReference } from './lease.ts';
import {
  parseCanonicalRepository,
  parseCredentialSlotId,
  parseGrantId,
  parseProcessAttemptId,
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
      credentialReference: unwrapBroker(parseCredentialReference('credential-reference-1')),
      credentialSlotIds: [slot],
      consentId,
      generation: 1,
      issuedAtMs: 1_000,
      expiresAtMs: 10_000,
      state: 'active'
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
      planDigest: unwrapJournal(parseRedactedPlanDigest('sha256:redacted-plan')),
      lifecycle: 'one-shot',
      receiverCorrelation: null,
      state: 'reserved',
      stateVersion: 1,
      createdAtMs: 1_100,
      updatedAtMs: 1_100
    }
  };
};

const readScalar = (database: Database, sql: string, bindings: readonly (string | number)[] = []): unknown => {
  using statement = database.prepare<unknown, (string | number)[]>(sql);
  const row = statement.get(...bindings);
  if (typeof row !== 'object' || row === null || Array.isArray(row)) return undefined;
  return Object.values(row)[0];
};

describe('Bun SQLite nonsecret authority journal', () => {
  let temporaryRoot = '';
  let databasePath = '';
  let journal: AuthorityJournal;

  beforeEach(() => {
    temporaryRoot = mkdtempSync(join(tmpdir(), 'nebular-journal-'));
    databasePath = join(temporaryRoot, 'broker.sqlite3');
    journal = createBunSqliteAuthorityJournal({
      profilePath: createTestOnlyProfilePathPort(databasePath),
      applicationVersion: 'test-build-1',
      busyTimeoutMs: 50,
      clock: { nowMs: () => 100 }
    });
  });

  afterEach(() => {
    rmSync(temporaryRoot, { recursive: true, force: true });
  });

  it('creates schema v1 and atomically commits consent with its grant', async () => {
    const command = authorityFixture();
    const committed = await journal.grants.commitWithConsent(command);
    expect(committed).toEqual({ type: 'ok', value: { status: 'committed', record: command.grant } });

    const retried = await journal.grants.commitWithConsent(command);
    expect(retried).toEqual({ type: 'ok', value: { status: 'already-committed', record: command.grant } });
    expect(await journal.grants.readConsent(command.consent.id)).toEqual({ type: 'ok', value: command.consent });
    expect(await journal.grants.readGrant(command.grant.id)).toEqual({ type: 'ok', value: command.grant });

    using database = new Database(databasePath, { readonly: true, strict: true });
    expect(readScalar(database, 'PRAGMA user_version')).toBe(1);
    expect(readScalar(database, 'SELECT COUNT(*) FROM schema_migrations')).toBe(1);
    expect(readScalar(database, 'SELECT application_version FROM schema_migrations WHERE version = 1'))
      .toBe('test-build-1');
    expect(readScalar(database, 'SELECT length(checksum) FROM schema_migrations WHERE version = 1')).toBe(64);
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
      issuedAtMs: 1_300,
      expiresAtMs: 5_000,
      terminatedAtMs: null,
      state: 'authorized' as const
    };
    expect(await journal.leases.create({ operationId: leaseOperation, lease })).toEqual({
      type: 'ok',
      value: { status: 'committed', record: lease }
    });
    expect((await journal.leases.create({ operationId: leaseOperation, lease })).type).toBe('ok');
    expect(await journal.leases.read(lease.id)).toEqual({ type: 'ok', value: lease });

    const activation = {
      operationId: operationId('operation-lease-activate'),
      leaseId: lease.id,
      expectedState: 'authorized' as const,
      nextState: 'active' as const,
      atMs: 1_400
    };
    expect(await journal.leases.transition(activation)).toEqual({
      type: 'ok',
      value: { status: 'committed', record: { ...lease, state: 'active' } }
    });
    expect(await journal.leases.transition(activation)).toEqual({
      type: 'ok',
      value: { status: 'already-committed', record: { ...lease, state: 'active' } }
    });
    const consumption = {
      operationId: operationId('operation-lease-consume'),
      leaseId: lease.id,
      expectedState: 'active' as const,
      nextState: 'consumed' as const,
      atMs: 1_500
    };
    expect(await journal.leases.transition(consumption)).toEqual({
      type: 'ok',
      value: {
        status: 'committed',
        record: { ...lease, state: 'consumed', terminatedAtMs: 1_500 }
      }
    });
    expect(await journal.leases.read(lease.id)).toEqual({
      type: 'ok',
      value: { ...lease, state: 'consumed', terminatedAtMs: 1_500 }
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

  it('fails closed on newer schemas and migration checksum drift', async () => {
    const missingGrant = unwrapBroker(parseGrantId('missing-grant'));
    expect((await journal.grants.readGrant(missingGrant)).type).toBe('ok');
    {
      using database = new Database(databasePath, { strict: true });
      database.run('PRAGMA user_version = 2');
    }
    const newer = await journal.grants.readGrant(missingGrant);
    expect(newer).toEqual(expect.objectContaining({
      type: 'err',
      issues: [expect.objectContaining({ code: 'journal-schema-newer' })]
    }));

    {
      using database = new Database(databasePath, { strict: true });
      database.run('PRAGMA user_version = 1');
      database.run("UPDATE schema_migrations SET checksum = 'tampered'");
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
        value: join(root, 'wx-teleport-cartridge', 'broker', 'v1', 'broker.sqlite3')
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
