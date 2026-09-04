import { createHash } from 'node:crypto';
import { lstatSync, mkdirSync } from 'node:fs';
import { dirname, isAbsolute, join, normalize } from 'node:path';

import type { Database, SQLQueryBindings } from 'bun:sqlite';

import {
  parseCredentialReference,
  parseSecretExposureCleanupReceiptId,
  parseSecretExposureCorrelation,
  type CredentialReference,
  type SecretExposureCleanupReceipt,
  type SecretExposureCorrelation
} from './lease.ts';
import {
  andThenJournalResult,
  journalErr,
  journalOk,
  mapJournalResult,
  isAttemptTransitionAllowed,
  parseBootstrapExchangeJournalId,
  parseConsentId,
  parseCheckedInRecipeLocator,
  parseDurableWindowsNamedJobIdentity,
  parseJournalOperationId,
  parseLeaseJournalId,
  parseProcessIncarnation,
  parseReceiverCorrelation,
  parseReceiverEntryIdentity,
  parseRedactedAuthorityDigest,
  parseRedactedPlanDigest,
  parseTransferId,
  validateAttemptReservation,
  validateAttemptTransition,
  validateGrantQualifiedMaterializingAttempt,
  validateBootstrapAttemptBind,
  validateBootstrapLeaseClaim,
  validateGrantWithConsent,
  validateLeaseCreation,
  validateLeaseTransition,
  validateTransferConsumption,
  validateVerifiedWindowsContainmentBind,
  validateVerifiedWindowsTerminalCleanupFinalization,
  type AttemptJournalRecord,
  type AttemptJournalState,
  type AuthorityDatabasePath,
  type AuthorityJournal,
  type BindBootstrapAttempt,
  type BindVerifiedWindowsContainmentAndStart,
  type BootstrapAttemptBinding,
  type BootstrapAttemptJournalRecord,
  type BootstrapExchangeJournalId,
  type ClaimAuthorizedBootstrapLease,
  type CommitGrantWithConsent,
  type ConsentEvidenceRecord,
  type ConsentId,
  type ConsumeTransfer,
  type CreateLease,
  type GrantCredentialBinding,
  type GrantCredentialBindingSet,
  type GrantQualifiedMaterializingAttemptRecord,
  type GrantQualifiedContainedAttemptRecord,
  type GrantQualifiedOneShotLaunchAdmission,
  type GrantJournalRecord,
  type JournalOperationId,
  type JournalMutation,
  type JournalOperationKind,
  type JournalOperationRecord,
  type JournalResult,
  type LeaseJournalId,
  type LeaseJournalRecord,
  type LifecycleKind,
  type ProfilePathPort,
  type ReceiverCorrelation,
  type ReserveGrantQualifiedMaterializingAttempt,
  type ReserveAttempt,
  type TransferId,
  type TransferReplayRecord,
  type TransitionAttempt,
  type TransitionLease,
  type TrustedLocalApplicationDataPort,
  type VerifiedWindowsAttemptContainmentBinding,
  type VerifiedWindowsTerminalCleanupRecord,
  type FinalizeVerifiedWindowsTerminalCleanup
} from './journal.ts';
import {
  parseCanonicalRepository,
  parseCredentialSlotId,
  parseGrantId,
  parseProcessAttemptId,
  parseReceiverId,
  parseRecipeRevision,
  type CanonicalRepository,
  type CredentialSlotId,
  type GrantId,
  type ProcessAttemptId,
  type ReceiverId,
  type RecipeRevision
} from './primitives.ts';

const CURRENT_SCHEMA_VERSION = 6;
const DEFAULT_BUSY_TIMEOUT_MS = 250;
const MAXIMUM_BUSY_TIMEOUT_MS = 5_000;
const MAXIMUM_NONTERMINAL_LEASES_PER_ATTEMPT = 256;
const AUTHORITY_DATABASE_SUFFIX = ['epsilonode', 'nebular', 'broker', 'v1', 'authority.sqlite3'] as const;

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

const JOURNAL_OPERATION_KINDS = [
  'commit-grant-with-consent',
  'reserve-attempt',
  'bind-bootstrap-attempt',
  'transition-attempt',
  'create-lease',
  'claim-bootstrap-lease',
  'transition-lease',
  'consume-transfer'
] as const satisfies readonly JournalOperationKind[];

const LEGACY_OPERATION_PROJECTION_SQL = `SELECT operation_id, 'commit-grant-with-consent' AS operation_kind,
    grant_id AS subject_identity, issued_at_ms AS registered_at_ms FROM grants
  UNION ALL SELECT reserve_operation_id, 'reserve-attempt', attempt_id, created_at_ms FROM attempts
  UNION ALL SELECT operation_id, 'transition-attempt', attempt_id, at_ms FROM attempt_transitions
  UNION ALL SELECT operation_id, 'create-lease', lease_id, issued_at_ms FROM leases
  UNION ALL SELECT operation_id, 'transition-lease', lease_id, at_ms FROM lease_transitions
  UNION ALL SELECT operation_id, 'consume-transfer', transfer_id, consumed_at_ms FROM transfer_replays`;

const SEED_V1_OPERATIONS_STATEMENT = `INSERT INTO journal_operations (
    operation_id, operation_kind, subject_identity, registered_at_ms
  ) ${LEGACY_OPERATION_PROJECTION_SQL}`;

const SCHEMA_V2_SCHEMA_STATEMENTS = [
  `CREATE TABLE journal_operations (
    operation_id TEXT PRIMARY KEY,
    operation_kind TEXT NOT NULL CHECK (operation_kind IN (
      'commit-grant-with-consent', 'reserve-attempt', 'bind-bootstrap-attempt', 'transition-attempt',
      'create-lease', 'claim-bootstrap-lease', 'transition-lease', 'consume-transfer'
    )),
    subject_identity TEXT NOT NULL,
    registered_at_ms INTEGER NOT NULL CHECK (registered_at_ms >= 0)
  ) STRICT`,
  `CREATE TABLE bootstrap_attempt_bindings (
    attempt_id TEXT PRIMARY KEY REFERENCES attempts(attempt_id) ON DELETE RESTRICT,
    binding_format TEXT NOT NULL CHECK (binding_format = 'bootstrap-attempt-binding/v2'),
    binding_generation INTEGER NOT NULL CHECK (binding_generation >= 1),
    grant_id TEXT NOT NULL REFERENCES grants(grant_id) ON DELETE RESTRICT,
    grant_generation INTEGER NOT NULL CHECK (grant_generation >= 1),
    receiver_id TEXT NOT NULL,
    receiver_entry_identity TEXT NOT NULL,
    helper_parent_process_id INTEGER NOT NULL CHECK (helper_parent_process_id >= 1),
    helper_parent_process_incarnation TEXT NOT NULL,
    recipe_locator TEXT NOT NULL,
    UNIQUE (
      receiver_id, receiver_entry_identity, helper_parent_process_id, helper_parent_process_incarnation
    )
  ) STRICT`,
  `CREATE TABLE bootstrap_attempt_binding_events (
    operation_id TEXT PRIMARY KEY REFERENCES journal_operations(operation_id) ON DELETE RESTRICT,
    attempt_id TEXT NOT NULL REFERENCES attempts(attempt_id) ON DELETE RESTRICT,
    mode TEXT NOT NULL CHECK (mode IN ('initial', 'rebind-after-recovery')),
    expected_attempt_state TEXT NOT NULL CHECK (expected_attempt_state IN ('materializing', 'recovery-required')),
    expected_attempt_version INTEGER NOT NULL CHECK (expected_attempt_version >= 1),
    prior_binding_generation INTEGER CHECK (prior_binding_generation IS NULL OR prior_binding_generation >= 1),
    binding_format TEXT NOT NULL CHECK (binding_format = 'bootstrap-attempt-binding/v2'),
    binding_generation INTEGER NOT NULL CHECK (binding_generation >= 1),
    grant_id TEXT NOT NULL REFERENCES grants(grant_id) ON DELETE RESTRICT,
    grant_generation INTEGER NOT NULL CHECK (grant_generation >= 1),
    receiver_id TEXT NOT NULL,
    receiver_entry_identity TEXT NOT NULL,
    helper_parent_process_id INTEGER NOT NULL CHECK (helper_parent_process_id >= 1),
    helper_parent_process_incarnation TEXT NOT NULL,
    recipe_locator TEXT NOT NULL,
    receiver_correlation TEXT NOT NULL,
    at_ms INTEGER NOT NULL CHECK (at_ms >= 0),
    resulting_version INTEGER NOT NULL CHECK (resulting_version = expected_attempt_version + 1),
    UNIQUE (attempt_id, binding_generation),
    UNIQUE (
      receiver_id, receiver_entry_identity, helper_parent_process_id, helper_parent_process_incarnation
    ),
    CHECK (
      (mode = 'initial' AND expected_attempt_state = 'materializing' AND
        prior_binding_generation IS NULL AND binding_generation = 1) OR
      (mode = 'rebind-after-recovery' AND expected_attempt_state = 'recovery-required' AND
        prior_binding_generation IS NOT NULL AND binding_generation = prior_binding_generation + 1)
    )
  ) STRICT`,
  `CREATE TABLE bootstrap_lease_claims (
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
  ) STRICT`,
  `CREATE UNIQUE INDEX leases_one_nonterminal_per_grant_attempt
    ON leases (grant_id, grant_generation, process_attempt_id)
    WHERE state IN ('authorized', 'active')`
] as const;

const SCHEMA_V2_MIGRATION_STATEMENTS = [
  ...SCHEMA_V2_SCHEMA_STATEMENTS,
  SEED_V1_OPERATIONS_STATEMENT
] as const;

const SCHEMA_V2_CHECKSUM = createHash('sha256')
  .update(SCHEMA_V2_MIGRATION_STATEMENTS.join('\n-- statement boundary --\n'))
  .digest('hex');

const SCHEMA_V3_SCHEMA_STATEMENTS = [
  `CREATE TABLE grant_bindings (
    grant_id TEXT NOT NULL REFERENCES grants(grant_id) ON DELETE RESTRICT,
    slot_id TEXT NOT NULL,
    credential_reference TEXT NOT NULL,
    PRIMARY KEY (grant_id, slot_id)
  ) STRICT`
] as const;

const SEED_LEGACY_GRANT_BINDINGS_STATEMENT = `INSERT INTO grant_bindings (
    grant_id, slot_id, credential_reference
  ) SELECT grant_slots.grant_id, grant_slots.slot_id, grants.credential_reference
    FROM grant_slots
    INNER JOIN grants ON grants.grant_id = grant_slots.grant_id`;

const REVOKE_AMBIGUOUS_LEGACY_GRANTS_STATEMENT = `UPDATE grants SET state = 'revoked'
  WHERE state = 'active' AND grant_id IN (
    SELECT grant_id FROM grant_slots GROUP BY grant_id HAVING COUNT(*) > 1
  )`;

const SCHEMA_V3_MIGRATION_STATEMENTS = [
  ...SCHEMA_V3_SCHEMA_STATEMENTS,
  REVOKE_AMBIGUOUS_LEGACY_GRANTS_STATEMENT,
  SEED_LEGACY_GRANT_BINDINGS_STATEMENT
] as const;

const SCHEMA_V3_CHECKSUM = createHash('sha256')
  .update(SCHEMA_V3_MIGRATION_STATEMENTS.join('\n-- statement boundary --\n'))
  .digest('hex');

const SCHEMA_V4_SCHEMA_STATEMENTS = [
  `CREATE TABLE attempt_launch_admissions (
    attempt_id TEXT NOT NULL REFERENCES attempts(attempt_id) ON DELETE RESTRICT,
    binding_generation INTEGER NOT NULL CHECK (binding_generation >= 1),
    materialization_operation_id TEXT NOT NULL UNIQUE
      REFERENCES attempt_transitions(operation_id) ON DELETE RESTRICT,
    admission_format TEXT NOT NULL CHECK (admission_format = 'grant-qualified-launch-admission/v1'),
    grant_id TEXT NOT NULL REFERENCES grants(grant_id) ON DELETE RESTRICT,
    grant_generation INTEGER NOT NULL CHECK (grant_generation >= 1),
    grant_expires_at_ms INTEGER NOT NULL CHECK (grant_expires_at_ms >= 0),
    receiver_id TEXT NOT NULL,
    receiver_entry_identity TEXT NOT NULL,
    receiver_slot_identity TEXT NOT NULL,
    receiver_process_name TEXT NOT NULL,
    recipe_locator TEXT NOT NULL,
    slot_independent_plan_digest TEXT NOT NULL,
    launch_metadata_digest TEXT NOT NULL,
    deadline_at_ms INTEGER NOT NULL CHECK (deadline_at_ms >= 0),
    PRIMARY KEY (attempt_id, binding_generation)
  ) STRICT`,
  `CREATE TABLE attempt_launch_admission_slots (
    attempt_id TEXT NOT NULL,
    binding_generation INTEGER NOT NULL,
    credential_slot_id TEXT NOT NULL,
    PRIMARY KEY (attempt_id, binding_generation, credential_slot_id),
    FOREIGN KEY (attempt_id, binding_generation)
      REFERENCES attempt_launch_admissions(attempt_id, binding_generation) ON DELETE RESTRICT
  ) STRICT`
] as const;

const SCHEMA_V4_CHECKSUM = createHash('sha256')
  .update(SCHEMA_V4_SCHEMA_STATEMENTS.join('\n-- statement boundary --\n'))
  .digest('hex');

const SCHEMA_V5_SCHEMA_STATEMENTS = [
  `CREATE TABLE leases (
    lease_id TEXT PRIMARY KEY,
    operation_id TEXT NOT NULL UNIQUE,
    grant_id TEXT NOT NULL REFERENCES grants(grant_id) ON DELETE RESTRICT,
    grant_generation INTEGER NOT NULL CHECK (grant_generation >= 1),
    process_attempt_id TEXT NOT NULL REFERENCES attempts(attempt_id) ON DELETE RESTRICT,
    receiver_id TEXT NOT NULL,
    exposure_correlation TEXT NOT NULL UNIQUE,
    issued_at_ms INTEGER NOT NULL CHECK (issued_at_ms >= 0),
    expires_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL,
    cleanup_receipt_id TEXT UNIQUE,
    cleanup_receipt_format TEXT CHECK (
      cleanup_receipt_format IS NULL OR cleanup_receipt_format = 'secret-exposure-cleanup-receipt/v1'
    ),
    cleanup_proof TEXT CHECK (cleanup_proof IS NULL OR cleanup_proof = 'exact-tree-empty'),
    cleanup_observed_at_ms INTEGER CHECK (cleanup_observed_at_ms IS NULL OR cleanup_observed_at_ms >= 0),
    state TEXT NOT NULL CHECK (state IN (
      'authorized', 'delivering', 'exposed', 'closure-required', 'closed', 'revoked', 'recovery-required'
    )),
    UNIQUE (lease_id, exposure_correlation),
    CHECK (expires_at_ms > issued_at_ms),
    CHECK (updated_at_ms >= issued_at_ms),
    CHECK (
      (state = 'closed' AND cleanup_receipt_id IS NOT NULL AND cleanup_receipt_format IS NOT NULL AND
        cleanup_proof IS NOT NULL AND cleanup_observed_at_ms = updated_at_ms) OR
      (state <> 'closed' AND cleanup_receipt_id IS NULL AND cleanup_receipt_format IS NULL AND
        cleanup_proof IS NULL AND cleanup_observed_at_ms IS NULL)
    )
  ) STRICT`,
  `CREATE TABLE lease_transitions (
    operation_id TEXT PRIMARY KEY,
    lease_id TEXT NOT NULL,
    exposure_correlation TEXT NOT NULL,
    expected_state TEXT NOT NULL CHECK (expected_state IN (
      'authorized', 'delivering', 'exposed', 'closure-required', 'recovery-required'
    )),
    next_state TEXT NOT NULL CHECK (next_state IN (
      'delivering', 'exposed', 'closure-required', 'closed', 'revoked', 'recovery-required'
    )),
    at_ms INTEGER NOT NULL CHECK (at_ms >= 0),
    cleanup_receipt_id TEXT UNIQUE,
    cleanup_receipt_format TEXT CHECK (
      cleanup_receipt_format IS NULL OR cleanup_receipt_format = 'secret-exposure-cleanup-receipt/v1'
    ),
    cleanup_proof TEXT CHECK (cleanup_proof IS NULL OR cleanup_proof = 'exact-tree-empty'),
    cleanup_observed_at_ms INTEGER CHECK (cleanup_observed_at_ms IS NULL OR cleanup_observed_at_ms >= 0),
    FOREIGN KEY (lease_id, exposure_correlation)
      REFERENCES leases(lease_id, exposure_correlation) ON DELETE RESTRICT,
    CHECK (
      (expected_state = 'authorized' AND next_state IN ('delivering', 'revoked', 'recovery-required')) OR
      (expected_state = 'delivering' AND next_state IN ('exposed', 'recovery-required')) OR
      (expected_state = 'exposed' AND next_state IN ('closure-required', 'recovery-required')) OR
      (expected_state = 'closure-required' AND next_state IN ('closed', 'recovery-required')) OR
      (expected_state = 'recovery-required' AND next_state IN ('closure-required', 'closed'))
    ),
    CHECK (
      (next_state = 'closed' AND cleanup_receipt_id IS NOT NULL AND cleanup_receipt_format IS NOT NULL AND
        cleanup_proof IS NOT NULL AND cleanup_observed_at_ms = at_ms) OR
      (next_state <> 'closed' AND cleanup_receipt_id IS NULL AND cleanup_receipt_format IS NULL AND
        cleanup_proof IS NULL AND cleanup_observed_at_ms IS NULL)
    )
  ) STRICT`,
  `CREATE UNIQUE INDEX leases_one_nonterminal_per_grant_attempt
    ON leases (grant_id, grant_generation, process_attempt_id)
    WHERE state IN ('authorized', 'delivering', 'exposed', 'closure-required', 'recovery-required')`
] as const;

const RENAME_V4_BOOTSTRAP_CLAIMS_STATEMENT =
  'ALTER TABLE bootstrap_lease_claims RENAME TO bootstrap_lease_claims_v4';
const RENAME_V4_LEASE_TRANSITIONS_STATEMENT =
  'ALTER TABLE lease_transitions RENAME TO lease_transitions_v4';
const RENAME_V4_LEASES_STATEMENT = 'ALTER TABLE leases RENAME TO leases_v4';

const SEED_V5_LEASES_STATEMENT = `INSERT INTO leases (
    lease_id, operation_id, grant_id, grant_generation, process_attempt_id, receiver_id,
    exposure_correlation, issued_at_ms, expires_at_ms, updated_at_ms,
    cleanup_receipt_id, cleanup_receipt_format, cleanup_proof, cleanup_observed_at_ms, state
  ) SELECT
    legacy.lease_id, legacy.operation_id, legacy.grant_id, legacy.grant_generation,
    legacy.process_attempt_id,
    COALESCE(
      (SELECT claim.expected_receiver_id FROM bootstrap_lease_claims_v4 AS claim
        WHERE claim.lease_id = legacy.lease_id),
      (SELECT binding.receiver_id FROM bootstrap_attempt_bindings AS binding
        WHERE binding.attempt_id = legacy.process_attempt_id),
      'legacy-unresolved-receiver'
    ),
    legacy.lease_id,
    legacy.issued_at_ms,
    legacy.expires_at_ms,
    MAX(
      legacy.issued_at_ms,
      COALESCE(legacy.terminated_at_ms, legacy.issued_at_ms),
      COALESCE((SELECT MAX(event.at_ms) FROM lease_transitions_v4 AS event
        WHERE event.lease_id = legacy.lease_id), legacy.issued_at_ms)
    ),
    NULL, NULL, NULL, NULL,
    CASE
      WHEN legacy.state = 'authorized' THEN 'authorized'
      WHEN legacy.state = 'revoked' AND
        (SELECT COUNT(*) FROM lease_transitions_v4 AS event
          WHERE event.lease_id = legacy.lease_id) = 1 AND
        (SELECT COUNT(*) FROM lease_transitions_v4 AS event
          WHERE event.lease_id = legacy.lease_id AND
            event.expected_state = 'authorized' AND event.next_state = 'revoked') = 1
        THEN 'revoked'
      ELSE 'recovery-required'
    END
  FROM leases_v4 AS legacy`;

const SEED_V5_LEASE_TRANSITIONS_STATEMENT = `INSERT INTO lease_transitions (
    operation_id, lease_id, exposure_correlation, expected_state, next_state, at_ms,
    cleanup_receipt_id, cleanup_receipt_format, cleanup_proof, cleanup_observed_at_ms
  ) SELECT
    event.operation_id,
    event.lease_id,
    event.lease_id,
    CASE
      WHEN event.expected_state = 'authorized' THEN 'authorized'
      ELSE 'delivering'
    END,
    CASE
      WHEN event.expected_state = 'authorized' AND event.next_state = 'active' AND
        legacy.state <> 'active' THEN 'delivering'
      WHEN event.expected_state = 'authorized' AND event.next_state = 'active' THEN 'recovery-required'
      WHEN event.expected_state = 'authorized' AND event.next_state = 'revoked' AND
        legacy.state = 'revoked' AND
        (SELECT COUNT(*) FROM lease_transitions_v4 AS history
          WHERE history.lease_id = event.lease_id) = 1
        THEN 'revoked'
      ELSE 'recovery-required'
    END,
    event.at_ms,
    NULL, NULL, NULL, NULL
  FROM lease_transitions_v4 AS event
  INNER JOIN leases_v4 AS legacy ON legacy.lease_id = event.lease_id`;

const SEED_V5_BOOTSTRAP_CLAIMS_STATEMENT = `INSERT INTO bootstrap_lease_claims (
    operation_id, lease_id, attempt_id, exchange_id, expected_attempt_state, expected_attempt_version,
    expected_binding_generation, expected_grant_id, expected_grant_generation, expected_receiver_id,
    expected_receiver_entry_identity, expected_helper_parent_process_id,
    expected_helper_parent_process_incarnation, expected_recipe_locator
  ) SELECT
    operation_id, lease_id, attempt_id, exchange_id, expected_attempt_state, expected_attempt_version,
    expected_binding_generation, expected_grant_id, expected_grant_generation, expected_receiver_id,
    expected_receiver_entry_identity, expected_helper_parent_process_id,
    expected_helper_parent_process_incarnation, expected_recipe_locator
  FROM bootstrap_lease_claims_v4`;

const SCHEMA_V5_MIGRATION_STATEMENTS = [
  'DROP INDEX leases_one_nonterminal_per_grant_attempt',
  RENAME_V4_BOOTSTRAP_CLAIMS_STATEMENT,
  RENAME_V4_LEASE_TRANSITIONS_STATEMENT,
  RENAME_V4_LEASES_STATEMENT,
  SCHEMA_V5_SCHEMA_STATEMENTS[0],
  SEED_V5_LEASES_STATEMENT,
  SCHEMA_V5_SCHEMA_STATEMENTS[1],
  SEED_V5_LEASE_TRANSITIONS_STATEMENT,
  SCHEMA_V2_SCHEMA_STATEMENTS[3],
  SEED_V5_BOOTSTRAP_CLAIMS_STATEMENT,
  'DROP TABLE bootstrap_lease_claims_v4',
  'DROP TABLE lease_transitions_v4',
  'DROP TABLE leases_v4',
  SCHEMA_V5_SCHEMA_STATEMENTS[2]
] as const;

const SCHEMA_V5_CHECKSUM = createHash('sha256')
  .update(SCHEMA_V5_MIGRATION_STATEMENTS.join('\n-- statement boundary --\n'))
  .digest('hex');

const SCHEMA_V6_SCHEMA_STATEMENTS = [
  `CREATE TABLE verified_windows_attempt_containment_bindings (
    attempt_id TEXT PRIMARY KEY REFERENCES bootstrap_attempt_bindings(attempt_id) ON DELETE RESTRICT,
    operation_id TEXT NOT NULL UNIQUE REFERENCES journal_operations(operation_id) ON DELETE RESTRICT,
    binding_format TEXT NOT NULL CHECK (binding_format = 'verified-windows-attempt-containment/v1'),
    binding_generation INTEGER NOT NULL CHECK (binding_generation >= 1),
    repository TEXT NOT NULL,
    recipe_revision TEXT NOT NULL,
    grant_id TEXT NOT NULL REFERENCES grants(grant_id) ON DELETE RESTRICT,
    grant_generation INTEGER NOT NULL CHECK (grant_generation >= 1),
    grant_expires_at_ms INTEGER NOT NULL CHECK (grant_expires_at_ms >= 0),
    receiver_id TEXT NOT NULL,
    receiver_correlation TEXT NOT NULL,
    receiver_entry_identity TEXT NOT NULL,
    receiver_slot_identity TEXT NOT NULL,
    receiver_process_name TEXT NOT NULL,
    receiver_pm_id INTEGER NOT NULL CHECK (receiver_pm_id >= 0),
    recipe_locator TEXT NOT NULL,
    slot_independent_plan_digest TEXT NOT NULL,
    launch_metadata_digest TEXT NOT NULL,
    deadline_at_ms INTEGER NOT NULL CHECK (deadline_at_ms >= 0),
    root_process_id INTEGER NOT NULL CHECK (root_process_id >= 1),
    root_process_incarnation TEXT NOT NULL,
    job_identity TEXT NOT NULL,
    job_policy_format TEXT NOT NULL CHECK (job_policy_format = 'windows-job-policy/v1'),
    job_extended_limit TEXT NOT NULL CHECK (job_extended_limit = 'kill-on-job-close-only'),
    job_ui_restrictions TEXT NOT NULL CHECK (job_ui_restrictions = 'none'),
    job_breakaway TEXT NOT NULL CHECK (job_breakaway = 'forbidden'),
    membership_verified_at_ms INTEGER NOT NULL CHECK (membership_verified_at_ms >= 0),
    resulting_attempt_version INTEGER NOT NULL CHECK (resulting_attempt_version >= 1),
    FOREIGN KEY (attempt_id, binding_generation)
      REFERENCES attempt_launch_admissions(attempt_id, binding_generation) ON DELETE RESTRICT,
    UNIQUE (receiver_id, receiver_entry_identity, root_process_id, root_process_incarnation),
    UNIQUE (attempt_id, binding_generation),
    CHECK (membership_verified_at_ms < deadline_at_ms),
    CHECK (membership_verified_at_ms < grant_expires_at_ms)
  ) STRICT`,
  `CREATE TABLE verified_windows_attempt_containment_slots (
    attempt_id TEXT NOT NULL,
    binding_generation INTEGER NOT NULL,
    credential_slot_id TEXT NOT NULL,
    PRIMARY KEY (attempt_id, binding_generation, credential_slot_id),
    FOREIGN KEY (attempt_id, binding_generation)
      REFERENCES verified_windows_attempt_containment_bindings(attempt_id, binding_generation) ON DELETE RESTRICT
  ) STRICT`,
  `CREATE TABLE verified_windows_terminal_cleanups (
    attempt_id TEXT PRIMARY KEY,
    operation_id TEXT NOT NULL UNIQUE REFERENCES journal_operations(operation_id) ON DELETE RESTRICT,
    cleanup_format TEXT NOT NULL CHECK (cleanup_format = 'verified-windows-terminal-cleanup/v1'),
    binding_generation INTEGER NOT NULL CHECK (binding_generation >= 1),
    terminal_disposition TEXT NOT NULL CHECK (terminal_disposition IN ('succeeded', 'failed', 'cancelled')),
    tree_cleanup_format TEXT NOT NULL CHECK (tree_cleanup_format = 'verified-windows-tree-cleanup/v1'),
    tree_cleanup_proof TEXT NOT NULL CHECK (tree_cleanup_proof = 'exact-tree-empty'),
    tree_cleanup_basis TEXT NOT NULL CHECK (tree_cleanup_basis IN (
      'job-terminated-empty', 'job-already-empty', 'job-missing-root-exited'
    )),
    job_identity TEXT NOT NULL,
    root_process_id INTEGER NOT NULL CHECK (root_process_id >= 1),
    root_process_incarnation TEXT NOT NULL,
    tree_observed_at_ms INTEGER NOT NULL CHECK (tree_observed_at_ms >= 0),
    pm2_deletion_format TEXT NOT NULL CHECK (pm2_deletion_format = 'pm2-exact-record-deletion/v1'),
    pm2_deletion_disposition TEXT NOT NULL CHECK (pm2_deletion_disposition IN ('deleted', 'already-absent')),
    receiver_id TEXT NOT NULL,
    receiver_correlation TEXT NOT NULL,
    receiver_slot_identity TEXT NOT NULL,
    receiver_process_name TEXT NOT NULL,
    receiver_pm_id INTEGER NOT NULL CHECK (receiver_pm_id >= 0),
    launch_metadata_digest TEXT NOT NULL,
    pm2_deleted_at_ms INTEGER NOT NULL CHECK (pm2_deleted_at_ms >= tree_observed_at_ms),
    closed_exposure_count INTEGER NOT NULL CHECK (closed_exposure_count >= 0),
    cleaned_at_ms INTEGER NOT NULL CHECK (cleaned_at_ms >= pm2_deleted_at_ms),
    FOREIGN KEY (attempt_id, binding_generation)
      REFERENCES verified_windows_attempt_containment_bindings(attempt_id, binding_generation) ON DELETE RESTRICT
  ) STRICT`
] as const;

const RECOVER_UNVERIFIED_LEGACY_WINDOWS_BINDINGS_STATEMENT = `UPDATE attempts SET
    state = 'recovery-required', state_version = state_version + 1,
    updated_at_ms = CASE WHEN updated_at_ms > ? THEN updated_at_ms ELSE ? END
  WHERE attempt_id IN (SELECT attempt_id FROM bootstrap_attempt_bindings)
    AND state <> 'recovery-required'`;

const SCHEMA_V6_MIGRATION_STATEMENTS = [
  ...SCHEMA_V6_SCHEMA_STATEMENTS,
  RECOVER_UNVERIFIED_LEGACY_WINDOWS_BINDINGS_STATEMENT
] as const;

const SCHEMA_V6_CHECKSUM = createHash('sha256')
  .update(SCHEMA_V6_MIGRATION_STATEMENTS.join('\n-- statement boundary --\n'))
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

type GrantBase = Omit<GrantJournalRecord, 'credentialBindings'>;
type ConsentBase = Omit<ConsentEvidenceRecord, 'credentialSlotIds'>;

type LeaseTransitionRow = TransitionLease;

type AttemptTransitionRow = Readonly<{
  operationId: JournalOperationId;
  attemptId: ProcessAttemptId;
  expectedState: AttemptJournalState;
  nextState: AttemptJournalState;
  atMs: number;
  receiverCorrelation: ReceiverCorrelation | null;
  resultingVersion: number;
}>;

type BootstrapAttemptBindingEventRow = Readonly<{
  operationId: JournalOperationId;
  attemptId: ProcessAttemptId;
  mode: BindBootstrapAttempt['mode'];
  expectedState: BindBootstrapAttempt['expectedState'];
  expectedStateVersion: number;
  priorBindingGeneration: number | null;
  binding: BootstrapAttemptBinding;
  receiverCorrelation: ReceiverCorrelation;
  atMs: number;
  resultingVersion: number;
}>;

type BootstrapLeaseClaimRow = Readonly<{
  operationId: JournalOperationId;
  leaseId: LeaseJournalId;
  exchangeId: BootstrapExchangeJournalId;
  expectedAttempt: ClaimAuthorizedBootstrapLease['expectedAttempt'];
}>;

type PersistedVerifiedWindowsContainment = Readonly<{
  operationId: JournalOperationId;
  binding: VerifiedWindowsAttemptContainmentBinding;
  resultingAttemptVersion: number;
}>;

type RegisteredOperationStatus = 'available' | 'registered';

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const corrupt = <T>(message: string = 'The authority journal contains invalid persisted state.'): JournalResult<T> =>
  journalErr({ code: 'journal-corrupt', message });

const conflict = <T>(message: string): JournalResult<T> =>
  journalErr({ code: 'journal-conflict', message });

const authorityStale = <T>(message: string): JournalResult<T> =>
  journalErr({ code: 'journal-authority-stale', message });

const notFound = <T>(message: string): JournalResult<T> =>
  journalErr({ code: 'journal-not-found', message });

const recoveryRequired = <T>(message: string): JournalResult<T> =>
  journalErr({ code: 'journal-recovery-required', message });

const parseSafeInteger = (value: unknown): JournalResult<number> =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? journalOk(value) : corrupt();

const parsePositiveInteger = (value: unknown): JournalResult<number> =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 ? journalOk(value) : corrupt();

const parseNullablePositiveInteger = (value: unknown): JournalResult<number | null> =>
  value === null ? journalOk(null) : parsePositiveInteger(value);

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
const parseReceiverIdRow = (value: unknown): JournalResult<ReceiverId> =>
  parseReceiverId(value).match(value_ => journalOk(value_), () => corrupt());
const parseCredentialReferenceRow = (value: unknown): JournalResult<CredentialReference> =>
  parseCredentialReference(value).match(value_ => journalOk(value_), () => corrupt());
const parseExposureCorrelationRow = (value: unknown): JournalResult<SecretExposureCorrelation> =>
  parseSecretExposureCorrelation(value).match(value_ => journalOk(value_), () => corrupt());
const parseCleanupReceiptIdRow = (
  value: unknown
): JournalResult<SecretExposureCleanupReceipt['id']> =>
  parseSecretExposureCleanupReceiptId(value).match(value_ => journalOk(value_), () => corrupt());

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

const parseBootstrapExchangeIdRow = (value: unknown): JournalResult<BootstrapExchangeJournalId> => {
  const result = parseBootstrapExchangeJournalId(value);
  return result.type === 'ok' ? result : corrupt();
};

const isJournalOperationKind = (value: unknown): value is JournalOperationKind =>
  typeof value === 'string' && JOURNAL_OPERATION_KINDS.some(kind => kind === value);

const journalOperationKind = (value: unknown): JournalResult<JournalOperationKind> =>
  isJournalOperationKind(value)
    ? journalOk(value)
    : corrupt();

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

const parseCheckedInRecipeLocatorRow = (value: unknown) => {
  const result = parseCheckedInRecipeLocator(value);
  return result.type === 'ok' ? result : corrupt<never>();
};

const parseReceiverEntryIdentityRow = (value: unknown) => {
  const result = parseReceiverEntryIdentity(value);
  return result.type === 'ok' ? result : corrupt<never>();
};

const parseProcessIncarnationRow = (value: unknown) => {
  const result = parseProcessIncarnation(value);
  return result.type === 'ok' ? result : corrupt<never>();
};

const parseDurableWindowsNamedJobIdentityRow = (value: unknown) => {
  const result = parseDurableWindowsNamedJobIdentity(value);
  return result.type === 'ok' ? result : corrupt<never>();
};

const consentOutcome = (value: unknown): JournalResult<ConsentEvidenceRecord['outcome']> =>
  value === 'approved' || value === 'denied' ? journalOk(value) : corrupt();

const grantState = (value: unknown): JournalResult<GrantJournalRecord['state']> =>
  value === 'active' || value === 'revoked' ? journalOk(value) : corrupt();

const leaseState = (value: unknown): JournalResult<LeaseJournalRecord['state']> =>
  value === 'authorized' || value === 'delivering' || value === 'exposed' ||
    value === 'closure-required' || value === 'closed' || value === 'revoked' || value === 'recovery-required'
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

const decodeJournalOperation = (row: unknown): JournalResult<JournalOperationRecord> => {
  if (!isRecord(row)) return corrupt();
  const id = parseOperationIdRow(row['operation_id']);
  const kind = journalOperationKind(row['operation_kind']);
  const subjectIdentity = parseText(row['subject_identity'], 512);
  const registeredAtMs = parseSafeInteger(row['registered_at_ms']);
  if (id.type === 'err') return id;
  if (kind.type === 'err') return kind;
  if (subjectIdentity.type === 'err') return subjectIdentity;
  if (registeredAtMs.type === 'err') return registeredAtMs;
  return journalOk({
    id: id.value,
    kind: kind.value,
    subjectIdentity: subjectIdentity.value,
    registeredAtMs: registeredAtMs.value
  });
};

const readJournalOperation = (
  database: Database,
  id: JournalOperationId
): JournalResult<JournalOperationRecord | null> => {
  const row = preparedGet<unknown>(database, `SELECT
      operation_id, operation_kind, subject_identity, registered_at_ms
    FROM journal_operations WHERE operation_id = ?`, [id.value]);
  return row === null ? journalOk(null) : mapJournalResult(decodeJournalOperation(row), value => value);
};

const sameJournalOperation = (left: JournalOperationRecord, right: JournalOperationRecord): boolean =>
  left.id.value === right.id.value && left.kind === right.kind &&
  left.subjectIdentity === right.subjectIdentity && left.registeredAtMs === right.registeredAtMs;

const inspectJournalOperation = (
  database: Database,
  expected: JournalOperationRecord
): JournalResult<RegisteredOperationStatus> => {
  const current = readJournalOperation(database, expected.id);
  return current.type === 'err'
    ? current
    : current.value === null
      ? journalOk('available')
      : sameJournalOperation(current.value, expected)
        ? journalOk('registered')
        : conflict('The journal operation id is already bound to a different operation kind or subject.');
};

const registerJournalOperation = (database: Database, operation: JournalOperationRecord): void => {
  preparedRun(database, `INSERT INTO journal_operations (
      operation_id, operation_kind, subject_identity, registered_at_ms
    ) VALUES (?, ?, ?, ?)`, [
    operation.id.value,
    operation.kind,
    operation.subjectIdentity,
    operation.registeredAtMs
  ]);
};

const decodeSlotRows = (rows: readonly unknown[]): JournalResult<readonly CredentialSlotId[]> =>
  rows.reduce<JournalResult<readonly CredentialSlotId[]>>((decoded, row) => {
    if (decoded.type === 'err') return decoded;
    if (!isRecord(row)) return corrupt();
    return mapJournalResult(
      parseCredentialSlotIdRow(row['slot_id']),
      (slot): readonly CredentialSlotId[] => [...decoded.value, slot]
    );
  }, journalOk<readonly CredentialSlotId[]>([]));

const decodeGrantBindingRows = (rows: readonly unknown[]): JournalResult<GrantCredentialBindingSet> => {
  const decoded = rows.reduce<JournalResult<readonly GrantCredentialBinding[]>>((result, row) => {
    if (result.type === 'err') return result;
    if (!isRecord(row)) return corrupt();
    const slotId = parseCredentialSlotIdRow(row['slot_id']);
    const credentialReference = parseCredentialReferenceRow(row['credential_reference']);
    if (slotId.type === 'err') return slotId;
    if (credentialReference.type === 'err') return credentialReference;
    if (result.value.some(binding => binding.slotId === slotId.value)) return corrupt();
    return journalOk([...result.value, {
      slotId: slotId.value,
      credentialReference: credentialReference.value
    }]);
  }, journalOk<readonly GrantCredentialBinding[]>([]));
  if (decoded.type === 'err') return decoded;
  const [first, ...rest] = decoded.value;
  return first === undefined ? corrupt() : journalOk([first, ...rest]);
};

const decodeGrantBase = (row: unknown): JournalResult<GrantBase> => {
  if (!isRecord(row)) return corrupt();
  const id = parseGrantIdRow(row['grant_id']);
  const operationId = parseOperationIdRow(row['operation_id']);
  const repository = parseCanonicalRepositoryRow(row['repository']);
  const recipeRevision = parseRecipeRevisionRow(row['recipe_revision']);
  const consentId = parseConsentIdRow(row['consent_id']);
  const generation = parsePositiveInteger(row['generation']);
  const issuedAtMs = parseSafeInteger(row['issued_at_ms']);
  const expiresAtMs = parseSafeInteger(row['expires_at_ms']);
  const state = grantState(row['state']);
  if (id.type === 'err') return id;
  if (operationId.type === 'err') return operationId;
  if (repository.type === 'err') return repository;
  if (recipeRevision.type === 'err') return recipeRevision;
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
      grant_id, operation_id, repository, recipe_revision, consent_id,
      generation, issued_at_ms, expires_at_ms, state
    FROM grants WHERE grant_id = ?`, [id]);
  if (row === null) return journalOk(null);
  const base = decodeGrantBase(row);
  if (base.type === 'err') return base;
  const bindings = decodeGrantBindingRows(preparedAll<unknown>(
    database,
    `SELECT slot_id, credential_reference
      FROM grant_bindings WHERE grant_id = ? ORDER BY slot_id`,
    [id]
  ));
  if (bindings.type === 'err') return bindings;
  const consentSlots = decodeSlotRows(preparedAll<unknown>(
    database,
    'SELECT slot_id FROM consent_slots WHERE consent_id = ? ORDER BY slot_id',
    [base.value.consentId.value]
  ));
  if (consentSlots.type === 'err') return consentSlots;
  const bindingSlotIds: readonly CredentialSlotId[] = bindings.value.map(binding => binding.slotId);
  return bindingSlotIds.length === consentSlots.value.length &&
    bindingSlotIds.every(slot => consentSlots.value.includes(slot))
    ? journalOk({ ...base.value, credentialBindings: bindings.value })
    : corrupt();
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

const decodeCleanupReceipt = (
  row: Readonly<Record<string, unknown>>,
  receiverId: ReceiverId,
  processAttemptId: ProcessAttemptId,
  exposureCorrelation: SecretExposureCorrelation
): JournalResult<SecretExposureCleanupReceipt | null> => {
  const rawFields = [
    row['cleanup_receipt_id'],
    row['cleanup_receipt_format'],
    row['cleanup_proof'],
    row['cleanup_observed_at_ms']
  ];
  if (rawFields.every(value => value === null)) return journalOk(null);
  if (rawFields.some(value => value === null) ||
      row['cleanup_receipt_format'] !== 'secret-exposure-cleanup-receipt/v1' ||
      row['cleanup_proof'] !== 'exact-tree-empty') return corrupt();
  const id = parseCleanupReceiptIdRow(row['cleanup_receipt_id']);
  const observedAtMs = parseSafeInteger(row['cleanup_observed_at_ms']);
  if (id.type === 'err') return id;
  if (observedAtMs.type === 'err') return observedAtMs;
  return journalOk({
    format: 'secret-exposure-cleanup-receipt/v1',
    id: id.value,
    exposureCorrelation,
    receiverId,
    processAttemptId,
    proof: 'exact-tree-empty',
    observedAtMs: observedAtMs.value
  });
};

const decodeLease = (row: unknown): JournalResult<LeaseJournalRecord> => {
  if (!isRecord(row)) return corrupt();
  const id = parseLeaseIdRow(row['lease_id']);
  const operationId = parseOperationIdRow(row['operation_id']);
  const grantId = parseGrantIdRow(row['grant_id']);
  const grantGeneration = parsePositiveInteger(row['grant_generation']);
  const processAttemptId = parseProcessAttemptIdRow(row['process_attempt_id']);
  const receiverId = parseReceiverIdRow(row['receiver_id']);
  const exposureCorrelation = parseExposureCorrelationRow(row['exposure_correlation']);
  const issuedAtMs = parseSafeInteger(row['issued_at_ms']);
  const expiresAtMs = parseSafeInteger(row['expires_at_ms']);
  const updatedAtMs = parseSafeInteger(row['updated_at_ms']);
  const state = leaseState(row['state']);
  if (id.type === 'err') return id;
  if (operationId.type === 'err') return operationId;
  if (grantId.type === 'err') return grantId;
  if (grantGeneration.type === 'err') return grantGeneration;
  if (processAttemptId.type === 'err') return processAttemptId;
  if (receiverId.type === 'err') return receiverId;
  if (exposureCorrelation.type === 'err') return exposureCorrelation;
  if (issuedAtMs.type === 'err') return issuedAtMs;
  if (expiresAtMs.type === 'err') return expiresAtMs;
  if (updatedAtMs.type === 'err') return updatedAtMs;
  if (state.type === 'err') return state;
  const cleanupReceipt = decodeCleanupReceipt(
    row,
    receiverId.value,
    processAttemptId.value,
    exposureCorrelation.value
  );
  if (cleanupReceipt.type === 'err') return cleanupReceipt;
  if (expiresAtMs.value <= issuedAtMs.value || updatedAtMs.value < issuedAtMs.value ||
      (state.value === 'closed') !== (cleanupReceipt.value !== null) ||
      (cleanupReceipt.value !== null && cleanupReceipt.value.observedAtMs !== updatedAtMs.value)) return corrupt();
  return journalOk({
    id: id.value,
    operationId: operationId.value,
    grantId: grantId.value,
    grantGeneration: grantGeneration.value,
    processAttemptId: processAttemptId.value,
    receiverId: receiverId.value,
    exposureCorrelation: exposureCorrelation.value,
    issuedAtMs: issuedAtMs.value,
    expiresAtMs: expiresAtMs.value,
    updatedAtMs: updatedAtMs.value,
    cleanupReceipt: cleanupReceipt.value,
    state: state.value
  });
};

const readLeaseInDatabase = (database: Database, id: string): JournalResult<LeaseJournalRecord | null> => {
  const row = preparedGet<unknown>(database, `SELECT
      lease_id, operation_id, grant_id, grant_generation, process_attempt_id, receiver_id,
      exposure_correlation, issued_at_ms, expires_at_ms, updated_at_ms,
      cleanup_receipt_id, cleanup_receipt_format, cleanup_proof, cleanup_observed_at_ms, state
    FROM leases WHERE lease_id = ?`, [id]);
  return row === null ? journalOk(null) : mapJournalResult(decodeLease(row), value => value);
};

const readLeaseByOperation = (database: Database, operationId: string): JournalResult<LeaseJournalRecord | null> => {
  const row = preparedGet<unknown>(database, 'SELECT lease_id FROM leases WHERE operation_id = ?', [operationId]);
  if (row === null) return journalOk(null);
  if (!isRecord(row) || typeof row['lease_id'] !== 'string') return corrupt();
  return readLeaseInDatabase(database, row['lease_id']);
};

const bootstrapClaimAttemptState = (
  value: unknown
): JournalResult<ClaimAuthorizedBootstrapLease['expectedAttempt']['state']> =>
  value === 'materializing' || value === 'running' ? journalOk(value) : corrupt();

const decodeBootstrapLeaseClaim = (row: unknown): JournalResult<BootstrapLeaseClaimRow> => {
  if (!isRecord(row)) return corrupt();
  const operationId = parseOperationIdRow(row['operation_id']);
  const leaseId = parseLeaseIdRow(row['lease_id']);
  const attemptId = parseProcessAttemptIdRow(row['attempt_id']);
  const exchangeId = parseBootstrapExchangeIdRow(row['exchange_id']);
  const expectedState = bootstrapClaimAttemptState(row['expected_attempt_state']);
  const expectedVersion = parsePositiveInteger(row['expected_attempt_version']);
  const binding = decodeBootstrapAttemptBinding({
    bootstrap_binding_format: 'bootstrap-attempt-binding/v2',
    bootstrap_binding_generation: row['expected_binding_generation'],
    bootstrap_grant_id: row['expected_grant_id'],
    bootstrap_grant_generation: row['expected_grant_generation'],
    bootstrap_receiver_id: row['expected_receiver_id'],
    bootstrap_receiver_entry_identity: row['expected_receiver_entry_identity'],
    bootstrap_helper_parent_process_id: row['expected_helper_parent_process_id'],
    bootstrap_helper_parent_process_incarnation: row['expected_helper_parent_process_incarnation'],
    bootstrap_recipe_locator: row['expected_recipe_locator']
  });
  if (operationId.type === 'err') return operationId;
  if (leaseId.type === 'err') return leaseId;
  if (attemptId.type === 'err') return attemptId;
  if (exchangeId.type === 'err') return exchangeId;
  if (expectedState.type === 'err') return expectedState;
  if (expectedVersion.type === 'err') return expectedVersion;
  if (binding.type === 'err' || binding.value === null) return corrupt();
  return journalOk({
    operationId: operationId.value,
    leaseId: leaseId.value,
    exchangeId: exchangeId.value,
    expectedAttempt: {
      id: attemptId.value,
      state: expectedState.value,
      stateVersion: expectedVersion.value,
      binding: binding.value
    }
  });
};

const readBootstrapClaimByOperation = (
  database: Database,
  operationId: string
): JournalResult<BootstrapLeaseClaimRow | null> => {
  const row = preparedGet<unknown>(database, `SELECT
      operation_id, lease_id, attempt_id, exchange_id, expected_attempt_state, expected_attempt_version,
      expected_binding_generation, expected_grant_id, expected_grant_generation, expected_receiver_id,
      expected_receiver_entry_identity, expected_helper_parent_process_id,
      expected_helper_parent_process_incarnation,
      expected_recipe_locator
    FROM bootstrap_lease_claims WHERE operation_id = ?`, [operationId]);
  return row === null ? journalOk(null) : mapJournalResult(decodeBootstrapLeaseClaim(row), value => value);
};

const readBootstrapClaimByLease = (
  database: Database,
  leaseId: string
): JournalResult<BootstrapLeaseClaimRow | null> => {
  const row = preparedGet<unknown>(database, `SELECT
      operation_id, lease_id, attempt_id, exchange_id, expected_attempt_state, expected_attempt_version,
      expected_binding_generation, expected_grant_id, expected_grant_generation, expected_receiver_id,
      expected_receiver_entry_identity, expected_helper_parent_process_id,
      expected_helper_parent_process_incarnation,
      expected_recipe_locator
    FROM bootstrap_lease_claims WHERE lease_id = ?`, [leaseId]);
  return row === null ? journalOk(null) : mapJournalResult(decodeBootstrapLeaseClaim(row), value => value);
};

const readBootstrapClaimByExchange = (
  database: Database,
  attemptId: ProcessAttemptId,
  exchangeId: BootstrapExchangeJournalId
): JournalResult<BootstrapLeaseClaimRow | null> => {
  const row = preparedGet<unknown>(database, `SELECT
      operation_id, lease_id, attempt_id, exchange_id, expected_attempt_state, expected_attempt_version,
      expected_binding_generation, expected_grant_id, expected_grant_generation, expected_receiver_id,
      expected_receiver_entry_identity, expected_helper_parent_process_id,
      expected_helper_parent_process_incarnation,
      expected_recipe_locator
    FROM bootstrap_lease_claims WHERE attempt_id = ? AND exchange_id = ?`, [attemptId, exchangeId.value]);
  return row === null ? journalOk(null) : mapJournalResult(decodeBootstrapLeaseClaim(row), value => value);
};

const decodeLeaseRows = (rows: readonly unknown[]): JournalResult<readonly LeaseJournalRecord[]> =>
  rows.reduce<JournalResult<readonly LeaseJournalRecord[]>>((decoded, row) => decoded.type === 'err'
    ? decoded
    : mapJournalResult(decodeLease(row), lease => [...decoded.value, lease]), journalOk([]));

const readNonterminalLeasesForAttempt = (
  database: Database,
  attemptId: ProcessAttemptId
): JournalResult<readonly LeaseJournalRecord[]> => {
  const decoded = decodeLeaseRows(preparedAll<unknown>(database, `SELECT
      lease_id, operation_id, grant_id, grant_generation, process_attempt_id, receiver_id,
      exposure_correlation, issued_at_ms, expires_at_ms, updated_at_ms,
      cleanup_receipt_id, cleanup_receipt_format, cleanup_proof, cleanup_observed_at_ms, state
    FROM leases WHERE process_attempt_id = ?
      AND state IN ('authorized', 'delivering', 'exposed', 'closure-required', 'recovery-required')
    ORDER BY lease_id LIMIT ?`, [attemptId, MAXIMUM_NONTERMINAL_LEASES_PER_ATTEMPT + 1]));
  return decoded.type === 'err' || decoded.value.length <= MAXIMUM_NONTERMINAL_LEASES_PER_ATTEMPT
    ? decoded
    : recoveryRequired('The process attempt has too many nonterminal exposure records for bounded reconciliation.');
};

const readNonterminalLeaseForGrantAttempt = (
  database: Database,
  grantId: GrantId,
  grantGeneration: number,
  attemptId: ProcessAttemptId
): JournalResult<LeaseJournalRecord | null> => {
  const decoded = decodeLeaseRows(preparedAll<unknown>(database, `SELECT
      lease_id, operation_id, grant_id, grant_generation, process_attempt_id, receiver_id,
      exposure_correlation, issued_at_ms, expires_at_ms, updated_at_ms,
      cleanup_receipt_id, cleanup_receipt_format, cleanup_proof, cleanup_observed_at_ms, state
    FROM leases WHERE grant_id = ? AND grant_generation = ? AND process_attempt_id = ?
      AND state IN ('authorized', 'delivering', 'exposed', 'closure-required', 'recovery-required')
      ORDER BY lease_id`, [grantId, grantGeneration, attemptId]));
  if (decoded.type === 'err') return decoded;
  if (decoded.value.length > 1) {
    return recoveryRequired('Multiple nonterminal leases violate the authority journal invariant.');
  }
  return journalOk(decoded.value[0] ?? null);
};

const decodeLeaseTransition = (row: unknown): JournalResult<LeaseTransitionRow> => {
  if (!isRecord(row)) return corrupt();
  const operationId = parseOperationIdRow(row['operation_id']);
  const leaseId = parseLeaseIdRow(row['lease_id']);
  const expectedState = leaseState(row['expected_state']);
  const nextState = leaseState(row['next_state']);
  const exposureCorrelation = parseExposureCorrelationRow(row['exposure_correlation']);
  const receiverId = parseReceiverIdRow(row['lease_receiver_id']);
  const processAttemptId = parseProcessAttemptIdRow(row['lease_process_attempt_id']);
  const atMs = parseSafeInteger(row['at_ms']);
  if (operationId.type === 'err') return operationId;
  if (leaseId.type === 'err') return leaseId;
  if (expectedState.type === 'err') return expectedState;
  if (nextState.type === 'err') return nextState;
  if (exposureCorrelation.type === 'err') return exposureCorrelation;
  if (receiverId.type === 'err') return receiverId;
  if (processAttemptId.type === 'err') return processAttemptId;
  if (atMs.type === 'err') return atMs;
  const cleanupReceipt = decodeCleanupReceipt(
    row,
    receiverId.value,
    processAttemptId.value,
    exposureCorrelation.value
  );
  if (cleanupReceipt.type === 'err') return cleanupReceipt;
  const common = {
    operationId: operationId.value,
    leaseId: leaseId.value,
    exposureCorrelation: exposureCorrelation.value,
    atMs: atMs.value
  };
  const transition: TransitionLease | null = expectedState.value === 'authorized' &&
    (nextState.value === 'delivering' || nextState.value === 'revoked' || nextState.value === 'recovery-required') &&
    cleanupReceipt.value === null
    ? { ...common, expectedState: 'authorized', nextState: nextState.value, cleanupReceipt: null }
    : expectedState.value === 'delivering' &&
        (nextState.value === 'exposed' || nextState.value === 'recovery-required') && cleanupReceipt.value === null
      ? { ...common, expectedState: 'delivering', nextState: nextState.value, cleanupReceipt: null }
      : expectedState.value === 'exposed' &&
          (nextState.value === 'closure-required' || nextState.value === 'recovery-required') &&
          cleanupReceipt.value === null
        ? { ...common, expectedState: 'exposed', nextState: nextState.value, cleanupReceipt: null }
        : expectedState.value === 'closure-required' && nextState.value === 'recovery-required' &&
            cleanupReceipt.value === null
          ? { ...common, expectedState: 'closure-required', nextState: 'recovery-required', cleanupReceipt: null }
          : expectedState.value === 'recovery-required' && nextState.value === 'closure-required' &&
              cleanupReceipt.value === null
            ? { ...common, expectedState: 'recovery-required', nextState: 'closure-required', cleanupReceipt: null }
            : (expectedState.value === 'closure-required' || expectedState.value === 'recovery-required') &&
                nextState.value === 'closed' && cleanupReceipt.value !== null
              ? {
                  ...common,
                  expectedState: expectedState.value,
                  nextState: 'closed',
                  cleanupReceipt: cleanupReceipt.value
                }
              : null;
  return transition !== null && validateLeaseTransition(transition).type === 'ok'
    ? journalOk(transition)
    : corrupt();
};

const readLeaseTransitionByOperation = (
  database: Database,
  operationId: string
): JournalResult<LeaseTransitionRow | null> => {
  const row = preparedGet<unknown>(database, `SELECT
      transition.operation_id, transition.lease_id, transition.exposure_correlation,
      transition.expected_state, transition.next_state, transition.at_ms,
      transition.cleanup_receipt_id, transition.cleanup_receipt_format,
      transition.cleanup_proof, transition.cleanup_observed_at_ms,
      lease.receiver_id AS lease_receiver_id,
      lease.process_attempt_id AS lease_process_attempt_id
    FROM lease_transitions AS transition
    INNER JOIN leases AS lease ON lease.lease_id = transition.lease_id
    WHERE transition.operation_id = ?`, [operationId]);
  return row === null ? journalOk(null) : mapJournalResult(decodeLeaseTransition(row), value => value);
};

const readTransitionProducingCurrentLeaseState = (
  database: Database,
  lease: LeaseJournalRecord
): JournalResult<LeaseTransitionRow | null> => {
  const rows = preparedAll<unknown>(database, `SELECT
      transition.operation_id, transition.lease_id, transition.exposure_correlation,
      transition.expected_state, transition.next_state, transition.at_ms,
      transition.cleanup_receipt_id, transition.cleanup_receipt_format,
      transition.cleanup_proof, transition.cleanup_observed_at_ms,
      current_lease.receiver_id AS lease_receiver_id,
      current_lease.process_attempt_id AS lease_process_attempt_id
    FROM lease_transitions AS transition
    INNER JOIN leases AS current_lease ON current_lease.lease_id = transition.lease_id
    WHERE transition.lease_id = ? AND transition.next_state = ? AND transition.at_ms = ?
    ORDER BY transition.operation_id`, [lease.id.value, lease.state, lease.updatedAtMs]);
  const decoded = rows.reduce<JournalResult<readonly LeaseTransitionRow[]>>((result, row) => result.type === 'err'
    ? result
    : mapJournalResult(decodeLeaseTransition(row), transition => [...result.value, transition]), journalOk([]));
  if (decoded.type === 'err') return decoded;
  if (decoded.value.length > 1) {
    return recoveryRequired('Multiple transitions claim the current secret-exposure state.');
  }
  return journalOk(decoded.value[0] ?? null);
};

const decodeBootstrapAttemptBinding = (row: Readonly<Record<string, unknown>>): JournalResult<BootstrapAttemptBinding | null> => {
  const rawValues: readonly unknown[] = [
    row['bootstrap_binding_format'],
    row['bootstrap_binding_generation'],
    row['bootstrap_grant_id'],
    row['bootstrap_grant_generation'],
    row['bootstrap_receiver_id'],
    row['bootstrap_receiver_entry_identity'],
    row['bootstrap_helper_parent_process_id'],
    row['bootstrap_helper_parent_process_incarnation'],
    row['bootstrap_recipe_locator']
  ];
  if (rawValues.every(value => value === null)) return journalOk(null);
  if (rawValues.some(value => value === null) || row['bootstrap_binding_format'] !== 'bootstrap-attempt-binding/v2') {
    return corrupt();
  }
  const bindingGeneration = parsePositiveInteger(row['bootstrap_binding_generation']);
  const grantId = parseGrantIdRow(row['bootstrap_grant_id']);
  const grantGeneration = parsePositiveInteger(row['bootstrap_grant_generation']);
  const receiverId = parseReceiverIdRow(row['bootstrap_receiver_id']);
  const receiverEntryIdentity = parseReceiverEntryIdentityRow(row['bootstrap_receiver_entry_identity']);
  const helperParentProcessId = parsePositiveInteger(row['bootstrap_helper_parent_process_id']);
  const helperParentProcessIncarnation = parseProcessIncarnationRow(
    row['bootstrap_helper_parent_process_incarnation']
  );
  const recipeLocator = parseCheckedInRecipeLocatorRow(row['bootstrap_recipe_locator']);
  if (bindingGeneration.type === 'err') return bindingGeneration;
  if (grantId.type === 'err') return grantId;
  if (grantGeneration.type === 'err') return grantGeneration;
  if (receiverId.type === 'err') return receiverId;
  if (receiverEntryIdentity.type === 'err') return receiverEntryIdentity;
  if (helperParentProcessId.type === 'err') return helperParentProcessId;
  if (helperParentProcessIncarnation.type === 'err') return helperParentProcessIncarnation;
  if (recipeLocator.type === 'err') return recipeLocator;
  return journalOk({
    format: 'bootstrap-attempt-binding/v2',
    bindingGeneration: bindingGeneration.value,
    grantId: grantId.value,
    grantGeneration: grantGeneration.value,
    receiverId: receiverId.value,
    receiverEntryIdentity: receiverEntryIdentity.value,
    helperParentProcessId: helperParentProcessId.value,
    helperParentProcessIncarnation: helperParentProcessIncarnation.value,
    recipeLocator: recipeLocator.value
  });
};

const bootstrapBindingMode = (value: unknown): JournalResult<BindBootstrapAttempt['mode']> =>
  value === 'initial' || value === 'rebind-after-recovery' ? journalOk(value) : corrupt();

const bootstrapBindingExpectedState = (value: unknown): JournalResult<BindBootstrapAttempt['expectedState']> =>
  value === 'materializing' || value === 'recovery-required' ? journalOk(value) : corrupt();

const decodeBootstrapAttemptBindingEvent = (
  row: unknown
): JournalResult<BootstrapAttemptBindingEventRow> => {
  if (!isRecord(row)) return corrupt();
  const operationId = parseOperationIdRow(row['operation_id']);
  const attemptId = parseProcessAttemptIdRow(row['attempt_id']);
  const mode = bootstrapBindingMode(row['mode']);
  const expectedState = bootstrapBindingExpectedState(row['expected_attempt_state']);
  const expectedStateVersion = parsePositiveInteger(row['expected_attempt_version']);
  const priorBindingGeneration = parseNullablePositiveInteger(row['prior_binding_generation']);
  const binding = decodeBootstrapAttemptBinding({
    bootstrap_binding_format: row['binding_format'],
    bootstrap_binding_generation: row['binding_generation'],
    bootstrap_grant_id: row['grant_id'],
    bootstrap_grant_generation: row['grant_generation'],
    bootstrap_receiver_id: row['receiver_id'],
    bootstrap_receiver_entry_identity: row['receiver_entry_identity'],
    bootstrap_helper_parent_process_id: row['helper_parent_process_id'],
    bootstrap_helper_parent_process_incarnation: row['helper_parent_process_incarnation'],
    bootstrap_recipe_locator: row['recipe_locator']
  });
  const receiverCorrelation = parseReceiverCorrelationRow(row['receiver_correlation']);
  const atMs = parseSafeInteger(row['at_ms']);
  const resultingVersion = parsePositiveInteger(row['resulting_version']);
  if (operationId.type === 'err') return operationId;
  if (attemptId.type === 'err') return attemptId;
  if (mode.type === 'err') return mode;
  if (expectedState.type === 'err') return expectedState;
  if (expectedStateVersion.type === 'err') return expectedStateVersion;
  if (priorBindingGeneration.type === 'err') return priorBindingGeneration;
  if (binding.type === 'err' || binding.value === null) return corrupt();
  if (receiverCorrelation.type === 'err') return receiverCorrelation;
  if (atMs.type === 'err') return atMs;
  if (resultingVersion.type === 'err') return resultingVersion;
  const common = {
    operationId: operationId.value,
    attemptId: attemptId.value,
    expectedStateVersion: expectedStateVersion.value,
    atMs: atMs.value,
    receiverCorrelation: receiverCorrelation.value,
    binding: binding.value
  };
  const command: BindBootstrapAttempt | null = mode.value === 'initial' &&
    expectedState.value === 'materializing' && priorBindingGeneration.value === null
    ? {
        ...common,
        mode: 'initial',
        expectedState: 'materializing',
        priorBindingGeneration: null
      }
    : mode.value === 'rebind-after-recovery' && expectedState.value === 'recovery-required' &&
        priorBindingGeneration.value !== null
      ? {
          ...common,
          mode: 'rebind-after-recovery',
          expectedState: 'recovery-required',
          priorBindingGeneration: priorBindingGeneration.value
        }
      : null;
  if (command === null || validateBootstrapAttemptBind(command).type === 'err' ||
      resultingVersion.value !== expectedStateVersion.value + 1) return corrupt();
  return journalOk({
    operationId: command.operationId,
    attemptId: command.attemptId,
    mode: command.mode,
    expectedState: command.expectedState,
    expectedStateVersion: command.expectedStateVersion,
    priorBindingGeneration: command.priorBindingGeneration,
    binding: command.binding,
    receiverCorrelation: command.receiverCorrelation,
    atMs: command.atMs,
    resultingVersion: resultingVersion.value
  });
};

const readBootstrapBindingEventByOperation = (
  database: Database,
  operationId: string
): JournalResult<BootstrapAttemptBindingEventRow | null> => {
  const row = preparedGet<unknown>(database, `SELECT
      operation_id, attempt_id, mode, expected_attempt_state, expected_attempt_version,
      prior_binding_generation, binding_format, binding_generation, grant_id, grant_generation,
      receiver_id, receiver_entry_identity, helper_parent_process_id, helper_parent_process_incarnation,
      recipe_locator, receiver_correlation, at_ms, resulting_version
    FROM bootstrap_attempt_binding_events WHERE operation_id = ?`, [operationId]);
  return row === null
    ? journalOk(null)
    : mapJournalResult(decodeBootstrapAttemptBindingEvent(row), value => value);
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
  const bootstrapBinding = decodeBootstrapAttemptBinding(row);
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
  if (bootstrapBinding.type === 'err') return bootstrapBinding;
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
    updatedAtMs: updatedAtMs.value,
    bootstrapBinding: bootstrapBinding.value
  });
};

const readAttemptInDatabase = (database: Database, id: ProcessAttemptId): JournalResult<AttemptJournalRecord | null> => {
  const row = preparedGet<unknown>(database, `SELECT
      attempts.attempt_id, reserve_operation_id, repository, recipe_revision, plan_digest, lifecycle,
      receiver_correlation, state, state_version, created_at_ms, updated_at_ms,
      binding_format AS bootstrap_binding_format,
      binding_generation AS bootstrap_binding_generation,
      bootstrap_attempt_bindings.grant_id AS bootstrap_grant_id,
      bootstrap_attempt_bindings.grant_generation AS bootstrap_grant_generation,
      receiver_id AS bootstrap_receiver_id,
      receiver_entry_identity AS bootstrap_receiver_entry_identity,
      helper_parent_process_id AS bootstrap_helper_parent_process_id,
      helper_parent_process_incarnation AS bootstrap_helper_parent_process_incarnation,
      recipe_locator AS bootstrap_recipe_locator
    FROM attempts
    LEFT JOIN bootstrap_attempt_bindings ON bootstrap_attempt_bindings.attempt_id = attempts.attempt_id
    WHERE attempts.attempt_id = ?`, [id]);
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

const decodeGrantQualifiedLaunchAdmission = (
  row: unknown,
  attempt: AttemptJournalRecord,
  credentialSlotIds: readonly CredentialSlotId[]
): JournalResult<GrantQualifiedMaterializingAttemptRecord> => {
  if (!isRecord(row)) return corrupt();
  const bindingGeneration = parsePositiveInteger(row['binding_generation']);
  const materializationOperationId = parseOperationIdRow(row['materialization_operation_id']);
  const grantId = parseGrantIdRow(row['grant_id']);
  const grantGeneration = parsePositiveInteger(row['grant_generation']);
  const grantExpiresAtMs = parseSafeInteger(row['grant_expires_at_ms']);
  const receiverId = parseReceiverIdRow(row['receiver_id']);
  const receiverEntryIdentity = parseReceiverEntryIdentityRow(row['receiver_entry_identity']);
  const receiverSlotIdentity = parseText(row['receiver_slot_identity'], 128);
  const receiverProcessName = parseText(row['receiver_process_name'], 128);
  const recipeLocator = parseCheckedInRecipeLocatorRow(row['recipe_locator']);
  const slotIndependentPlanDigest = parsePlanDigestRow(row['slot_independent_plan_digest']);
  const launchMetadataDigest = parseText(row['launch_metadata_digest'], 64);
  const deadlineAtMs = parseSafeInteger(row['deadline_at_ms']);
  const transitionAtMs = parseSafeInteger(row['transition_at_ms']);
  const transitionCorrelation = parseReceiverCorrelationRow(row['transition_receiver_correlation']);
  if (bindingGeneration.type === 'err') return bindingGeneration;
  if (materializationOperationId.type === 'err') return materializationOperationId;
  if (grantId.type === 'err') return grantId;
  if (grantGeneration.type === 'err') return grantGeneration;
  if (grantExpiresAtMs.type === 'err') return grantExpiresAtMs;
  if (receiverId.type === 'err') return receiverId;
  if (receiverEntryIdentity.type === 'err') return receiverEntryIdentity;
  if (receiverSlotIdentity.type === 'err') return receiverSlotIdentity;
  if (receiverProcessName.type === 'err') return receiverProcessName;
  if (recipeLocator.type === 'err') return recipeLocator;
  if (slotIndependentPlanDigest.type === 'err') return slotIndependentPlanDigest;
  if (launchMetadataDigest.type === 'err') return launchMetadataDigest;
  if (deadlineAtMs.type === 'err') return deadlineAtMs;
  if (transitionAtMs.type === 'err') return transitionAtMs;
  if (transitionCorrelation.type === 'err') return transitionCorrelation;
  if (row['admission_format'] !== 'grant-qualified-launch-admission/v1' ||
      !/^[a-f0-9]{64}$/u.test(launchMetadataDigest.value) ||
      attempt.planDigest.value !== launchMetadataDigest.value || attempt.receiverCorrelation === null ||
      attempt.receiverCorrelation.value !== transitionCorrelation.value.value ||
      row['transition_expected_state'] !== 'reserved' || row['transition_next_state'] !== 'materializing' ||
      row['transition_resulting_version'] !== 2 || transitionAtMs.value < attempt.createdAtMs ||
      deadlineAtMs.value <= transitionAtMs.value || deadlineAtMs.value > grantExpiresAtMs.value ||
      credentialSlotIds.length === 0 || new Set(credentialSlotIds).size !== credentialSlotIds.length) {
    return corrupt();
  }
  return journalOk({
    attempt,
    authority: {
      grantId: grantId.value,
      grantGeneration: grantGeneration.value,
      repository: attempt.repository,
      recipeRevision: attempt.recipeRevision,
      credentialSlotIds,
      grantExpiresAtMs: grantExpiresAtMs.value
    },
    admission: {
      format: 'grant-qualified-launch-admission/v1',
      bindingGeneration: bindingGeneration.value,
      receiverId: receiverId.value,
      receiverSlotIdentity: receiverSlotIdentity.value,
      receiverProcessName: receiverProcessName.value,
      receiverEntryIdentity: receiverEntryIdentity.value,
      recipeLocator: recipeLocator.value,
      slotIndependentPlanDigest: slotIndependentPlanDigest.value,
      launchMetadataDigest: launchMetadataDigest.value,
      deadlineAtMs: deadlineAtMs.value
    }
  });
};

const readGrantQualifiedAttemptAdmissionInDatabase = (
  database: Database,
  id: ProcessAttemptId,
  bindingGeneration: number
): JournalResult<GrantQualifiedMaterializingAttemptRecord | null> => {
  const attempt = readAttemptInDatabase(database, id);
  if (attempt.type === 'err') return attempt;
  const row = preparedGet<unknown>(database, `SELECT
      admission.binding_generation, admission.materialization_operation_id, admission.admission_format,
      admission.grant_id, admission.grant_generation, admission.grant_expires_at_ms,
      admission.receiver_id, admission.receiver_entry_identity, admission.receiver_slot_identity,
      admission.receiver_process_name, admission.recipe_locator, admission.slot_independent_plan_digest,
      admission.launch_metadata_digest, admission.deadline_at_ms,
      transition.expected_state AS transition_expected_state,
      transition.next_state AS transition_next_state,
      transition.at_ms AS transition_at_ms,
      transition.receiver_correlation AS transition_receiver_correlation,
      transition.resulting_version AS transition_resulting_version
    FROM attempt_launch_admissions AS admission
    INNER JOIN attempt_transitions AS transition
      ON transition.operation_id = admission.materialization_operation_id
    WHERE admission.attempt_id = ? AND admission.binding_generation = ?`, [id, bindingGeneration]);
  if (row === null) return attempt.value === null ? journalOk(null) : journalOk(null);
  if (attempt.value === null) return corrupt();
  const slots = decodeSlotRows(preparedAll<unknown>(database, `SELECT credential_slot_id AS slot_id
    FROM attempt_launch_admission_slots
    WHERE attempt_id = ? AND binding_generation = ? ORDER BY credential_slot_id`, [id, bindingGeneration]));
  return slots.type === 'err'
    ? slots
    : decodeGrantQualifiedLaunchAdmission(row, attempt.value, slots.value);
};

const readGrantQualifiedAttemptInDatabase = (
  database: Database,
  id: ProcessAttemptId
): JournalResult<GrantQualifiedMaterializingAttemptRecord | null> =>
  readGrantQualifiedAttemptAdmissionInDatabase(database, id, 1);

const readGrantQualifiedMaterializingAttemptInDatabase = (
  database: Database,
  id: ProcessAttemptId
): JournalResult<GrantQualifiedMaterializingAttemptRecord | null> => {
  const current = readGrantQualifiedAttemptInDatabase(database, id);
  return current.type === 'err' || current.value?.attempt.state === 'materializing'
    ? current
    : journalOk(null);
};

const decodeVerifiedWindowsContainment = (
  row: unknown,
  credentialSlotIds: readonly CredentialSlotId[]
): JournalResult<PersistedVerifiedWindowsContainment> => {
  if (!isRecord(row)) return corrupt();
  const operationId = parseOperationIdRow(row['operation_id']);
  const bindingGeneration = parsePositiveInteger(row['binding_generation']);
  const processAttemptId = parseProcessAttemptIdRow(row['attempt_id']);
  const repository = parseCanonicalRepositoryRow(row['repository']);
  const recipeRevision = parseRecipeRevisionRow(row['recipe_revision']);
  const grantId = parseGrantIdRow(row['grant_id']);
  const grantGeneration = parsePositiveInteger(row['grant_generation']);
  const grantExpiresAtMs = parseSafeInteger(row['grant_expires_at_ms']);
  const receiverId = parseReceiverIdRow(row['receiver_id']);
  const receiverCorrelation = parseReceiverCorrelationRow(row['receiver_correlation']);
  const receiverEntryIdentity = parseReceiverEntryIdentityRow(row['receiver_entry_identity']);
  const receiverSlotIdentity = parseText(row['receiver_slot_identity'], 128);
  const receiverProcessName = parseText(row['receiver_process_name'], 128);
  const receiverPmId = parseSafeInteger(row['receiver_pm_id']);
  const recipeLocator = parseCheckedInRecipeLocatorRow(row['recipe_locator']);
  const slotIndependentPlanDigest = parsePlanDigestRow(row['slot_independent_plan_digest']);
  const launchMetadataDigest = parseText(row['launch_metadata_digest'], 64);
  const deadlineAtMs = parseSafeInteger(row['deadline_at_ms']);
  const rootProcessId = parsePositiveInteger(row['root_process_id']);
  const rootProcessIncarnation = parseProcessIncarnationRow(row['root_process_incarnation']);
  const jobIdentity = parseDurableWindowsNamedJobIdentityRow(row['job_identity']);
  const membershipVerifiedAtMs = parseSafeInteger(row['membership_verified_at_ms']);
  const resultingAttemptVersion = parsePositiveInteger(row['resulting_attempt_version']);
  if (operationId.type === 'err' || bindingGeneration.type === 'err' || processAttemptId.type === 'err' ||
      repository.type === 'err' || recipeRevision.type === 'err' || grantId.type === 'err' ||
      grantGeneration.type === 'err' || grantExpiresAtMs.type === 'err' || receiverId.type === 'err' ||
      receiverCorrelation.type === 'err' || receiverEntryIdentity.type === 'err' ||
      receiverSlotIdentity.type === 'err' || receiverProcessName.type === 'err' || receiverPmId.type === 'err' ||
      recipeLocator.type === 'err' || slotIndependentPlanDigest.type === 'err' ||
      launchMetadataDigest.type === 'err' || deadlineAtMs.type === 'err' || rootProcessId.type === 'err' ||
      rootProcessIncarnation.type === 'err' || jobIdentity.type === 'err' || membershipVerifiedAtMs.type === 'err' ||
      resultingAttemptVersion.type === 'err' || row['job_policy_format'] !== 'windows-job-policy/v1' ||
      row['job_extended_limit'] !== 'kill-on-job-close-only' || row['job_ui_restrictions'] !== 'none' ||
      row['job_breakaway'] !== 'forbidden') return corrupt();
  const binding: VerifiedWindowsAttemptContainmentBinding = {
    format: 'verified-windows-attempt-containment/v1',
    bindingGeneration: bindingGeneration.value,
    processAttemptId: processAttemptId.value,
    repository: repository.value,
    recipeRevision: recipeRevision.value,
    grantId: grantId.value,
    grantGeneration: grantGeneration.value,
    credentialSlotIds,
    grantExpiresAtMs: grantExpiresAtMs.value,
    receiverId: receiverId.value,
    receiverCorrelation: receiverCorrelation.value,
    receiverEntryIdentity: receiverEntryIdentity.value,
    receiverSlotIdentity: receiverSlotIdentity.value,
    receiverProcessName: receiverProcessName.value,
    receiverPmId: receiverPmId.value,
    recipeLocator: recipeLocator.value,
    slotIndependentPlanDigest: slotIndependentPlanDigest.value,
    launchMetadataDigest: launchMetadataDigest.value,
    deadlineAtMs: deadlineAtMs.value,
    rootProcessId: rootProcessId.value,
    rootProcessIncarnation: rootProcessIncarnation.value,
    jobIdentity: jobIdentity.value,
    jobPolicy: {
      format: 'windows-job-policy/v1',
      extendedLimit: 'kill-on-job-close-only',
      uiRestrictions: 'none',
      breakaway: 'forbidden'
    },
    membershipVerifiedAtMs: membershipVerifiedAtMs.value
  };
  return row['binding_format'] === 'verified-windows-attempt-containment/v1'
    ? journalOk({ operationId: operationId.value, binding, resultingAttemptVersion: resultingAttemptVersion.value })
    : corrupt();
};

const readVerifiedWindowsContainmentInDatabase = (
  database: Database,
  id: ProcessAttemptId
): JournalResult<PersistedVerifiedWindowsContainment | null> => {
  const row = preparedGet<unknown>(database, `SELECT *
    FROM verified_windows_attempt_containment_bindings WHERE attempt_id = ?`, [id]);
  if (row === null) return journalOk(null);
  const slots = decodeSlotRows(preparedAll<unknown>(database, `SELECT credential_slot_id AS slot_id
    FROM verified_windows_attempt_containment_slots
    WHERE attempt_id = ? ORDER BY credential_slot_id`, [id]));
  return slots.type === 'err' ? slots : decodeVerifiedWindowsContainment(row, slots.value);
};

const sameContainedAuthority = (
  current: GrantQualifiedMaterializingAttemptRecord,
  binding: VerifiedWindowsAttemptContainmentBinding
): boolean => current.attempt.id === binding.processAttemptId && current.attempt.repository === binding.repository &&
  current.attempt.recipeRevision === binding.recipeRevision &&
  current.attempt.planDigest.value === binding.launchMetadataDigest &&
  current.attempt.receiverCorrelation?.value === binding.receiverCorrelation.value &&
  current.authority.grantId === binding.grantId &&
  current.authority.grantGeneration === binding.grantGeneration &&
  current.authority.grantExpiresAtMs === binding.grantExpiresAtMs &&
  sameSlots(current.authority.credentialSlotIds, binding.credentialSlotIds) &&
  current.admission.bindingGeneration === binding.bindingGeneration &&
  current.admission.receiverId === binding.receiverId &&
  current.admission.receiverEntryIdentity.value === binding.receiverEntryIdentity.value &&
  current.admission.receiverSlotIdentity === binding.receiverSlotIdentity &&
  current.admission.receiverProcessName === binding.receiverProcessName &&
  current.admission.recipeLocator.value === binding.recipeLocator.value &&
  current.admission.slotIndependentPlanDigest.value === binding.slotIndependentPlanDigest.value &&
  current.admission.launchMetadataDigest === binding.launchMetadataDigest &&
  current.admission.deadlineAtMs === binding.deadlineAtMs;

const sameContainedBootstrapBinding = (
  attempt: AttemptJournalRecord,
  binding: VerifiedWindowsAttemptContainmentBinding
): boolean => attempt.bootstrapBinding !== null &&
  attempt.bootstrapBinding.bindingGeneration === binding.bindingGeneration &&
  attempt.bootstrapBinding.grantId === binding.grantId &&
  attempt.bootstrapBinding.grantGeneration === binding.grantGeneration &&
  attempt.bootstrapBinding.receiverId === binding.receiverId &&
  attempt.bootstrapBinding.receiverEntryIdentity.value === binding.receiverEntryIdentity.value &&
  attempt.bootstrapBinding.helperParentProcessId === binding.rootProcessId &&
  attempt.bootstrapBinding.helperParentProcessIncarnation.value === binding.rootProcessIncarnation.value &&
  attempt.bootstrapBinding.recipeLocator.value === binding.recipeLocator.value;

const readGrantQualifiedContainedAttemptInDatabase = (
  database: Database,
  id: ProcessAttemptId
): JournalResult<GrantQualifiedContainedAttemptRecord | null> => {
  const current = readGrantQualifiedAttemptInDatabase(database, id);
  if (current.type === 'err') return current;
  if (current.value === null) return journalOk(null);
  const persisted = readVerifiedWindowsContainmentInDatabase(database, id);
  if (persisted.type === 'err') return persisted;
  if (persisted.value === null) return journalOk(null);
  const exact = sameContainedAuthority(current.value, persisted.value.binding) &&
    sameContainedBootstrapBinding(current.value.attempt, persisted.value.binding) &&
    persisted.value.resultingAttemptVersion <= current.value.attempt.stateVersion &&
    current.value.attempt.state !== 'reserved' && current.value.attempt.state !== 'materializing';
  return exact
    ? journalOk({ ...current.value, containmentBinding: persisted.value.binding })
    : corrupt('The persisted Windows containment binding has drifted from launch authority.');
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
  if (resultingVersion.value < 2 || !isAttemptTransitionAllowed(expectedState.value, nextState.value)) return corrupt();
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

const sameGrantBindings = (
  left: GrantCredentialBindingSet,
  right: GrantCredentialBindingSet
): boolean => left.length === right.length && left.every(binding => right.some(candidate =>
  candidate.slotId === binding.slotId && candidate.credentialReference.value === binding.credentialReference.value));

const operationRecord = (
  id: JournalOperationId,
  kind: JournalOperationKind,
  subjectIdentity: string,
  registeredAtMs: number
): JournalOperationRecord => ({ id, kind, subjectIdentity, registeredAtMs });

const sameGrant = (left: GrantJournalRecord, right: GrantJournalRecord): boolean =>
  left.id === right.id && left.operationId.value === right.operationId.value && left.repository === right.repository &&
  left.recipeRevision === right.recipeRevision && left.consentId.value === right.consentId.value &&
  left.generation === right.generation && left.issuedAtMs === right.issuedAtMs && left.expiresAtMs === right.expiresAtMs &&
  left.state === right.state && sameGrantBindings(left.credentialBindings, right.credentialBindings);

const sameConsent = (left: ConsentEvidenceRecord, right: ConsentEvidenceRecord): boolean =>
  left.id.value === right.id.value && left.operationId.value === right.operationId.value &&
  left.repository === right.repository && left.recipeRevision === right.recipeRevision &&
  left.authorityDigest.value === right.authorityDigest.value && left.promptVersion === right.promptVersion &&
  left.grantExpiresAtMs === right.grantExpiresAtMs &&
  left.occurredAtMs === right.occurredAtMs && left.outcome === right.outcome &&
  sameSlots(left.credentialSlotIds, right.credentialSlotIds);

const sameLeaseCreationIdentity = (left: LeaseJournalRecord, right: LeaseJournalRecord): boolean =>
  left.id.value === right.id.value && left.operationId.value === right.operationId.value &&
  left.grantId === right.grantId && left.grantGeneration === right.grantGeneration &&
  left.processAttemptId === right.processAttemptId && left.receiverId === right.receiverId &&
  left.exposureCorrelation.value === right.exposureCorrelation.value &&
  left.issuedAtMs === right.issuedAtMs && left.expiresAtMs === right.expiresAtMs;

const sameBootstrapBinding = (
  left: BootstrapAttemptBinding | null,
  right: BootstrapAttemptBinding | null
): boolean => left === null || right === null
  ? left === right
  : left.bindingGeneration === right.bindingGeneration && left.grantId === right.grantId &&
    left.grantGeneration === right.grantGeneration && left.receiverId === right.receiverId &&
    left.receiverEntryIdentity.value === right.receiverEntryIdentity.value &&
    left.helperParentProcessId === right.helperParentProcessId &&
    left.helperParentProcessIncarnation.value === right.helperParentProcessIncarnation.value &&
    left.recipeLocator.value === right.recipeLocator.value;

const sameBootstrapClaim = (
  persisted: BootstrapLeaseClaimRow,
  requested: ClaimAuthorizedBootstrapLease
): boolean => persisted.operationId.value === requested.operationId.value &&
  persisted.leaseId.value === requested.lease.id.value &&
  persisted.exchangeId.value === requested.exchangeId.value &&
  persisted.expectedAttempt.id === requested.expectedAttempt.id &&
  persisted.expectedAttempt.state === requested.expectedAttempt.state &&
  persisted.expectedAttempt.stateVersion === requested.expectedAttempt.stateVersion &&
  sameBootstrapBinding(persisted.expectedAttempt.binding, requested.expectedAttempt.binding);

const sameAttempt = (left: AttemptJournalRecord, right: AttemptJournalRecord): boolean =>
  left.id === right.id && left.reserveOperationId.value === right.reserveOperationId.value &&
  left.repository === right.repository && left.recipeRevision === right.recipeRevision &&
  left.planDigest.value === right.planDigest.value && left.lifecycle === right.lifecycle &&
  left.receiverCorrelation?.value === right.receiverCorrelation?.value && left.state === right.state &&
  left.stateVersion === right.stateVersion && left.createdAtMs === right.createdAtMs &&
  left.updatedAtMs === right.updatedAtMs && sameBootstrapBinding(left.bootstrapBinding, right.bootstrapBinding);

const sameInitialAttemptReservation = (
  current: AttemptJournalRecord,
  requested: ReserveAttempt['attempt']
): boolean => current.id === requested.id &&
  current.reserveOperationId.value === requested.reserveOperationId.value &&
  current.repository === requested.repository && current.recipeRevision === requested.recipeRevision &&
  current.planDigest.value === requested.planDigest.value && current.lifecycle === requested.lifecycle &&
  current.createdAtMs === requested.createdAtMs;

const sameGrantQualifiedAuthority = (
  left: GrantQualifiedMaterializingAttemptRecord['authority'],
  right: ReserveGrantQualifiedMaterializingAttempt['authority']
): boolean => left.grantId === right.grantId && left.grantGeneration === right.grantGeneration &&
  left.repository === right.repository && left.recipeRevision === right.recipeRevision &&
  left.grantExpiresAtMs === right.grantExpiresAtMs && sameSlots(left.credentialSlotIds, right.credentialSlotIds);

const sameGrantQualifiedAdmission = (
  left: GrantQualifiedOneShotLaunchAdmission,
  right: GrantQualifiedOneShotLaunchAdmission
): boolean => left.bindingGeneration === right.bindingGeneration &&
  left.receiverId === right.receiverId && left.receiverSlotIdentity === right.receiverSlotIdentity &&
  left.receiverProcessName === right.receiverProcessName &&
  left.receiverEntryIdentity.value === right.receiverEntryIdentity.value &&
  left.recipeLocator.value === right.recipeLocator.value &&
  left.slotIndependentPlanDigest.value === right.slotIndependentPlanDigest.value &&
  left.launchMetadataDigest === right.launchMetadataDigest && left.deadlineAtMs === right.deadlineAtMs;

const sameBootstrapBindingEvent = (
  event: BootstrapAttemptBindingEventRow,
  command: BindBootstrapAttempt
): boolean => event.operationId.value === command.operationId.value && event.attemptId === command.attemptId &&
  event.mode === command.mode && event.expectedState === command.expectedState &&
  event.expectedStateVersion === command.expectedStateVersion &&
  event.priorBindingGeneration === command.priorBindingGeneration &&
  sameBootstrapBinding(event.binding, command.binding) &&
  event.receiverCorrelation.value === command.receiverCorrelation.value && event.atMs === command.atMs;

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
  // The v1 columns remain as an inert compatibility projection so existing
  // databases can migrate without rebuilding foreign-keyed authority tables.
  // All admitted reads and equality checks use normalized grant_bindings.
  const legacyCredentialReference = grant.credentialBindings[0].credentialReference;
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
    legacyCredentialReference.value,
    grant.consentId.value,
    grant.generation,
    grant.issuedAtMs,
    grant.expiresAtMs,
    grant.state
  ]);
  grant.credentialBindings.forEach(binding => preparedRun(
    database,
    'INSERT INTO grant_slots (grant_id, slot_id) VALUES (?, ?)',
    [grant.id, binding.slotId]
  ));
  grant.credentialBindings.forEach(binding => preparedRun(
    database,
    `INSERT INTO grant_bindings (grant_id, slot_id, credential_reference)
      VALUES (?, ?, ?)`,
    [grant.id, binding.slotId, binding.credentialReference.value]
  ));
};

const commitGrantWithConsentInDatabase = (
  database: Database,
  command: CommitGrantWithConsent
): JournalResult<JournalMutation<GrantJournalRecord>> => database.transaction(
  (): JournalResult<JournalMutation<GrantJournalRecord>> => {
    const operation = operationRecord(
      command.operationId,
      'commit-grant-with-consent',
      command.grant.id,
      command.grant.issuedAtMs
    );
    const operationStatus = inspectJournalOperation(database, operation);
    if (operationStatus.type === 'err') return operationStatus;
    const existingGrant = readGrantByOperation(database, command.operationId.value);
    if (existingGrant.type === 'err') return existingGrant;
    if (operationStatus.value === 'registered') {
      if (existingGrant.value === null) {
        return recoveryRequired('A registered grant operation has no committed grant record.');
      }
      const existingConsent = readConsentInDatabase(database, existingGrant.value.consentId);
      if (existingConsent.type === 'err') return existingConsent;
      return existingConsent.value !== null && sameGrant(existingGrant.value, command.grant) &&
        sameConsent(existingConsent.value, command.consent)
        ? journalOk({ status: 'already-committed', record: existingGrant.value })
        : conflict('The journal operation id is already bound to different grant authority.');
    }
    if (existingGrant.value !== null) {
      return recoveryRequired('A grant record exists without its global journal operation registration.');
    }
    registerJournalOperation(database, operation);
    insertConsentAndGrant(database, command);
    return journalOk({ status: 'committed', record: command.grant });
  }
).immediate();

const insertAttempt = (database: Database, attempt: ReserveAttempt['attempt']): void => {
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
    const operation = operationRecord(
      command.operationId,
      'reserve-attempt',
      command.attempt.id,
      command.attempt.createdAtMs
    );
    const operationStatus = inspectJournalOperation(database, operation);
    if (operationStatus.type === 'err') return operationStatus;
    const existing = readAttemptByReserveOperation(database, command.operationId.value);
    if (existing.type === 'err') return existing;
    if (operationStatus.value === 'registered') {
      return existing.value !== null && sameAttempt(existing.value, command.attempt)
        ? journalOk({ status: 'already-committed', record: existing.value })
        : recoveryRequired('A registered attempt reservation has no exact attempt record.');
    }
    if (existing.value !== null) {
      return recoveryRequired('An attempt reservation exists without its global journal operation registration.');
    }
    registerJournalOperation(database, operation);
    insertAttempt(database, command.attempt);
    return journalOk({ status: 'committed', record: command.attempt });
  }
).immediate();

const materializingReservationOutcome = (
  command: ReserveGrantQualifiedMaterializingAttempt
): GrantQualifiedMaterializingAttemptRecord => ({
  attempt: {
    ...command.reservation.attempt,
    receiverCorrelation: command.materialization.receiverCorrelation,
    state: 'materializing',
    stateVersion: 2,
    updatedAtMs: command.materialization.atMs
  },
  authority: command.authority,
  admission: command.admission
});

const replayableMaterializingAttempt = (
  attempt: AttemptJournalRecord,
  command: ReserveGrantQualifiedMaterializingAttempt
): boolean => {
  if (attempt.state !== 'materializing') return false;
  if (attempt.stateVersion === 2) return attempt.bootstrapBinding === null;
  const binding = attempt.bootstrapBinding;
  return attempt.stateVersion === 3 && binding !== null &&
    binding.bindingGeneration === command.admission.bindingGeneration &&
    binding.grantId === command.authority.grantId &&
    binding.grantGeneration === command.authority.grantGeneration &&
    binding.receiverId === command.admission.receiverId &&
    binding.receiverEntryIdentity.value === command.admission.receiverEntryIdentity.value &&
    binding.recipeLocator.value === command.admission.recipeLocator.value;
};

const exactGrantForMaterializingReservation = (
  grant: GrantJournalRecord | null,
  command: ReserveGrantQualifiedMaterializingAttempt,
  transactionNowMs: number
): boolean => {
  if (grant === null) return false;
  const authority = command.authority;
  const slotIds: readonly CredentialSlotId[] = grant.credentialBindings.map(binding => binding.slotId);
  return Number.isSafeInteger(transactionNowMs) && transactionNowMs >= command.authorityCheckedAtMs &&
    transactionNowMs < command.admission.deadlineAtMs && grant.id === authority.grantId && grant.state === 'active' &&
    grant.generation === authority.grantGeneration && grant.repository === authority.repository &&
    grant.recipeRevision === authority.recipeRevision && grant.expiresAtMs === authority.grantExpiresAtMs &&
    sameSlots(slotIds, authority.credentialSlotIds) &&
    transactionNowMs >= grant.issuedAtMs && transactionNowMs < grant.expiresAtMs;
};

const insertGrantQualifiedLaunchAdmission = (
  database: Database,
  command: ReserveGrantQualifiedMaterializingAttempt
): void => {
  const admission = command.admission;
  preparedRun(database, `INSERT INTO attempt_launch_admissions (
      attempt_id, binding_generation, materialization_operation_id, admission_format,
      grant_id, grant_generation, grant_expires_at_ms, receiver_id, receiver_entry_identity,
      receiver_slot_identity, receiver_process_name, recipe_locator, slot_independent_plan_digest,
      launch_metadata_digest, deadline_at_ms
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    command.reservation.attempt.id,
    admission.bindingGeneration,
    command.materialization.operationId.value,
    admission.format,
    command.authority.grantId,
    command.authority.grantGeneration,
    command.authority.grantExpiresAtMs,
    admission.receiverId,
    admission.receiverEntryIdentity.value,
    admission.receiverSlotIdentity,
    admission.receiverProcessName,
    admission.recipeLocator.value,
    admission.slotIndependentPlanDigest.value,
    admission.launchMetadataDigest,
    admission.deadlineAtMs
  ]);
  command.authority.credentialSlotIds.forEach(slotId => preparedRun(
    database,
    `INSERT INTO attempt_launch_admission_slots (
      attempt_id, binding_generation, credential_slot_id
    ) VALUES (?, ?, ?)`,
    [command.reservation.attempt.id, admission.bindingGeneration, slotId]
  ));
};

const reserveGrantQualifiedMaterializingAttemptInDatabase = (
  database: Database,
  command: ReserveGrantQualifiedMaterializingAttempt,
  clock: BunSqliteJournalOptions['clock']
): JournalResult<JournalMutation<GrantQualifiedMaterializingAttemptRecord>> => database.transaction(
  (): JournalResult<JournalMutation<GrantQualifiedMaterializingAttemptRecord>> => {
    const transactionNowMs = clock.nowMs();
    const reservation = command.reservation;
    const transition = command.materialization;
    const reserveOperation = operationRecord(
      reservation.operationId,
      'reserve-attempt',
      reservation.attempt.id,
      reservation.attempt.createdAtMs
    );
    const transitionOperation = operationRecord(
      transition.operationId,
      'transition-attempt',
      transition.attemptId,
      transition.atMs
    );
    const reserveStatus = inspectJournalOperation(database, reserveOperation);
    if (reserveStatus.type === 'err') return reserveStatus;
    const transitionStatus = inspectJournalOperation(database, transitionOperation);
    if (transitionStatus.type === 'err') return transitionStatus;
    const byReserveOperation = readAttemptByReserveOperation(database, reservation.operationId.value);
    if (byReserveOperation.type === 'err') return byReserveOperation;
    const byAttemptId = readAttemptInDatabase(database, reservation.attempt.id);
    if (byAttemptId.type === 'err') return byAttemptId;
    const transitionEvent = readAttemptTransitionByOperation(database, transition.operationId.value);
    if (transitionEvent.type === 'err') return transitionEvent;
    const persistedAdmission = readGrantQualifiedMaterializingAttemptInDatabase(
      database,
      reservation.attempt.id
    );
    if (persistedAdmission.type === 'err') return persistedAdmission;

    const reserveRegistered = reserveStatus.value === 'registered';
    const transitionRegistered = transitionStatus.value === 'registered';
    if (reserveRegistered || transitionRegistered) {
      if (!reserveRegistered || !transitionRegistered || byReserveOperation.value === null ||
          byAttemptId.value === null || transitionEvent.value === null || persistedAdmission.value === null) {
        return recoveryRequired('The atomic materializing reservation has incomplete durable evidence.');
      }
      const exactReplay = replayableMaterializingAttempt(byAttemptId.value, command) &&
        sameInitialAttemptReservation(byReserveOperation.value, reservation.attempt) &&
        sameInitialAttemptReservation(byAttemptId.value, reservation.attempt) &&
        sameTransition(transitionEvent.value, transition) && transitionEvent.value.resultingVersion === 2 &&
        sameGrantQualifiedAuthority(persistedAdmission.value.authority, command.authority) &&
        sameGrantQualifiedAdmission(persistedAdmission.value.admission, command.admission);
      if (!exactReplay) {
        return conflict('The request identity is already bound to a different materializing reservation.');
      }
      const grant = readGrantInDatabase(database, command.authority.grantId);
      if (grant.type === 'err') return grant;
      return exactGrantForMaterializingReservation(grant.value, command, transactionNowMs)
        ? journalOk({ status: 'already-committed', record: persistedAdmission.value })
        : authorityStale('The committed materializing reservation no longer has current grant authority.');
    }

    if (byReserveOperation.value !== null || transitionEvent.value !== null || persistedAdmission.value !== null) {
      return recoveryRequired('Atomic materializing reservation records exist without operation evidence.');
    }
    if (byAttemptId.value !== null) {
      return conflict('The process attempt identity is already bound to a different reservation.');
    }
    const grant = readGrantInDatabase(database, command.authority.grantId);
    if (grant.type === 'err') return grant;
    if (!exactGrantForMaterializingReservation(grant.value, command, transactionNowMs)) {
      return authorityStale('The materializing attempt exceeds current exact grant authority.');
    }

    registerJournalOperation(database, reserveOperation);
    insertAttempt(database, reservation.attempt);
    registerJournalOperation(database, transitionOperation);
    const changed = preparedRun(database, `UPDATE attempts SET
        state = 'materializing', state_version = 2, updated_at_ms = ?, receiver_correlation = ?
      WHERE attempt_id = ? AND state = 'reserved' AND state_version = 1`, [
      transition.atMs,
      transition.receiverCorrelation.value,
      transition.attemptId
    ]);
    if (changed !== 1) return conflict('The reserved attempt changed before materialization admission.');
    preparedRun(database, `INSERT INTO attempt_transitions (
        operation_id, attempt_id, expected_state, next_state, at_ms, receiver_correlation, resulting_version
      ) VALUES (?, ?, 'reserved', 'materializing', ?, ?, 2)`, [
      transition.operationId.value,
      transition.attemptId,
      transition.atMs,
      transition.receiverCorrelation.value
    ]);
    insertGrantQualifiedLaunchAdmission(database, command);
    return journalOk({ status: 'committed', record: materializingReservationOutcome(command) });
  }
).immediate();

const bootstrapBindingOutcomeRecord = (
  attempt: AttemptJournalRecord,
  event: BootstrapAttemptBindingEventRow
): BootstrapAttemptJournalRecord => ({
  ...attempt,
  receiverCorrelation: event.receiverCorrelation,
  state: event.expectedState,
  stateVersion: event.resultingVersion,
  updatedAtMs: event.atMs,
  bootstrapBinding: event.binding
});

const writeCurrentBootstrapBinding = (
  database: Database,
  command: BindBootstrapAttempt
): number => {
  const binding = command.binding;
  if (command.mode === 'initial') {
    preparedRun(database, `INSERT INTO bootstrap_attempt_bindings (
        attempt_id, binding_format, binding_generation, grant_id, grant_generation, receiver_id,
        receiver_entry_identity, helper_parent_process_id, helper_parent_process_incarnation, recipe_locator
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
      command.attemptId,
      binding.format,
      binding.bindingGeneration,
      binding.grantId,
      binding.grantGeneration,
      binding.receiverId,
      binding.receiverEntryIdentity.value,
      binding.helperParentProcessId,
      binding.helperParentProcessIncarnation.value,
      binding.recipeLocator.value
    ]);
    return 1;
  }
  return preparedRun(database, `UPDATE bootstrap_attempt_bindings SET
      binding_format = ?, binding_generation = ?, grant_id = ?, grant_generation = ?, receiver_id = ?,
      receiver_entry_identity = ?, helper_parent_process_id = ?, helper_parent_process_incarnation = ?,
      recipe_locator = ?
    WHERE attempt_id = ? AND binding_generation = ?`, [
    binding.format,
    binding.bindingGeneration,
    binding.grantId,
    binding.grantGeneration,
    binding.receiverId,
    binding.receiverEntryIdentity.value,
    binding.helperParentProcessId,
    binding.helperParentProcessIncarnation.value,
    binding.recipeLocator.value,
    command.attemptId,
    command.priorBindingGeneration
  ]);
};

const insertBootstrapBindingEvent = (
  database: Database,
  command: BindBootstrapAttempt,
  resultingVersion: number
): void => {
  const binding = command.binding;
  preparedRun(database, `INSERT INTO bootstrap_attempt_binding_events (
      operation_id, attempt_id, mode, expected_attempt_state, expected_attempt_version,
      prior_binding_generation, binding_format, binding_generation, grant_id, grant_generation,
      receiver_id, receiver_entry_identity, helper_parent_process_id, helper_parent_process_incarnation,
      recipe_locator, receiver_correlation, at_ms, resulting_version
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    command.operationId.value,
    command.attemptId,
    command.mode,
    command.expectedState,
    command.expectedStateVersion,
    command.priorBindingGeneration,
    binding.format,
    binding.bindingGeneration,
    binding.grantId,
    binding.grantGeneration,
    binding.receiverId,
    binding.receiverEntryIdentity.value,
    binding.helperParentProcessId,
    binding.helperParentProcessIncarnation.value,
    binding.recipeLocator.value,
    command.receiverCorrelation.value,
    command.atMs,
    resultingVersion
  ]);
};

const bindBootstrapAttemptInDatabase = (
  database: Database,
  command: BindBootstrapAttempt
): JournalResult<JournalMutation<BootstrapAttemptJournalRecord>> => database.transaction(
  (): JournalResult<JournalMutation<BootstrapAttemptJournalRecord>> => {
    const operation = operationRecord(
      command.operationId,
      'bind-bootstrap-attempt',
      command.attemptId,
      command.atMs
    );
    const operationStatus = inspectJournalOperation(database, operation);
    if (operationStatus.type === 'err') return operationStatus;
    const priorEvent = readBootstrapBindingEventByOperation(database, command.operationId.value);
    if (priorEvent.type === 'err') return priorEvent;
    const attempt = readAttemptInDatabase(database, command.attemptId);
    if (attempt.type === 'err') return attempt;
    if (attempt.value === null) return notFound('The process attempt does not exist.');
    if (operationStatus.value === 'registered') {
      return priorEvent.value !== null && sameBootstrapBindingEvent(priorEvent.value, command)
        ? journalOk({
            status: 'already-committed',
            record: bootstrapBindingOutcomeRecord(attempt.value, priorEvent.value)
          })
        : recoveryRequired('A registered bootstrap binding operation has no exact binding history.');
    }
    if (priorEvent.value !== null) {
      return recoveryRequired('Bootstrap binding history exists without its global operation registration.');
    }
    const currentBinding = attempt.value.bootstrapBinding;
    const bindingStateMatches = command.mode === 'initial'
      ? currentBinding === null
      : currentBinding !== null && currentBinding.bindingGeneration === command.priorBindingGeneration;
    if (!bindingStateMatches || attempt.value.state !== command.expectedState ||
        attempt.value.stateVersion !== command.expectedStateVersion || command.atMs < attempt.value.updatedAtMs ||
        command.expectedStateVersion >= Number.MAX_SAFE_INTEGER) {
      return conflict('The process attempt state, version, or binding generation changed before binding.');
    }
    const launchAdmission = readGrantQualifiedAttemptAdmissionInDatabase(
      database,
      command.attemptId,
      command.binding.bindingGeneration
    );
    if (launchAdmission.type === 'err') return launchAdmission;
    if (launchAdmission.value === null || launchAdmission.value.attempt.receiverCorrelation === null ||
        launchAdmission.value.authority.grantId !== command.binding.grantId ||
        launchAdmission.value.authority.grantGeneration !== command.binding.grantGeneration ||
        launchAdmission.value.admission.receiverId !== command.binding.receiverId ||
        launchAdmission.value.admission.receiverEntryIdentity.value !== command.binding.receiverEntryIdentity.value ||
        launchAdmission.value.admission.recipeLocator.value !== command.binding.recipeLocator.value ||
        launchAdmission.value.attempt.receiverCorrelation.value !== command.receiverCorrelation.value ||
        command.atMs >= launchAdmission.value.admission.deadlineAtMs) {
      return conflict('The bootstrap binding differs from the durable launch admission.');
    }
    const grant = readGrantInDatabase(database, command.binding.grantId);
    if (grant.type === 'err') return grant;
    if (grant.value === null || grant.value.state !== 'active' ||
        grant.value.generation !== command.binding.grantGeneration ||
        grant.value.repository !== attempt.value.repository ||
        grant.value.recipeRevision !== attempt.value.recipeRevision ||
        !sameSlots(
          grant.value.credentialBindings.map(binding => binding.slotId),
          launchAdmission.value.authority.credentialSlotIds
        ) ||
        command.atMs < grant.value.issuedAtMs || command.atMs >= grant.value.expiresAtMs) {
      return conflict('The bootstrap attempt binding exceeds current grant authority.');
    }
    const nonterminalLeases = readNonterminalLeasesForAttempt(database, command.attemptId);
    if (nonterminalLeases.type === 'err') return nonterminalLeases;
    if (nonterminalLeases.value.length > 0) {
      return conflict('A process attempt with a nonterminal lease cannot change its bootstrap binding.');
    }
    const resultingVersion = command.expectedStateVersion + 1;
    const changed = preparedRun(database, `UPDATE attempts SET
        state_version = ?, updated_at_ms = ?, receiver_correlation = ?
      WHERE attempt_id = ? AND state = ? AND state_version = ?`, [
      resultingVersion,
      command.atMs,
      command.receiverCorrelation.value,
      command.attemptId,
      command.expectedState,
      command.expectedStateVersion
    ]);
    if (changed !== 1) return conflict('The process attempt changed concurrently before bootstrap binding.');
    registerJournalOperation(database, operation);
    writeCurrentBootstrapBinding(database, command);
    insertBootstrapBindingEvent(database, command, resultingVersion);
    return journalOk({
      status: 'committed',
      record: {
        ...attempt.value,
        receiverCorrelation: command.receiverCorrelation,
        stateVersion: resultingVersion,
        updatedAtMs: command.atMs,
        bootstrapBinding: command.binding
      }
    });
  }
).immediate();

const sameVerifiedWindowsContainmentBinding = (
  left: VerifiedWindowsAttemptContainmentBinding,
  right: VerifiedWindowsAttemptContainmentBinding
): boolean => left.bindingGeneration === right.bindingGeneration &&
  left.processAttemptId === right.processAttemptId && left.repository === right.repository &&
  left.recipeRevision === right.recipeRevision && left.grantId === right.grantId &&
  left.grantGeneration === right.grantGeneration && sameSlots(left.credentialSlotIds, right.credentialSlotIds) &&
  left.grantExpiresAtMs === right.grantExpiresAtMs && left.receiverId === right.receiverId &&
  left.receiverCorrelation.value === right.receiverCorrelation.value &&
  left.receiverEntryIdentity.value === right.receiverEntryIdentity.value &&
  left.receiverSlotIdentity === right.receiverSlotIdentity &&
  left.receiverProcessName === right.receiverProcessName && left.receiverPmId === right.receiverPmId &&
  left.recipeLocator.value === right.recipeLocator.value &&
  left.slotIndependentPlanDigest.value === right.slotIndependentPlanDigest.value &&
  left.launchMetadataDigest === right.launchMetadataDigest && left.deadlineAtMs === right.deadlineAtMs &&
  left.rootProcessId === right.rootProcessId &&
  left.rootProcessIncarnation.value === right.rootProcessIncarnation.value &&
  left.jobIdentity.value === right.jobIdentity.value &&
  left.membershipVerifiedAtMs === right.membershipVerifiedAtMs;

const insertVerifiedWindowsContainment = (
  database: Database,
  operationId: JournalOperationId,
  binding: VerifiedWindowsAttemptContainmentBinding,
  resultingAttemptVersion: number
): void => {
  preparedRun(database, `INSERT INTO verified_windows_attempt_containment_bindings (
      attempt_id, operation_id, binding_format, binding_generation, repository, recipe_revision,
      grant_id, grant_generation, grant_expires_at_ms, receiver_id, receiver_correlation,
      receiver_entry_identity, receiver_slot_identity, receiver_process_name, receiver_pm_id,
      recipe_locator, slot_independent_plan_digest, launch_metadata_digest, deadline_at_ms,
      root_process_id, root_process_incarnation, job_identity, job_policy_format,
      job_extended_limit, job_ui_restrictions, job_breakaway, membership_verified_at_ms,
      resulting_attempt_version
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    binding.processAttemptId,
    operationId.value,
    binding.format,
    binding.bindingGeneration,
    binding.repository,
    binding.recipeRevision,
    binding.grantId,
    binding.grantGeneration,
    binding.grantExpiresAtMs,
    binding.receiverId,
    binding.receiverCorrelation.value,
    binding.receiverEntryIdentity.value,
    binding.receiverSlotIdentity,
    binding.receiverProcessName,
    binding.receiverPmId,
    binding.recipeLocator.value,
    binding.slotIndependentPlanDigest.value,
    binding.launchMetadataDigest,
    binding.deadlineAtMs,
    binding.rootProcessId,
    binding.rootProcessIncarnation.value,
    binding.jobIdentity.value,
    binding.jobPolicy.format,
    binding.jobPolicy.extendedLimit,
    binding.jobPolicy.uiRestrictions,
    binding.jobPolicy.breakaway,
    binding.membershipVerifiedAtMs,
    resultingAttemptVersion
  ]);
  binding.credentialSlotIds.forEach(slotId => {
    preparedRun(database, `INSERT INTO verified_windows_attempt_containment_slots (
        attempt_id, binding_generation, credential_slot_id
      ) VALUES (?, ?, ?)`, [binding.processAttemptId, binding.bindingGeneration, slotId]);
  });
};

const insertBootstrapBindingFromVerifiedContainment = (
  database: Database,
  binding: VerifiedWindowsAttemptContainmentBinding
): void => {
  preparedRun(database, `INSERT INTO bootstrap_attempt_bindings (
      attempt_id, binding_format, binding_generation, grant_id, grant_generation, receiver_id,
      receiver_entry_identity, helper_parent_process_id, helper_parent_process_incarnation, recipe_locator
    ) VALUES (?, 'bootstrap-attempt-binding/v2', ?, ?, ?, ?, ?, ?, ?, ?)`, [
    binding.processAttemptId,
    binding.bindingGeneration,
    binding.grantId,
    binding.grantGeneration,
    binding.receiverId,
    binding.receiverEntryIdentity.value,
    binding.rootProcessId,
    binding.rootProcessIncarnation.value,
    binding.recipeLocator.value
  ]);
};

const containedRecordAfterStart = (
  current: GrantQualifiedMaterializingAttemptRecord,
  binding: VerifiedWindowsAttemptContainmentBinding,
  resultingAttemptVersion: number
): GrantQualifiedContainedAttemptRecord => ({
  ...current,
  attempt: {
    ...current.attempt,
    state: 'running',
    stateVersion: resultingAttemptVersion,
    updatedAtMs: binding.membershipVerifiedAtMs,
    bootstrapBinding: {
      format: 'bootstrap-attempt-binding/v2',
      bindingGeneration: binding.bindingGeneration,
      grantId: binding.grantId,
      grantGeneration: binding.grantGeneration,
      receiverId: binding.receiverId,
      receiverEntryIdentity: binding.receiverEntryIdentity,
      helperParentProcessId: binding.rootProcessId,
      helperParentProcessIncarnation: binding.rootProcessIncarnation,
      recipeLocator: binding.recipeLocator
    }
  },
  containmentBinding: binding
});

const bindVerifiedWindowsContainmentAndStartInDatabase = (
  database: Database,
  command: BindVerifiedWindowsContainmentAndStart
): JournalResult<JournalMutation<GrantQualifiedContainedAttemptRecord>> => database.transaction(
  (): JournalResult<JournalMutation<GrantQualifiedContainedAttemptRecord>> => {
    const binding = command.binding;
    const operation = operationRecord(
      command.operationId,
      'bind-bootstrap-attempt',
      binding.processAttemptId,
      binding.membershipVerifiedAtMs
    );
    const operationStatus = inspectJournalOperation(database, operation);
    if (operationStatus.type === 'err') return operationStatus;
    const current = readGrantQualifiedAttemptInDatabase(database, binding.processAttemptId);
    if (current.type === 'err') return current;
    if (current.value === null) return notFound('The grant-qualified process attempt does not exist.');
    const persisted = readVerifiedWindowsContainmentInDatabase(database, binding.processAttemptId);
    if (persisted.type === 'err') return persisted;
    if (operationStatus.value === 'registered') {
      const contained = readGrantQualifiedContainedAttemptInDatabase(database, binding.processAttemptId);
      return persisted.value !== null && contained.type === 'ok' && contained.value !== null &&
        persisted.value.operationId.value === command.operationId.value &&
        sameVerifiedWindowsContainmentBinding(persisted.value.binding, binding)
        ? journalOk({ status: 'already-committed', record: contained.value })
        : recoveryRequired('A registered Windows containment bind has no exact durable binding.');
    }
    const hasBootstrapReadiness = current.value.attempt.bootstrapBinding !== null;
    if (persisted.value !== null || (hasBootstrapReadiness &&
        !sameContainedBootstrapBinding(current.value.attempt, binding))) {
      return conflict('The process attempt already has a durable process binding.');
    }
    if (current.value.attempt.state !== command.expectedState ||
        current.value.attempt.stateVersion !== command.expectedStateVersion ||
        command.expectedStateVersion >= Number.MAX_SAFE_INTEGER ||
        binding.membershipVerifiedAtMs < current.value.attempt.updatedAtMs ||
        !sameContainedAuthority(current.value, binding)) {
      return conflict('The process attempt or launch authority changed before containment binding.');
    }
    const grant = readGrantInDatabase(database, binding.grantId);
    if (grant.type === 'err') return grant;
    if (grant.value === null || grant.value.state !== 'active' || grant.value.generation !== binding.grantGeneration ||
        grant.value.repository !== binding.repository || grant.value.recipeRevision !== binding.recipeRevision ||
        !sameSlots(grant.value.credentialBindings.map(entry => entry.slotId), binding.credentialSlotIds) ||
        binding.membershipVerifiedAtMs < grant.value.issuedAtMs ||
        binding.membershipVerifiedAtMs >= grant.value.expiresAtMs) {
      return authorityStale('The verified containment binding no longer has current grant authority.');
    }
    const nonterminalLeases = readNonterminalLeasesForAttempt(database, binding.processAttemptId);
    if (nonterminalLeases.type === 'err') return nonterminalLeases;
    if (nonterminalLeases.value.length > 0 && !hasBootstrapReadiness) {
      return conflict('Secret delivery began before the exact process containment binding was durable.');
    }
    const resultingAttemptVersion = command.expectedStateVersion + 1;
    const changed = preparedRun(database, `UPDATE attempts SET
        state = 'running', state_version = ?, updated_at_ms = ?, receiver_correlation = ?
      WHERE attempt_id = ? AND state = 'materializing' AND state_version = ?`, [
      resultingAttemptVersion,
      binding.membershipVerifiedAtMs,
      binding.receiverCorrelation.value,
      binding.processAttemptId,
      command.expectedStateVersion
    ]);
    if (changed !== 1) return conflict('The process attempt changed concurrently before containment binding.');
    registerJournalOperation(database, operation);
    if (!hasBootstrapReadiness) insertBootstrapBindingFromVerifiedContainment(database, binding);
    insertVerifiedWindowsContainment(database, command.operationId, binding, resultingAttemptVersion);
    return journalOk({
      status: 'committed',
      record: containedRecordAfterStart(current.value, binding, resultingAttemptVersion)
    });
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
  updatedAtMs: transition.atMs,
  bootstrapBinding: attempt.bootstrapBinding
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
    const operation = operationRecord(
      command.operationId,
      'transition-attempt',
      command.attemptId,
      command.atMs
    );
    const operationStatus = inspectJournalOperation(database, operation);
    if (operationStatus.type === 'err') return operationStatus;
    const priorTransition = readAttemptTransitionByOperation(database, command.operationId.value);
    if (priorTransition.type === 'err') return priorTransition;
    const attempt = readAttemptInDatabase(database, command.attemptId);
    if (attempt.type === 'err') return attempt;
    if (attempt.value === null) return notFound('The process attempt does not exist.');
    if (operationStatus.value === 'registered') return priorTransition.value !== null &&
      sameTransition(priorTransition.value, command)
      ? journalOk({ status: 'already-committed', record: transitionOutcomeRecord(attempt.value, priorTransition.value) })
      : recoveryRequired('A registered attempt transition has no exact transition history.');
    if (priorTransition.value !== null) {
      return recoveryRequired('Attempt transition history exists without its global operation registration.');
    }
    if (attempt.value.state !== command.expectedState || command.atMs < attempt.value.updatedAtMs ||
        attempt.value.stateVersion >= Number.MAX_SAFE_INTEGER) {
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
    registerJournalOperation(database, operation);
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

const insertLease = (database: Database, lease: LeaseJournalRecord): void => {
  preparedRun(database, `INSERT INTO leases (
      lease_id, operation_id, grant_id, grant_generation, process_attempt_id, receiver_id,
      exposure_correlation, issued_at_ms, expires_at_ms, updated_at_ms,
      cleanup_receipt_id, cleanup_receipt_format, cleanup_proof, cleanup_observed_at_ms, state
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    lease.id.value,
    lease.operationId.value,
    lease.grantId,
    lease.grantGeneration,
    lease.processAttemptId,
    lease.receiverId,
    lease.exposureCorrelation.value,
    lease.issuedAtMs,
    lease.expiresAtMs,
    lease.updatedAtMs,
    lease.cleanupReceipt?.id.value ?? null,
    lease.cleanupReceipt?.format ?? null,
    lease.cleanupReceipt?.proof ?? null,
    lease.cleanupReceipt?.observedAtMs ?? null,
    lease.state
  ]);
};

const createLeaseInDatabase = (
  database: Database,
  command: CreateLease
): JournalResult<JournalMutation<LeaseJournalRecord>> => database.transaction(
  (): JournalResult<JournalMutation<LeaseJournalRecord>> => {
    const operation = operationRecord(
      command.operationId,
      'create-lease',
      command.lease.id.value,
      command.lease.issuedAtMs
    );
    const operationStatus = inspectJournalOperation(database, operation);
    if (operationStatus.type === 'err') return operationStatus;
    const existing = readLeaseByOperation(database, command.operationId.value);
    if (existing.type === 'err') return existing;
    if (operationStatus.value === 'registered') return existing.value !== null &&
      sameLeaseCreationIdentity(existing.value, command.lease)
      ? journalOk({ status: 'already-committed', record: existing.value })
      : recoveryRequired('A registered lease creation has no exact lease record.');
    if (existing.value !== null) {
      return recoveryRequired('A lease record exists without its global operation registration.');
    }
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
    const nonterminal = readNonterminalLeaseForGrantAttempt(
      database,
      command.lease.grantId,
      command.lease.grantGeneration,
      command.lease.processAttemptId
    );
    if (nonterminal.type === 'err') return nonterminal;
    if (nonterminal.value !== null) {
      return conflict('A nonterminal lease already exists for this grant generation and process attempt.');
    }
    registerJournalOperation(database, operation);
    insertLease(database, command.lease);
    return journalOk({ status: 'committed', record: command.lease });
  }
).immediate();

const insertBootstrapClaim = (database: Database, command: ClaimAuthorizedBootstrapLease): void => {
  const { binding } = command.expectedAttempt;
  preparedRun(database, `INSERT INTO bootstrap_lease_claims (
      operation_id, lease_id, attempt_id, exchange_id, expected_attempt_state, expected_attempt_version,
      expected_binding_generation, expected_grant_id, expected_grant_generation, expected_receiver_id,
      expected_receiver_entry_identity, expected_helper_parent_process_id,
      expected_helper_parent_process_incarnation,
      expected_recipe_locator
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    command.operationId.value,
    command.lease.id.value,
    command.expectedAttempt.id,
    command.exchangeId.value,
    command.expectedAttempt.state,
    command.expectedAttempt.stateVersion,
    binding.bindingGeneration,
    binding.grantId,
    binding.grantGeneration,
    binding.receiverId,
    binding.receiverEntryIdentity.value,
    binding.helperParentProcessId,
    binding.helperParentProcessIncarnation.value,
    binding.recipeLocator.value
  ]);
};

const claimAuthorizedBootstrapLeaseInDatabase = (
  database: Database,
  command: ClaimAuthorizedBootstrapLease
): JournalResult<JournalMutation<LeaseJournalRecord>> => database.transaction(
  (): JournalResult<JournalMutation<LeaseJournalRecord>> => {
    const recoveredClaim = readBootstrapClaimByExchange(database, command.expectedAttempt.id, command.exchangeId);
    if (recoveredClaim.type === 'err') return recoveredClaim;
    if (recoveredClaim.value !== null) {
      const recoveredLease = readLeaseInDatabase(database, recoveredClaim.value.leaseId.value);
      if (recoveredLease.type === 'err') return recoveredLease;
      if (recoveredLease.value === null) {
        return recoveryRequired('A bootstrap exchange claim has no durable lease record.');
      }
      const recoveredOperation = inspectJournalOperation(database, operationRecord(
        recoveredClaim.value.operationId,
        'claim-bootstrap-lease',
        recoveredClaim.value.leaseId.value,
        recoveredLease.value.issuedAtMs
      ));
      if (recoveredOperation.type === 'err') return recoveredOperation;
      if (recoveredOperation.value !== 'registered') {
        return recoveryRequired('The bootstrap exchange claim has no global operation registration.');
      }
      return sameBootstrapClaim(recoveredClaim.value, command) && sameLeaseCreationIdentity(recoveredLease.value, {
        ...command.lease,
        issuedAtMs: recoveredLease.value.issuedAtMs,
        expiresAtMs: recoveredLease.value.expiresAtMs
      })
        ? journalOk({ status: 'already-committed', record: recoveredLease.value })
        : conflict('The bootstrap exchange is already bound to a different durable lease claim.');
    }
    const operation = operationRecord(
      command.operationId,
      'claim-bootstrap-lease',
      command.lease.id.value,
      command.lease.issuedAtMs
    );
    const operationStatus = inspectJournalOperation(database, operation);
    if (operationStatus.type === 'err') return operationStatus;
    const priorClaim = readBootstrapClaimByOperation(database, command.operationId.value);
    if (priorClaim.type === 'err') return priorClaim;
    if (operationStatus.value === 'registered') {
      if (priorClaim.value === null) {
        return recoveryRequired('A registered bootstrap claim has no claim history.');
      }
      const priorLease = readLeaseInDatabase(database, priorClaim.value.leaseId.value);
      if (priorLease.type === 'err') return priorLease;
      return priorLease.value !== null && sameLeaseCreationIdentity(priorLease.value, command.lease) &&
        sameBootstrapClaim(priorClaim.value, command)
        ? journalOk({ status: 'already-committed', record: priorLease.value })
        : conflict('The journal operation id is already bound to a different bootstrap lease claim.');
    }
    if (priorClaim.value !== null) {
      return recoveryRequired('Bootstrap claim history exists without its global operation registration.');
    }
    const leaseByOperation = readLeaseByOperation(database, command.operationId.value);
    if (leaseByOperation.type === 'err') return leaseByOperation;
    if (leaseByOperation.value !== null) {
      return recoveryRequired('A lease exists without its global bootstrap claim operation registration.');
    }
    const grant = readGrantInDatabase(database, command.lease.grantId);
    if (grant.type === 'err') return grant;
    const attempt = readAttemptInDatabase(database, command.expectedAttempt.id);
    if (attempt.type === 'err') return attempt;
    if (grant.value === null || attempt.value === null || attempt.value.bootstrapBinding === null) {
      return conflict('The bootstrap grant or bound process attempt does not exist.');
    }
    const binding = attempt.value.bootstrapBinding;
    if (grant.value.state !== 'active' || grant.value.generation !== command.lease.grantGeneration ||
        grant.value.id !== binding.grantId || grant.value.generation !== binding.grantGeneration ||
        grant.value.repository !== attempt.value.repository || grant.value.recipeRevision !== attempt.value.recipeRevision ||
        command.lease.processAttemptId !== attempt.value.id || attempt.value.state !== command.expectedAttempt.state ||
        attempt.value.stateVersion !== command.expectedAttempt.stateVersion ||
        !sameBootstrapBinding(binding, command.expectedAttempt.binding) ||
        command.lease.issuedAtMs < grant.value.issuedAtMs || command.lease.expiresAtMs > grant.value.expiresAtMs) {
      return conflict('The bootstrap grant, attempt state, or binding generation changed before claim.');
    }
    const nonterminal = readNonterminalLeaseForGrantAttempt(
      database,
      command.lease.grantId,
      command.lease.grantGeneration,
      command.lease.processAttemptId
    );
    if (nonterminal.type === 'err') return nonterminal;
    if (nonterminal.value !== null) {
      const existingClaim = readBootstrapClaimByLease(database, nonterminal.value.id.value);
      if (existingClaim.type === 'err') return existingClaim;
      return existingClaim.value === null
        ? conflict('A generic nonterminal lease already owns this grant and process attempt.')
        : existingClaim.value.exchangeId.value === command.exchangeId.value
          ? recoveryRequired('The bootstrap exchange exists under a different registered command identity.')
          : conflict('A different bootstrap exchange already owns the nonterminal lease.');
    }
    registerJournalOperation(database, operation);
    insertLease(database, command.lease);
    insertBootstrapClaim(database, command);
    return journalOk({ status: 'committed', record: command.lease });
  }
).immediate();

const sameLeaseTransition = (left: LeaseTransitionRow, right: TransitionLease): boolean =>
  left.operationId.value === right.operationId.value && left.leaseId.value === right.leaseId.value &&
  left.exposureCorrelation.value === right.exposureCorrelation.value &&
  left.expectedState === right.expectedState && left.nextState === right.nextState && left.atMs === right.atMs &&
  (left.cleanupReceipt === null || right.cleanupReceipt === null
    ? left.cleanupReceipt === right.cleanupReceipt
    : left.cleanupReceipt.id.value === right.cleanupReceipt.id.value &&
      left.cleanupReceipt.exposureCorrelation.value === right.cleanupReceipt.exposureCorrelation.value &&
      left.cleanupReceipt.receiverId === right.cleanupReceipt.receiverId &&
      left.cleanupReceipt.processAttemptId === right.cleanupReceipt.processAttemptId &&
      left.cleanupReceipt.observedAtMs === right.cleanupReceipt.observedAtMs);

const leaseTransitionOutcome = (
  lease: LeaseJournalRecord,
  transition: LeaseTransitionRow
): LeaseJournalRecord => ({
  id: lease.id,
  operationId: lease.operationId,
  grantId: lease.grantId,
  grantGeneration: lease.grantGeneration,
  processAttemptId: lease.processAttemptId,
  receiverId: lease.receiverId,
  exposureCorrelation: lease.exposureCorrelation,
  issuedAtMs: lease.issuedAtMs,
  expiresAtMs: lease.expiresAtMs,
  updatedAtMs: transition.atMs,
  cleanupReceipt: transition.cleanupReceipt,
  state: transition.nextState
});

const transitionLeaseInDatabase = (
  database: Database,
  command: TransitionLease
): JournalResult<JournalMutation<LeaseJournalRecord>> => database.transaction(
  (): JournalResult<JournalMutation<LeaseJournalRecord>> => {
    const operation = operationRecord(
      command.operationId,
      'transition-lease',
      command.leaseId.value,
      command.atMs
    );
    const operationStatus = inspectJournalOperation(database, operation);
    if (operationStatus.type === 'err') return operationStatus;
    const priorTransition = readLeaseTransitionByOperation(database, command.operationId.value);
    if (priorTransition.type === 'err') return priorTransition;
    const lease = readLeaseInDatabase(database, command.leaseId.value);
    if (lease.type === 'err') return lease;
    if (lease.value === null) return notFound('The secret lease does not exist.');
    if (operationStatus.value === 'registered') {
      return priorTransition.value !== null && sameLeaseTransition(priorTransition.value, command)
        ? journalOk({
            status: 'already-committed',
            record: leaseTransitionOutcome(lease.value, priorTransition.value)
          })
        : recoveryRequired('A registered lease transition has no exact transition history.');
    }
    if (priorTransition.value !== null) {
      return recoveryRequired('Lease transition history exists without its global operation registration.');
    }
    const beginsDelivery = command.expectedState === 'authorized' && command.nextState === 'delivering';
    if (lease.value.state !== command.expectedState ||
        lease.value.exposureCorrelation.value !== command.exposureCorrelation.value ||
        command.atMs < lease.value.updatedAtMs ||
        (beginsDelivery && command.atMs >= lease.value.expiresAtMs)) {
      return conflict('The secret lease state or lifetime changed before this transition.');
    }
    if (command.cleanupReceipt !== null &&
        (command.cleanupReceipt.exposureCorrelation.value !== lease.value.exposureCorrelation.value ||
          command.cleanupReceipt.receiverId !== lease.value.receiverId ||
          command.cleanupReceipt.processAttemptId !== lease.value.processAttemptId)) {
      return conflict('The cleanup receipt does not identify the exact secret-exposure process tree.');
    }
    if (command.expectedState !== 'authorized') {
      const producingTransition = readTransitionProducingCurrentLeaseState(database, lease.value);
      if (producingTransition.type === 'err') return producingTransition;
      if (producingTransition.value === null) {
        return recoveryRequired('The current secret-exposure state has no exact transition history.');
      }
    }
    const changes = preparedRun(database, `UPDATE leases
        SET state = ?, updated_at_ms = ?, cleanup_receipt_id = ?, cleanup_receipt_format = ?,
          cleanup_proof = ?, cleanup_observed_at_ms = ?
        WHERE lease_id = ? AND state = ? AND exposure_correlation = ?`, [
      command.nextState,
      command.atMs,
      command.cleanupReceipt?.id.value ?? null,
      command.cleanupReceipt?.format ?? null,
      command.cleanupReceipt?.proof ?? null,
      command.cleanupReceipt?.observedAtMs ?? null,
      command.leaseId.value,
      command.expectedState,
      command.exposureCorrelation.value
    ]);
    if (changes !== 1) return conflict('The secret lease changed concurrently.');
    registerJournalOperation(database, operation);
    preparedRun(database, `INSERT INTO lease_transitions (
        operation_id, lease_id, exposure_correlation, expected_state, next_state, at_ms,
        cleanup_receipt_id, cleanup_receipt_format, cleanup_proof, cleanup_observed_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
      command.operationId.value,
      command.leaseId.value,
      command.exposureCorrelation.value,
      command.expectedState,
      command.nextState,
      command.atMs,
      command.cleanupReceipt?.id.value ?? null,
      command.cleanupReceipt?.format ?? null,
      command.cleanupReceipt?.proof ?? null,
      command.cleanupReceipt?.observedAtMs ?? null
    ]);
    return journalOk({
      status: 'committed',
      record: {
        ...lease.value,
        updatedAtMs: command.atMs,
        cleanupReceipt: command.cleanupReceipt,
        state: command.nextState
      }
    });
  }
).immediate();

const decodeVerifiedWindowsTerminalCleanup = (
  row: unknown
): JournalResult<VerifiedWindowsTerminalCleanupRecord> => {
  if (!isRecord(row)) return corrupt();
  const operationId = parseOperationIdRow(row['operation_id']);
  const processAttemptId = parseProcessAttemptIdRow(row['attempt_id']);
  const bindingGeneration = parsePositiveInteger(row['binding_generation']);
  const jobIdentity = parseDurableWindowsNamedJobIdentityRow(row['job_identity']);
  const rootProcessId = parsePositiveInteger(row['root_process_id']);
  const rootProcessIncarnation = parseProcessIncarnationRow(row['root_process_incarnation']);
  const treeObservedAtMs = parseSafeInteger(row['tree_observed_at_ms']);
  const receiverId = parseReceiverIdRow(row['receiver_id']);
  const receiverCorrelation = parseReceiverCorrelationRow(row['receiver_correlation']);
  const receiverSlotIdentity = parseText(row['receiver_slot_identity'], 128);
  const receiverProcessName = parseText(row['receiver_process_name'], 128);
  const receiverPmId = parseSafeInteger(row['receiver_pm_id']);
  const launchMetadataDigest = parseText(row['launch_metadata_digest'], 64);
  const pm2DeletedAtMs = parseSafeInteger(row['pm2_deleted_at_ms']);
  const closedExposureCount = parseSafeInteger(row['closed_exposure_count']);
  const cleanedAtMs = parseSafeInteger(row['cleaned_at_ms']);
  if (operationId.type === 'err' || processAttemptId.type === 'err' || bindingGeneration.type === 'err' ||
      jobIdentity.type === 'err' || rootProcessId.type === 'err' || rootProcessIncarnation.type === 'err' ||
      treeObservedAtMs.type === 'err' || receiverId.type === 'err' || receiverCorrelation.type === 'err' ||
      receiverSlotIdentity.type === 'err' || receiverProcessName.type === 'err' || receiverPmId.type === 'err' ||
      launchMetadataDigest.type === 'err' || pm2DeletedAtMs.type === 'err' ||
      closedExposureCount.type === 'err' || cleanedAtMs.type === 'err') return corrupt();
  const terminalDisposition = row['terminal_disposition'];
  const treeBasis = row['tree_cleanup_basis'];
  const deletionDisposition = row['pm2_deletion_disposition'];
  if ((terminalDisposition !== 'succeeded' && terminalDisposition !== 'failed' &&
      terminalDisposition !== 'cancelled') ||
      (treeBasis !== 'job-terminated-empty' && treeBasis !== 'job-already-empty' &&
        treeBasis !== 'job-missing-root-exited') ||
      (deletionDisposition !== 'deleted' && deletionDisposition !== 'already-absent')) return corrupt();
  const cleanup: VerifiedWindowsTerminalCleanupRecord = {
    format: 'verified-windows-terminal-cleanup/v1',
    operationId: operationId.value,
    processAttemptId: processAttemptId.value,
    bindingGeneration: bindingGeneration.value,
    terminalDisposition,
    treeCleanup: {
      format: 'verified-windows-tree-cleanup/v1',
      proof: 'exact-tree-empty',
      basis: treeBasis,
      jobIdentity: jobIdentity.value,
      rootProcessId: rootProcessId.value,
      rootProcessIncarnation: rootProcessIncarnation.value,
      observedAtMs: treeObservedAtMs.value
    },
    pm2Deletion: {
      format: 'pm2-exact-record-deletion/v1',
      disposition: deletionDisposition,
      receiverId: receiverId.value,
      receiverCorrelation: receiverCorrelation.value,
      receiverSlotIdentity: receiverSlotIdentity.value,
      receiverProcessName: receiverProcessName.value,
      receiverPmId: receiverPmId.value,
      processAttemptId: processAttemptId.value,
      launchMetadataDigest: launchMetadataDigest.value,
      deletedAtMs: pm2DeletedAtMs.value
    },
    closedExposureCount: closedExposureCount.value,
    cleanedAtMs: cleanedAtMs.value
  };
  return row['cleanup_format'] === cleanup.format &&
    row['tree_cleanup_format'] === cleanup.treeCleanup.format &&
    row['tree_cleanup_proof'] === cleanup.treeCleanup.proof &&
    row['pm2_deletion_format'] === cleanup.pm2Deletion.format &&
    validateVerifiedWindowsTerminalCleanupFinalization({
      cleanup,
      expectedAttemptState: 'recovery-required',
      expectedAttemptStateVersion: 1
    }).type === 'ok'
    ? journalOk(cleanup)
    : corrupt();
};

const readVerifiedWindowsTerminalCleanupInDatabase = (
  database: Database,
  id: ProcessAttemptId
): JournalResult<VerifiedWindowsTerminalCleanupRecord | null> => {
  const row = preparedGet<unknown>(database, `SELECT * FROM verified_windows_terminal_cleanups
    WHERE attempt_id = ?`, [id]);
  return row === null ? journalOk(null) : decodeVerifiedWindowsTerminalCleanup(row);
};

const sameVerifiedWindowsTerminalCleanup = (
  left: VerifiedWindowsTerminalCleanupRecord,
  right: VerifiedWindowsTerminalCleanupRecord
): boolean => left.operationId.value === right.operationId.value &&
  left.processAttemptId === right.processAttemptId && left.bindingGeneration === right.bindingGeneration &&
  left.terminalDisposition === right.terminalDisposition && left.treeCleanup.basis === right.treeCleanup.basis &&
  left.treeCleanup.jobIdentity.value === right.treeCleanup.jobIdentity.value &&
  left.treeCleanup.rootProcessId === right.treeCleanup.rootProcessId &&
  left.treeCleanup.rootProcessIncarnation.value === right.treeCleanup.rootProcessIncarnation.value &&
  left.treeCleanup.observedAtMs === right.treeCleanup.observedAtMs &&
  left.pm2Deletion.disposition === right.pm2Deletion.disposition &&
  left.pm2Deletion.receiverId === right.pm2Deletion.receiverId &&
  left.pm2Deletion.receiverCorrelation.value === right.pm2Deletion.receiverCorrelation.value &&
  left.pm2Deletion.receiverSlotIdentity === right.pm2Deletion.receiverSlotIdentity &&
  left.pm2Deletion.receiverProcessName === right.pm2Deletion.receiverProcessName &&
  left.pm2Deletion.receiverPmId === right.pm2Deletion.receiverPmId &&
  left.pm2Deletion.processAttemptId === right.pm2Deletion.processAttemptId &&
  left.pm2Deletion.launchMetadataDigest === right.pm2Deletion.launchMetadataDigest &&
  left.pm2Deletion.deletedAtMs === right.pm2Deletion.deletedAtMs &&
  left.closedExposureCount === right.closedExposureCount && left.cleanedAtMs === right.cleanedAtMs;

const cleanupMatchesContainment = (
  cleanup: VerifiedWindowsTerminalCleanupRecord,
  binding: VerifiedWindowsAttemptContainmentBinding
): boolean => cleanup.processAttemptId === binding.processAttemptId &&
  cleanup.bindingGeneration === binding.bindingGeneration &&
  cleanup.treeCleanup.jobIdentity.value === binding.jobIdentity.value &&
  cleanup.treeCleanup.rootProcessId === binding.rootProcessId &&
  cleanup.treeCleanup.rootProcessIncarnation.value === binding.rootProcessIncarnation.value &&
  cleanup.treeCleanup.observedAtMs >= binding.membershipVerifiedAtMs &&
  cleanup.pm2Deletion.receiverId === binding.receiverId &&
  cleanup.pm2Deletion.receiverCorrelation.value === binding.receiverCorrelation.value &&
  cleanup.pm2Deletion.receiverSlotIdentity === binding.receiverSlotIdentity &&
  cleanup.pm2Deletion.receiverProcessName === binding.receiverProcessName &&
  cleanup.pm2Deletion.receiverPmId === binding.receiverPmId &&
  cleanup.pm2Deletion.processAttemptId === binding.processAttemptId &&
  cleanup.pm2Deletion.launchMetadataDigest === binding.launchMetadataDigest;

const countClosedExposuresForAttempt = (database: Database, id: ProcessAttemptId): JournalResult<number> => {
  const row = preparedGet<unknown>(database, `SELECT COUNT(*) AS count FROM leases
    WHERE process_attempt_id = ? AND state = 'closed'`, [id]);
  return isRecord(row) ? parseSafeInteger(row['count']) : corrupt();
};

const insertVerifiedWindowsTerminalCleanup = (
  database: Database,
  cleanup: VerifiedWindowsTerminalCleanupRecord
): void => {
  preparedRun(database, `INSERT INTO verified_windows_terminal_cleanups (
      attempt_id, operation_id, cleanup_format, binding_generation, terminal_disposition,
      tree_cleanup_format, tree_cleanup_proof, tree_cleanup_basis, job_identity,
      root_process_id, root_process_incarnation, tree_observed_at_ms,
      pm2_deletion_format, pm2_deletion_disposition, receiver_id, receiver_correlation,
      receiver_slot_identity, receiver_process_name, receiver_pm_id, launch_metadata_digest,
      pm2_deleted_at_ms, closed_exposure_count, cleaned_at_ms
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    cleanup.processAttemptId,
    cleanup.operationId.value,
    cleanup.format,
    cleanup.bindingGeneration,
    cleanup.terminalDisposition,
    cleanup.treeCleanup.format,
    cleanup.treeCleanup.proof,
    cleanup.treeCleanup.basis,
    cleanup.treeCleanup.jobIdentity.value,
    cleanup.treeCleanup.rootProcessId,
    cleanup.treeCleanup.rootProcessIncarnation.value,
    cleanup.treeCleanup.observedAtMs,
    cleanup.pm2Deletion.format,
    cleanup.pm2Deletion.disposition,
    cleanup.pm2Deletion.receiverId,
    cleanup.pm2Deletion.receiverCorrelation.value,
    cleanup.pm2Deletion.receiverSlotIdentity,
    cleanup.pm2Deletion.receiverProcessName,
    cleanup.pm2Deletion.receiverPmId,
    cleanup.pm2Deletion.launchMetadataDigest,
    cleanup.pm2Deletion.deletedAtMs,
    cleanup.closedExposureCount,
    cleanup.cleanedAtMs
  ]);
};

const finalizeVerifiedWindowsTerminalCleanupInDatabase = (
  database: Database,
  command: FinalizeVerifiedWindowsTerminalCleanup
): JournalResult<JournalMutation<VerifiedWindowsTerminalCleanupRecord>> => database.transaction(
  (): JournalResult<JournalMutation<VerifiedWindowsTerminalCleanupRecord>> => {
    const cleanup = command.cleanup;
    const operation = operationRecord(
      cleanup.operationId,
      'transition-attempt',
      cleanup.processAttemptId,
      cleanup.cleanedAtMs
    );
    const operationStatus = inspectJournalOperation(database, operation);
    if (operationStatus.type === 'err') return operationStatus;
    const existing = readVerifiedWindowsTerminalCleanupInDatabase(database, cleanup.processAttemptId);
    if (existing.type === 'err') return existing;
    if (operationStatus.value === 'registered') return existing.value !== null &&
      sameVerifiedWindowsTerminalCleanup(existing.value, cleanup)
      ? journalOk({ status: 'already-committed', record: existing.value })
      : recoveryRequired('A registered terminal cleanup has no exact durable cleanup record.');
    if (existing.value !== null) {
      return recoveryRequired('A terminal cleanup record exists without its global operation registration.');
    }
    const contained = readGrantQualifiedContainedAttemptInDatabase(database, cleanup.processAttemptId);
    if (contained.type === 'err') return contained;
    if (contained.value === null) return notFound('The verified Windows process containment binding is missing.');
    if (contained.value.attempt.state === 'cleaned') {
      return recoveryRequired('The attempt was marked cleaned without exact terminal cleanup evidence.');
    }
    if (contained.value.attempt.state !== command.expectedAttemptState ||
        contained.value.attempt.stateVersion !== command.expectedAttemptStateVersion ||
        cleanup.cleanedAtMs < contained.value.attempt.updatedAtMs ||
        command.expectedAttemptStateVersion >= Number.MAX_SAFE_INTEGER ||
        !cleanupMatchesContainment(cleanup, contained.value.containmentBinding)) {
      return conflict('The process attempt or containment binding changed before terminal cleanup finalization.');
    }
    const nonterminal = readNonterminalLeasesForAttempt(database, cleanup.processAttemptId);
    if (nonterminal.type === 'err') return nonterminal;
    if (nonterminal.value.length > 0) {
      return conflict('A nonterminal secret exposure remains after process-tree cleanup.');
    }
    const closedCount = countClosedExposuresForAttempt(database, cleanup.processAttemptId);
    if (closedCount.type === 'err') return closedCount;
    if (closedCount.value !== cleanup.closedExposureCount) {
      return conflict('The terminal cleanup exposure count differs from durable lease state.');
    }
    const nextVersion = command.expectedAttemptStateVersion + 1;
    const changed = preparedRun(database, `UPDATE attempts SET
        state = 'cleaned', state_version = ?, updated_at_ms = ?
      WHERE attempt_id = ? AND state = ? AND state_version = ?`, [
      nextVersion,
      cleanup.cleanedAtMs,
      cleanup.processAttemptId,
      command.expectedAttemptState,
      command.expectedAttemptStateVersion
    ]);
    if (changed !== 1) return conflict('The process attempt changed concurrently before cleanup finalization.');
    registerJournalOperation(database, operation);
    insertVerifiedWindowsTerminalCleanup(database, cleanup);
    return journalOk({ status: 'committed', record: cleanup });
  }
).immediate();

const consumeTransferInDatabase = (
  database: Database,
  command: ConsumeTransfer
): JournalResult<JournalMutation<TransferReplayRecord>> => database.transaction(
  (): JournalResult<JournalMutation<TransferReplayRecord>> => {
    const operation = operationRecord(
      command.operationId,
      'consume-transfer',
      command.transfer.id.value,
      command.transfer.consumedAtMs
    );
    const operationStatus = inspectJournalOperation(database, operation);
    if (operationStatus.type === 'err') return operationStatus;
    const byOperation = readTransferByOperation(database, command.operationId.value);
    if (byOperation.type === 'err') return byOperation;
    if (operationStatus.value === 'registered') {
      return byOperation.value !== null && sameTransfer(byOperation.value, command.transfer)
        ? journalOk({ status: 'already-committed', record: byOperation.value })
        : recoveryRequired('A registered transfer consumption has no exact replay record.');
    }
    if (byOperation.value !== null) {
      return recoveryRequired('A transfer replay record exists without its global operation registration.');
    }
    const byTransfer = readTransferInDatabase(database, command.transfer.id.value);
    if (byTransfer.type === 'err') return byTransfer;
    if (byTransfer.value !== null) return journalErr({
      code: 'transfer-replayed',
      message: 'The encrypted-cartridge transfer was already consumed.'
    });
    const grant = readGrantInDatabase(database, command.transfer.destinationGrantId);
    if (grant.type === 'err') return grant;
    if (grant.value === null || grant.value.state !== 'active' ||
        grant.value.expiresAtMs <= command.transfer.consumedAtMs) {
      return conflict('The transfer destination grant is unavailable.');
    }
    registerJournalOperation(database, operation);
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

type MigrationIdentity = Readonly<{
  version: number;
  checksum: string;
}>;

const admittedMigrations: readonly MigrationIdentity[] = [
  { version: 1, checksum: SCHEMA_V1_CHECKSUM },
  { version: 2, checksum: SCHEMA_V2_CHECKSUM },
  { version: 3, checksum: SCHEMA_V3_CHECKSUM },
  { version: 4, checksum: SCHEMA_V4_CHECKSUM },
  { version: 5, checksum: SCHEMA_V5_CHECKSUM },
  { version: 6, checksum: SCHEMA_V6_CHECKSUM }
];

const migrationRowMatches = (row: unknown, expected: MigrationIdentity): boolean => {
  if (!isRecord(row)) return false;
  const version = parsePositiveInteger(row['version']);
  const appliedAtMs = parseSafeInteger(row['applied_at_ms']);
  const applicationVersion = parseText(row['application_version'], 128);
  return version.type === 'ok' && appliedAtMs.type === 'ok' && applicationVersion.type === 'ok' &&
    version.value === expected.version && row['checksum'] === expected.checksum;
};

const verifyMigrationHistory = (database: Database, expectedVersion: number): JournalResult<void> => {
  const exists = migrationTableExists(database);
  if (exists.type === 'err') return exists;
  if (!exists.value) return recoveryRequired('The authority schema marker exists without its migration evidence.');
  const rows = preparedAll<unknown>(
    database,
    'SELECT version, checksum, application_version, applied_at_ms FROM schema_migrations ORDER BY version',
    []
  );
  const expected = admittedMigrations.filter(migration => migration.version <= expectedVersion);
  if (rows.length !== expected.length ||
      !rows.every((row, index) => expected[index] !== undefined && migrationRowMatches(row, expected[index]))) {
    return recoveryRequired('The authority migration history does not match the admitted schema.');
  }
  return journalOk(undefined);
};

const canonicalSchemaSql = (sql: string): string => sql
  .replaceAll(/\s+/gu, ' ')
  .replaceAll(/\s*([(),])\s*/gu, '$1')
  .trim();

const isReplacedLeaseSchemaStatement = (sql: string): boolean => {
  const normalized = sql.trimStart();
  return normalized.startsWith('CREATE TABLE leases (') ||
    normalized.startsWith('CREATE TABLE lease_transitions (') ||
    normalized.startsWith('CREATE UNIQUE INDEX leases_one_nonterminal_per_grant_attempt');
};

const expectedSchemaSql = (version: number): readonly string[] => {
  const priorStatements = [
    ...SCHEMA_V1_STATEMENTS,
    ...(version >= 2 ? SCHEMA_V2_SCHEMA_STATEMENTS : []),
    ...(version >= 3 ? SCHEMA_V3_SCHEMA_STATEMENTS : []),
    ...(version >= 4 ? SCHEMA_V4_SCHEMA_STATEMENTS : [])
  ];
  const leaseNormalizedStatements = version >= 5
    ? [...priorStatements.filter(sql => !isReplacedLeaseSchemaStatement(sql)), ...SCHEMA_V5_SCHEMA_STATEMENTS]
    : priorStatements;
  const admittedStatements = version >= 6
    ? [...leaseNormalizedStatements, ...SCHEMA_V6_SCHEMA_STATEMENTS]
    : leaseNormalizedStatements;
  return admittedStatements.map(canonicalSchemaSql).toSorted();
};

const verifyCanonicalSchema = (database: Database, version: number): JournalResult<void> => {
  const rows = preparedAll<unknown>(database, `SELECT sql
    FROM sqlite_master
    WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'
    ORDER BY type, name`, []);
  const actual = rows.reduce<JournalResult<readonly string[]>>((result, row) => {
    if (result.type === 'err') return result;
    if (!isRecord(row) || typeof row['sql'] !== 'string') return corrupt();
    return journalOk([...result.value, canonicalSchemaSql(row['sql'])]);
  }, journalOk<readonly string[]>([]));
  if (actual.type === 'err') return actual;
  const expected = expectedSchemaSql(version);
  const sortedActual = [...actual.value].toSorted();
  return sortedActual.length === expected.length &&
    sortedActual.every((sql, index) => sql === expected[index])
    ? journalOk(undefined)
    : recoveryRequired('The authority database schema objects do not match the admitted canonical schema.');
};

const hasLegacyViolation = (database: Database, sql: string): boolean =>
  preparedGet<unknown>(database, sql, []) !== null;

const verifyLegacyV1DataForMigration = (database: Database): JournalResult<void> => {
  if (hasLegacyViolation(database, `SELECT 1
      FROM consents
      LEFT JOIN grants ON grants.consent_id = consents.consent_id
      WHERE grants.grant_id IS NULL OR grants.operation_id <> consents.operation_id
      LIMIT 1`) ||
      hasLegacyViolation(database, `SELECT 1
      FROM grants
      LEFT JOIN consents ON consents.consent_id = grants.consent_id
      WHERE consents.consent_id IS NULL OR consents.operation_id <> grants.operation_id
      LIMIT 1`)) {
    return recoveryRequired('Legacy consent and grant operation evidence is inconsistent.');
  }
  if (hasLegacyViolation(database, `SELECT 1 FROM (${LEGACY_OPERATION_PROJECTION_SQL})
      GROUP BY operation_id HAVING COUNT(*) > 1 LIMIT 1`)) {
    return recoveryRequired('Legacy journal operation identities collide across authority domains.');
  }
  if (hasLegacyViolation(database, `SELECT 1 FROM leases
      WHERE state IN ('authorized', 'active')
      GROUP BY grant_id, grant_generation, process_attempt_id
      HAVING COUNT(*) > 1 LIMIT 1`)) {
    return recoveryRequired('Legacy nonterminal lease authority is ambiguous and requires recovery.');
  }
  return journalOk(undefined);
};

const verifyLegacyGrantBindingDataForMigration = (database: Database): JournalResult<void> => {
  if (hasLegacyViolation(database, `SELECT 1 FROM grants
      LEFT JOIN grant_slots ON grant_slots.grant_id = grants.grant_id
      WHERE grant_slots.grant_id IS NULL
      LIMIT 1`) ||
      hasLegacyViolation(database, `SELECT 1 FROM grants
      WHERE length(credential_reference) < 1 OR length(credential_reference) > 256 OR
        instr(credential_reference, char(0)) > 0
      LIMIT 1`) ||
      hasLegacyViolation(database, `SELECT 1 FROM grant_slots
      WHERE length(slot_id) < 1 OR length(slot_id) > 128 OR instr(slot_id, char(0)) > 0
      LIMIT 1`) ||
      hasLegacyViolation(database, `SELECT 1 FROM (
        SELECT grants.grant_id, consent_slots.slot_id
        FROM grants INNER JOIN consent_slots ON consent_slots.consent_id = grants.consent_id
        EXCEPT SELECT grant_id, slot_id FROM grant_slots
      ) LIMIT 1`) ||
      hasLegacyViolation(database, `SELECT 1 FROM (
        SELECT grant_slots.grant_id, grant_slots.slot_id FROM grant_slots
        EXCEPT SELECT grants.grant_id, consent_slots.slot_id
          FROM grants INNER JOIN consent_slots ON consent_slots.consent_id = grants.consent_id
      ) LIMIT 1`)) {
    return recoveryRequired('Legacy grant credential bindings are incomplete or inconsistent.');
  }
  return journalOk(undefined);
};

const verifyLegacyLeaseExposureDataForMigration = (database: Database): JournalResult<void> => {
  if (hasLegacyViolation(database, `SELECT 1 FROM leases
      WHERE length(lease_id) < 1 OR length(lease_id) > 256 OR instr(lease_id, char(0)) > 0
      LIMIT 1`) ||
      hasLegacyViolation(database, `SELECT 1 FROM bootstrap_lease_claims
      WHERE length(expected_receiver_id) < 1 OR length(expected_receiver_id) > 128 OR
        instr(expected_receiver_id, char(0)) > 0
      LIMIT 1`) ||
      hasLegacyViolation(database, `SELECT 1 FROM bootstrap_attempt_bindings
      WHERE length(receiver_id) < 1 OR length(receiver_id) > 128 OR instr(receiver_id, char(0)) > 0
      LIMIT 1`) ||
      hasLegacyViolation(database, `SELECT 1 FROM lease_transitions AS transition
      INNER JOIN leases AS lease ON lease.lease_id = transition.lease_id
      WHERE transition.at_ms < lease.issued_at_ms
      LIMIT 1`)) {
    return recoveryRequired('Legacy lease exposure identity or timing evidence is inconsistent.');
  }
  if (hasLegacyViolation(database, `WITH classified AS (
      SELECT lease.grant_id, lease.grant_generation, lease.process_attempt_id,
        CASE
          WHEN lease.state = 'revoked' AND
            (SELECT COUNT(*) FROM lease_transitions AS event
              WHERE event.lease_id = lease.lease_id) = 1 AND
            (SELECT COUNT(*) FROM lease_transitions AS event
              WHERE event.lease_id = lease.lease_id AND
                event.expected_state = 'authorized' AND event.next_state = 'revoked') = 1
            THEN 0
          ELSE 1
        END AS remains_nonterminal
      FROM leases AS lease
    )
    SELECT 1 FROM classified WHERE remains_nonterminal = 1
    GROUP BY grant_id, grant_generation, process_attempt_id HAVING COUNT(*) > 1 LIMIT 1`)) {
    return recoveryRequired(
      'Legacy lease histories imply multiple possibly exposed processes for one authority claim.'
    );
  }
  return journalOk(undefined);
};

const applySchemaV1 = (database: Database, options: ResolvedOptions): JournalResult<void> => {
  const appliedAtMs = options.clock.nowMs();
  if (!Number.isSafeInteger(appliedAtMs) || appliedAtMs < 0) {
    return journalErr({ code: 'journal-invalid', message: 'The supplied journal clock is invalid.' });
  }
  return database.transaction((): JournalResult<void> => {
    const versionScalar = readScalarPragma(database, 'PRAGMA user_version');
    if (versionScalar.type === 'err') return versionScalar;
    const version = parseSafeInteger(versionScalar.value);
    if (version.type === 'err') return version;
    if (version.value !== 0) return journalOk(undefined);
    const markerExists = migrationTableExists(database);
    if (markerExists.type === 'err') return markerExists;
    if (markerExists.value) return recoveryRequired('An interrupted authority migration requires recovery.');
    const userTables = countUserTables(database);
    if (userTables.type === 'err') return userTables;
    if (userTables.value !== 0) {
      return recoveryRequired('An unversioned authority database already contains tables.');
    }
    SCHEMA_V1_STATEMENTS.forEach(sql => {
      database.run(sql);
    });
    preparedRun(database, `INSERT INTO schema_migrations (
        version, checksum, application_version, applied_at_ms
      ) VALUES (?, ?, ?, ?)`, [1, SCHEMA_V1_CHECKSUM, options.applicationVersion, appliedAtMs]);
    database.run('PRAGMA user_version = 1');
    return journalOk(undefined);
  }).immediate();
};

const applySchemaV2 = (database: Database, options: ResolvedOptions): JournalResult<void> => {
  const appliedAtMs = options.clock.nowMs();
  if (!Number.isSafeInteger(appliedAtMs) || appliedAtMs < 0) {
    return journalErr({ code: 'journal-invalid', message: 'The supplied journal clock is invalid.' });
  }
  return database.transaction((): JournalResult<void> => {
    const versionScalar = readScalarPragma(database, 'PRAGMA user_version');
    if (versionScalar.type === 'err') return versionScalar;
    const version = parseSafeInteger(versionScalar.value);
    if (version.type === 'err') return version;
    if (version.value === 2) {
      const history = verifyMigrationHistory(database, 2);
      return history.type === 'err' ? history : verifyCanonicalSchema(database, 2);
    }
    if (version.value !== 1) {
      return recoveryRequired('The authority schema changed while waiting to apply migration v2.');
    }
    const prior = verifyMigrationHistory(database, 1);
    if (prior.type === 'err') return prior;
    const priorSchema = verifyCanonicalSchema(database, 1);
    if (priorSchema.type === 'err') return priorSchema;
    const legacy = verifyLegacyV1DataForMigration(database);
    if (legacy.type === 'err') return legacy;
    SCHEMA_V2_SCHEMA_STATEMENTS.forEach(sql => {
      database.run(sql);
    });
    database.run(SEED_V1_OPERATIONS_STATEMENT);
    preparedRun(database, `INSERT INTO schema_migrations (
        version, checksum, application_version, applied_at_ms
      ) VALUES (?, ?, ?, ?)`, [2, SCHEMA_V2_CHECKSUM, options.applicationVersion, appliedAtMs]);
    database.run('PRAGMA user_version = 2');
    return journalOk(undefined);
  }).immediate();
};

const applySchemaV3 = (database: Database, options: ResolvedOptions): JournalResult<void> => {
  const appliedAtMs = options.clock.nowMs();
  if (!Number.isSafeInteger(appliedAtMs) || appliedAtMs < 0) {
    return journalErr({ code: 'journal-invalid', message: 'The supplied journal clock is invalid.' });
  }
  return database.transaction((): JournalResult<void> => {
    const versionScalar = readScalarPragma(database, 'PRAGMA user_version');
    if (versionScalar.type === 'err') return versionScalar;
    const version = parseSafeInteger(versionScalar.value);
    if (version.type === 'err') return version;
    if (version.value === 3) {
      const history = verifyMigrationHistory(database, 3);
      return history.type === 'err' ? history : verifyCanonicalSchema(database, 3);
    }
    if (version.value !== 2) {
      return recoveryRequired('The authority schema changed while waiting to apply migration v3.');
    }
    const prior = verifyMigrationHistory(database, 2);
    if (prior.type === 'err') return prior;
    const priorSchema = verifyCanonicalSchema(database, 2);
    if (priorSchema.type === 'err') return priorSchema;
    const legacy = verifyLegacyGrantBindingDataForMigration(database);
    if (legacy.type === 'err') return legacy;
    SCHEMA_V3_SCHEMA_STATEMENTS.forEach(sql => {
      database.run(sql);
    });
    database.run(REVOKE_AMBIGUOUS_LEGACY_GRANTS_STATEMENT);
    database.run(SEED_LEGACY_GRANT_BINDINGS_STATEMENT);
    preparedRun(database, `INSERT INTO schema_migrations (
        version, checksum, application_version, applied_at_ms
      ) VALUES (?, ?, ?, ?)`, [3, SCHEMA_V3_CHECKSUM, options.applicationVersion, appliedAtMs]);
    database.run('PRAGMA user_version = 3');
    return journalOk(undefined);
  }).immediate();
};

const applySchemaV4 = (database: Database, options: ResolvedOptions): JournalResult<void> => {
  const appliedAtMs = options.clock.nowMs();
  if (!Number.isSafeInteger(appliedAtMs) || appliedAtMs < 0) {
    return journalErr({ code: 'journal-invalid', message: 'The supplied journal clock is invalid.' });
  }
  return database.transaction((): JournalResult<void> => {
    const versionScalar = readScalarPragma(database, 'PRAGMA user_version');
    if (versionScalar.type === 'err') return versionScalar;
    const version = parseSafeInteger(versionScalar.value);
    if (version.type === 'err') return version;
    if (version.value === 4) {
      const history = verifyMigrationHistory(database, 4);
      return history.type === 'err' ? history : verifyCanonicalSchema(database, 4);
    }
    if (version.value !== 3) {
      return recoveryRequired('The authority schema changed while waiting to apply migration v4.');
    }
    const prior = verifyMigrationHistory(database, 3);
    if (prior.type === 'err') return prior;
    const priorSchema = verifyCanonicalSchema(database, 3);
    if (priorSchema.type === 'err') return priorSchema;
    SCHEMA_V4_SCHEMA_STATEMENTS.forEach(sql => {
      database.run(sql);
    });
    preparedRun(database, `INSERT INTO schema_migrations (
        version, checksum, application_version, applied_at_ms
      ) VALUES (?, ?, ?, ?)`, [4, SCHEMA_V4_CHECKSUM, options.applicationVersion, appliedAtMs]);
    database.run('PRAGMA user_version = 4');
    return journalOk(undefined);
  }).immediate();
};

const applySchemaV5 = (database: Database, options: ResolvedOptions): JournalResult<void> => {
  const appliedAtMs = options.clock.nowMs();
  if (!Number.isSafeInteger(appliedAtMs) || appliedAtMs < 0) {
    return journalErr({ code: 'journal-invalid', message: 'The supplied journal clock is invalid.' });
  }
  return database.transaction((): JournalResult<void> => {
    const versionScalar = readScalarPragma(database, 'PRAGMA user_version');
    if (versionScalar.type === 'err') return versionScalar;
    const version = parseSafeInteger(versionScalar.value);
    if (version.type === 'err') return version;
    if (version.value === 5) {
      const history = verifyMigrationHistory(database, 5);
      return history.type === 'err' ? history : verifyCanonicalSchema(database, 5);
    }
    if (version.value !== 4) {
      return recoveryRequired('The authority schema changed while waiting to apply migration v5.');
    }
    const prior = verifyMigrationHistory(database, 4);
    if (prior.type === 'err') return prior;
    const priorSchema = verifyCanonicalSchema(database, 4);
    if (priorSchema.type === 'err') return priorSchema;
    const legacy = verifyLegacyLeaseExposureDataForMigration(database);
    if (legacy.type === 'err') return legacy;
    SCHEMA_V5_MIGRATION_STATEMENTS.forEach(sql => {
      database.run(sql);
    });
    preparedRun(database, `INSERT INTO schema_migrations (
        version, checksum, application_version, applied_at_ms
      ) VALUES (?, ?, ?, ?)`, [5, SCHEMA_V5_CHECKSUM, options.applicationVersion, appliedAtMs]);
    database.run('PRAGMA user_version = 5');
    return journalOk(undefined);
  }).immediate();
};

const applySchemaV6 = (database: Database, options: ResolvedOptions): JournalResult<void> => {
  const appliedAtMs = options.clock.nowMs();
  if (!Number.isSafeInteger(appliedAtMs) || appliedAtMs < 0) {
    return journalErr({ code: 'journal-invalid', message: 'The supplied journal clock is invalid.' });
  }
  return database.transaction((): JournalResult<void> => {
    const versionScalar = readScalarPragma(database, 'PRAGMA user_version');
    if (versionScalar.type === 'err') return versionScalar;
    const version = parseSafeInteger(versionScalar.value);
    if (version.type === 'err') return version;
    if (version.value === 6) {
      const history = verifyMigrationHistory(database, 6);
      return history.type === 'err' ? history : verifyCanonicalSchema(database, 6);
    }
    if (version.value !== 5) {
      return recoveryRequired('The authority schema changed while waiting to apply migration v6.');
    }
    const prior = verifyMigrationHistory(database, 5);
    if (prior.type === 'err') return prior;
    const priorSchema = verifyCanonicalSchema(database, 5);
    if (priorSchema.type === 'err') return priorSchema;
    SCHEMA_V6_SCHEMA_STATEMENTS.forEach(sql => {
      database.run(sql);
    });
    preparedRun(database, RECOVER_UNVERIFIED_LEGACY_WINDOWS_BINDINGS_STATEMENT, [appliedAtMs, appliedAtMs]);
    preparedRun(database, `INSERT INTO schema_migrations (
        version, checksum, application_version, applied_at_ms
      ) VALUES (?, ?, ?, ?)`, [6, SCHEMA_V6_CHECKSUM, options.applicationVersion, appliedAtMs]);
    database.run('PRAGMA user_version = 6');
    return journalOk(undefined);
  }).immediate();
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
  if (version.value === CURRENT_SCHEMA_VERSION) return verifyMigrationHistory(database, CURRENT_SCHEMA_VERSION);
  if (version.value === 5) return applySchemaV6(database, options);
  if (version.value === 4) {
    const migrated = applySchemaV5(database, options);
    return migrated.type === 'err' ? migrated : applySchemaV6(database, options);
  }
  if (version.value === 3) {
    const migrated = applySchemaV4(database, options);
    if (migrated.type === 'err') return migrated;
    const versionFive = applySchemaV5(database, options);
    return versionFive.type === 'err' ? versionFive : applySchemaV6(database, options);
  }
  if (version.value === 2) {
    const migrated = applySchemaV3(database, options);
    if (migrated.type === 'err') return migrated;
    const versionFour = applySchemaV4(database, options);
    if (versionFour.type === 'err') return versionFour;
    const versionFive = applySchemaV5(database, options);
    return versionFive.type === 'err' ? versionFive : applySchemaV6(database, options);
  }
  if (version.value === 1) {
    const migrated = applySchemaV2(database, options);
    if (migrated.type === 'err') return migrated;
    const versionThree = applySchemaV3(database, options);
    if (versionThree.type === 'err') return versionThree;
    const versionFour = applySchemaV4(database, options);
    if (versionFour.type === 'err') return versionFour;
    const versionFive = applySchemaV5(database, options);
    return versionFive.type === 'err' ? versionFive : applySchemaV6(database, options);
  }
  if (version.value !== 0) return recoveryRequired('The authority schema requires an unavailable migration.');
  const created = applySchemaV1(database, options);
  if (created.type === 'err') return created;
  const migrated = applySchemaV2(database, options);
  if (migrated.type === 'err') return migrated;
  const versionThree = applySchemaV3(database, options);
  if (versionThree.type === 'err') return versionThree;
  const versionFour = applySchemaV4(database, options);
  if (versionFour.type === 'err') return versionFour;
  const versionFive = applySchemaV5(database, options);
  return versionFive.type === 'err' ? versionFive : applySchemaV6(database, options);
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
  const schema = verifyCanonicalSchema(database, CURRENT_SCHEMA_VERSION);
  return schema.type === 'err' ? schema : boundedIntegrityCheck(database);
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
    claimAuthorized: command => runValidated(
      options,
      validateBootstrapLeaseClaim(command),
      claimAuthorizedBootstrapLeaseInDatabase
    ),
    transition: command => runValidated(options, validateLeaseTransition(command), transitionLeaseInDatabase),
    read: id => withDatabase(options, database => readLeaseInDatabase(database, id.value)),
    readNonterminalForAttempt: id => withDatabase(
      options,
      database => readNonterminalLeasesForAttempt(database, id)
    ),
    readClosedCountForAttempt: id => withDatabase(
      options,
      database => countClosedExposuresForAttempt(database, id)
    )
  },
  attempts: {
    reserve: command => runValidated(options, validateAttemptReservation(command), reserveAttemptInDatabase),
    reserveGrantQualifiedMaterializing: command => runValidated(
      options,
      validateGrantQualifiedMaterializingAttempt(command),
      (database, validated) => reserveGrantQualifiedMaterializingAttemptInDatabase(
        database,
        validated,
        options.clock
      )
    ),
    readGrantQualifiedMaterializing: id => withDatabase(
      options,
      database => readGrantQualifiedMaterializingAttemptInDatabase(database, id)
    ),
    readGrantQualifiedAttempt: id => withDatabase(
      options,
      database => readGrantQualifiedAttemptInDatabase(database, id)
    ),
    bindVerifiedWindowsContainmentAndStart: command => runValidated(
      options,
      validateVerifiedWindowsContainmentBind(command),
      bindVerifiedWindowsContainmentAndStartInDatabase
    ),
    readGrantQualifiedContainedAttempt: id => withDatabase(
      options,
      database => readGrantQualifiedContainedAttemptInDatabase(database, id)
    ),
    finalizeVerifiedWindowsTerminalCleanup: command => runValidated(
      options,
      validateVerifiedWindowsTerminalCleanupFinalization(command),
      finalizeVerifiedWindowsTerminalCleanupInDatabase
    ),
    readVerifiedWindowsTerminalCleanup: id => withDatabase(
      options,
      database => readVerifiedWindowsTerminalCleanupInDatabase(database, id)
    ),
    bindBootstrap: command => runValidated(
      options,
      validateBootstrapAttemptBind(command),
      bindBootstrapAttemptInDatabase
    ),
    transition: command => runValidated(options, validateAttemptTransition(command), transitionAttemptInDatabase),
    read: id => withDatabase(options, database => readAttemptInDatabase(database, id))
  },
  transfers: {
    consume: command => runValidated(options, validateTransferConsumption(command), consumeTransferInDatabase),
    read: id => withDatabase(options, database => readTransferInDatabase(database, id.value))
  }
});
