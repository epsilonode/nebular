---
id: broker-sqlite-nonsecret-authority-journal
kind: contract
status: proposed
created: 2026-08-23
updated: 2026-08-23
roadmap: broker
refs:
  - roadmaps/broker.md#broker-is-a-separate-security-boundary-in-this-project
  - roadmaps/broker.md#implement-os-backed-vault-and-local-broker
  - memories/teleport/broker/broker-secret-values-and-lifetime.md
  - memories/teleport/broker/broker-explicit-effect-environment.md
  - memories/teleport/broker/broker-capability-specific-ports.md
  - memories/teleport/broker/broker-request-grant-transfer-state-machines.md
hook: "read before choosing broker persistence, adding SQLite or Fireproof, storing grants or leases, recording consent or CAR replay, implementing recovery, selecting a user-profile path, or deciding whether data is secret"
---

# SQLite Nonsecret Authority And Recovery Journal

@decision Use one versioned per-user SQLite database as the initial durable store for broker-owned nonsecret authority, consent, lifecycle, replay, recovery, and redacted audit state. Access it through a narrow broker journal port implemented with the Mise-pinned Bun runtime's `bun:sqlite` adapter.
@role SQLite is the broker's authority journal and nonsecret index across short-lived `broker.js` invocations. It is not the credential vault, process receiver, output stream store, CAR block store, generic Teleport database, Fireproof replacement, or application-state database.
@topology Each short-lived privileged broker operation opens the per-user database, verifies/migrates its schema, performs bounded transactional reads/writes, closes it, and exits. No database daemon, localhost listener, persistent broker service, or repository-local database is introduced.

## Storage ownership

@keychain `Bun.secrets` and the operating-system credential manager remain authoritative for API keys, refresh tokens, imported secret bytes, and other live credential material. SQLite stores only opaque credential references and redacted descriptive metadata needed to locate and govern those entries.
@receiver PM2 remains authoritative for live process ownership, PID/status/restart facts, and receiver lifecycle. SQLite records broker attempt identity, authority, requested operation, observation cursors, state transitions, and terminal/recovery facts without pretending a journal row proves a process is live.
@output Store bounded stdout/stderr in per-attempt files or receiver-owned logs. SQLite stores paths or opaque stream references, generations, retained ranges, byte offsets, truncation/gap facts, timestamps, and redacted summaries; it does not store unbounded output bodies.
@car Encrypted CAR files and content-addressed blocks remain under Teleport transport/storage ownership. SQLite stores only nonsecret transfer ids, intended operation, replay/consumption state, redacted receipt metadata, and recovery disposition.
@application Fireproof or other application databases remain owned by their application adapters. Broker authorization state must not be embedded in an application database whose sync, replication, retention, or trust boundary differs from the OS-user broker boundary.

## Windows V1 location and access

@path Store the V1 database below the current user's local application-data directory, conceptually `%LOCALAPPDATA%/wx-teleport-cartridge/broker/v1/broker.sqlite3`. Resolve the platform directory through a dedicated `ProfilePathPort`; do not accept a repository path, caller cwd, relative path, or arbitrary environment override as the production authority location.
@acl Create the directory and database for the current user with the narrowest practical Windows ACL. Reject reparse-point/symlink surprises, directories owned or writable by an unexpected principal, network shares, repository containment, and path ambiguity before opening authority state.
@portable Later platforms select their normal per-user application-state location behind the same port and receive separate conformance. Do not claim cross-platform persistence support merely because SQLite itself is portable.
@override Tests may inject an isolated temporary path through a test-only composition root. Production path overrides require an explicit diagnostic/development policy and must never be inferred from repository configuration.

## Permitted records

@schema The logical schema owns at least schema migrations, opaque credential references, repository/worktree identities, recipe identities and normalized revisions, grants and revocation generations, leases, consent evidence, process attempts and lifecycle events, pending/recovery operations, CAR transfer replay records, and redacted audit events.
@credential A credential-reference record may contain opaque id, provider id, redacted account label, environment, secret kind, upstream expiry when known, keychain service/name derivation version, created/updated times, and tombstone state. It never contains the keychain value or a reversible derivative of it.
@repository A repository record may contain opaque repository id, normalized remote identity where available, canonical worktree/common-directory facts required by policy, local approval generation, and timestamps. Paths are treated as sensitive local metadata and never exported through CAR public inventory or ordinary diagnostics.
@recipe A recipe record may contain repository id, checked-in relative path, schema version, canonical normalized revision digest, credential-slot declaration digest, lifecycle/receiver requirements, and approval generation. It does not contain secret values, secret argv, or a claim that the digest proves executable integrity.
@grant A grant record binds repository/worktree, recipe revision, credential reference, admitted operations/scopes, environment/account constraints, delivery mode, credential slots, issue/expiry times, consent evidence reference, revocation generation, and current state.
@lease A lease record binds one grant generation, request/client/process attempt, narrowed operations, delivery mode, issue/expiry/termination times, and state. It contains no secret, reusable environment, or transport transcript containing secret values.
@attempt An attempt record contains opaque attempt/receiver identity, repository and recipe revision, lifecycle policy, redacted command summary, nonsecret plan digest, start/observation/terminal times, receiver correlation, restart lineage, cleanup/recovery state, and stream cursor metadata.
@consent A consent record contains what redacted authority was displayed and approved or denied, prompt identity/version, repository/recipe/grant references, scope/delivery/expiry facts, timestamp, and outcome. It contains no keystrokes, key value, PIN, passphrase, clipboard contents, or screen capture.
@transfer A transfer/replay record contains opaque transfer id, recipient/signer policy references where nonsecret, issue/expiry/consumption times, destination grant reference, state, and recovery facts. It does not retain decrypted capability bytes or protected CAR blocks.
@audit Audit events are closed, redacted facts with event id/type, correlation ids, supplied-clock time, actor/process category, authority references, outcome code, and safe metadata. Free-form exception dumps and arbitrary serialized request objects are forbidden.

## Forbidden data

@never Never store API keys, provider tokens, refresh tokens, credential plaintext, decrypted CAR payloads, PINs, passphrases, key derivation inputs, complete secret environments, secret-bearing argv, IPC payloads containing secrets, raw prompt input, crash dumps, or reversible secret-derived identifiers.
@metadata Treat repository paths, provider/account labels, scopes, process command summaries, and audit history as sensitive nonsecret metadata. Limit access, retention, diagnostics, exports, and backups even though application-level encryption is not required for the initial local database.
@redaction Construct persistence records from explicit redacted projections. Do not serialize domain/runtime objects generically, spread arbitrary request structures into event metadata, or rely on log formatting to remove secrets after the fact.

## Journal port and domain boundary

@port Domain logic depends on capability-specific ports such as `GrantJournal`, `LeaseJournal`, `AttemptJournal`, `ConsentJournal`, `TransferReplayJournal`, and `AuditSink`, or one narrowly typed aggregate that preserves those operations. Domain modules never import `bun:sqlite`, issue SQL, choose paths, run migrations, or inspect connection state.
@adapter The privileged broker composition root supplies the SQLite implementation. Portable Teleport, broker client, recipe runner, codecs, CAR contracts, and receiver-neutral domain types cannot import SQLite or see its schema types.
@types Every query maps database primitives through strict boundary decoders into branded ids, instants, durations, revisions, generations, states, and nonempty issue types. Invalid persisted rows produce typed corruption/recovery-required outcomes rather than casts or default values.
@transactions Expose domain-level atomic operations instead of generic transactions: create grant with consent evidence, revoke grant and invalidate leases, reserve attempt identity, append event and advance state, consume transfer and create destination grant, begin/complete/recover keychain mutation, and finalize attempt with cleanup facts.

## Transactions and cross-store recovery

@atomic SQLite transactions make journal changes atomic only within SQLite. They cannot atomically commit Windows Credential Manager, PM2, filesystem logs, prompt processes, or CAR writes. Model every cross-store operation as an explicit recoverable state machine.
@keychain For enrollment/import/rotation use states such as planned, keychain-write-started, keychain-written, metadata-committed, complete, rollback-required, and recovery-required. Record only opaque references before/after the external keychain effect; never journal the value.
@process Reserve attempt and receiver identity transactionally before opaque materialization, then record materializing/running facts after receiver results. On interruption, reconcile journal identity against PM2 facts rather than assuming either success or failure.
@replay A CAR transfer cannot become reusable because of a crash between keychain write and replay consumption. Use a pending transaction/recovery record that deterministically completes consumption and grant creation or removes/isolates the incomplete keychain reference according to policy.
@idempotency Every external-effect command carries an opaque operation id and expected prior generation/state. Retries return the already committed result or a typed conflict; they do not duplicate grants, leases, attempts, consent, keychain entries, or transfer consumption.

## SQLite operational contract

@migration Maintain an explicit monotonic schema version and ordered forward migrations. Migration runs inside a bounded transaction after backup/recovery preflight, records the application/build version, and fails closed on unknown newer schemas, checksum mismatch, partial migration, or invalid invariant.
@journal_mode Prefer WAL after a Windows/local-filesystem compatibility proof. Configure bounded busy timeouts and short write transactions; do not wait indefinitely for a lock. If WAL cannot be proven for the selected local path/runtime, choose a documented journal mode rather than silently changing durability semantics.
@durability Select and test the required synchronous/durability level for authority and replay records. Do not weaken durability globally to improve benchmarks. High-volume observation samples may use a separately bounded policy but cannot reorder or erase authority transitions.
@connection Open connections in the privileged adapter only, enable foreign-key enforcement, validate expected pragmas, use prepared statements, finalize resources through scoped effects, and close the database at the end of each short-lived broker operation.
@single_writer SQLite coordinates concurrent broker helpers, but domain generation/state preconditions remain mandatory. A database lock alone does not prevent logical lost updates, stale grant reuse, double transfer consumption, or conflicting recovery.
@integrity Run bounded startup checks for schema identity and critical invariants. Full integrity checks belong to `doctor` or recovery flows rather than every request unless measurement proves them cheap enough.

## Retention, backup, and removal

@retention Retain active grants/leases/attempts and unresolved recovery records. Apply explicit bounded policies to terminal attempts, stream metadata, audit events, expired grants, consent history, tombstones, and consumed transfers while preserving the minimum replay/security horizon.
@backup Backups contain sensitive nonsecret authority metadata and receive current-user protection, bounded retention, explicit filenames, and no secret values. Do not automatically upload, sync, commit, attach to CAR, or place backups in consumer workspaces.
@remove Removal distinguishes application uninstall from credential revocation. Deleting the SQLite file without removing keychain entries can orphan credentials; deleting keychain entries without journal reconciliation can leave misleading grants. Provide an explicit broker removal/recovery flow.
@corruption Corruption recovery never grants authority from incomplete rows or reconstructs secrets from logs. Prefer fail-closed read-only diagnostics, recover verified records from a protected backup when available, revoke/expire ambiguous authority, and require renewed consent where correctness cannot be proven.

## Conformance

@proof Test clean creation, current-user path selection, schema migration, newer-schema rejection, concurrent readers/writers, bounded lock timeout, crash at every cross-store transition, idempotent retry, grant expiry/revocation generations, lease cleanup, PM2 reconciliation, CAR replay races, corruption handling, retention, backup/removal, and isolated test-path injection.
@scan Seed recognizable secret canaries through keychain, consent input, bootstrap delivery, CAR import, and child environment tests, then scan the database/WAL/SHM files, backups, SQL errors, migrations, audit output, logs, fixtures, and crash artifacts. Any secret canary in persistence fails conformance.
@boundary Prove `teleport.js`, `broker-client.js`, and `recipe-runner.js` cannot import `bun:sqlite`, database adapters, migrations, paths, or journal internals. Only the privileged broker artifact contains the SQLite adapter.
@recovery Prove a fresh broker invocation can recover every admitted nonterminal state deterministically without a persistent broker service, plaintext cache, Fireproof sync, repository file, or user guess about whether an operation completed.
