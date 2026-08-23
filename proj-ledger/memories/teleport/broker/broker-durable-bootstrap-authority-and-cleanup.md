---
id: broker-durable-bootstrap-authority-and-cleanup
kind: contract
status: active
created: 2026-08-23
updated: 2026-08-23
roadmap: broker
refs:
  - roadmaps/broker.md#implement-os-backed-vault-and-local-broker
  - roadmaps/broker.md#add-child-process-and-jsts-clients
  - roadmaps/broker.md#security-and-lifecycle-conformance
  - memories/teleport/broker/broker-inherited-ipc-v1-contract.md
  - memories/teleport/broker/broker-cooperative-bootstrap-entrypoint.md
  - memories/teleport/broker/broker-sqlite-nonsecret-authority-journal.md
  - memories/teleport/broker/broker-receiver-secret-delivery.md
hook: "read before composing the production broker bootstrap root, resolving bootstrap authority, implementing atomic lease claims, verifying a managed receiver parent, changing post-install acknowledgement, or handling environment rollback and ambiguous terminal recovery"
---

# Durable Bootstrap Authority And Post-Install Cleanup

@boundary A bootstrap request is a bounded nonsecret lookup and correlation document, never proof of repository, recipe, grant, receiver, attempt, slot, or process authority. Caller-supplied ids select candidate durable facts only; the privileged broker independently resolves and cross-checks every authority-bearing fact before keychain access.
@topology The intended production path is `PM2-managed target -> short-lived broker.js bootstrap child over inherited Bun IPC -> current target process environment -> deferred application import`. The helper exits after one exchange, PM2 never receives plaintext, and no resident broker, localhost listener, or per-target wrapper is introduced.
@composition Keep the pure authority algebra, inherited-IPC protocol, secret-delivery interpreter, Bun process-environment adapter, SQLite journal adapter, Git/recipe adapter, and PM2/OS process verifier as separate ports. The root composition is privileged; portable, broker-client, and recipe-runner entrypoints cannot construct it.

## Authoritative resolution

@parse Accept exactly one child mode and its one bounded exchange id. Perform protocol/build handshake and strict message decoding before authority work. Ambiguous markers, trailing arguments, unsupported versions, correlation drift, unknown fields, and oversize values fail closed.
@locators Parse repository, recipe revision, grant id, process-attempt id, receiver id, grant generation, slot ids, and environment names from the request only as candidate locators. A successful parse or journal lookup creates no authority.
@journal Load the named grant and attempt from the broker journal. The current pure composer reads the grant and then the attempt, but neither request-selected lookup is authoritative until the full join succeeds. Missing, revoked, expired, terminal, or internally inconsistent records fail without secret-store access.
@receiver `BootstrapCurrentReceiverAttemptPort.verifyCurrentAttempt` joins the durable attempt with current receiver and operating-system facts. It must prove that the bootstrap helper's immediate parent is the exact live process represented by the attempt, with matching repository, recipe revision, grant id/generation, receiver identity, PID-generation or equivalent anti-reuse facts, and admissible materializing/running state. `receiverCorrelation` alone is a locator and is never receiver authority.
@recipe `BootstrapCurrentRecipePort.resolveCurrentRecipe` starts from the verified attempt, resolves the broker-trusted canonical Git worktree, locates the checked-in recipe from durable broker metadata, re-reads and validates it, and returns its current semantic revision and credential-slot declarations. It must never open a caller-supplied recipe path or treat a request revision as current Git evidence.
@exact Compare request, grant, attempt, verified receiver, and current recipe facts exactly: canonical repository, semantic recipe revision, grant id/generation, receiver, process attempt, credential slot set, injection names, and lifecycle eligibility. On Windows, environment-name equality and collision checks use case folding. Source/package/lockfile churn remains irrelevant when the checked-in semantic recipe revision is unchanged.
@time Use a broker-owned clock and entropy port. A bootstrap lease is positive, bounded to at most 60 seconds in the current V1 algebra, and expires at the earlier of its configured lifetime or grant expiry. Client clocks cannot issue, extend, or revive authority.

## Atomic lease claim and state machine

@claim `BootstrapLeaseClaimJournal.claimAuthorized` is stronger than generic lease creation. One transaction must reject a second nonterminal bootstrap lease for the same `(grant id, grant generation, process attempt)` and must return the exact committed record for idempotent retry. A process-local mutex or a prior read followed by insert is insufficient across short-lived helpers.
@states The only legal durable transitions are `authorized -> active | revoked` and `active -> consumed | revoked`. The broker claims `authorized` only after the complete authority join, persists `active` before delivering values, and persists `consumed` only after the target acknowledges the exact lease, process attempt, slot ids, and count.
@failure A validation or activation failure after a claim requests `authorized -> revoked`; a delivery, acknowledgement, timeout, disconnect, or terminal failure while active requests `active -> revoked`. If the SQLite transition itself fails or its result is lost, record or recover an ambiguous nonterminal lease rather than claiming cleanup or replay safety.
@idempotency Every claim and transition carries a broker-generated domain-specific operation id. A retry may return an exact already-committed fact; reusing the id for different input or observing a different resulting record is a typed conflict.
@recovery On startup or the next broker operation, reconcile authorized/active leases whose helper or managed attempt no longer proves live. Terminal state is derived from durable state plus receiver facts; response loss across SQLite, IPC, and target environment installation is a distributed recovery problem, not an in-memory exception case.

## Client installation, acknowledgement, and rollback

@install The client validates exchange and attempt correlation, unexpired lease, exact slot equality, secret bounds, environment syntax, reserved loader/runtime names, inherited-name collisions, and Windows case-fold collisions before installation. The Bun leaf installs all names in the current process atomically or removes the already-written subset in reverse order.
@receipt The environment installer returns redacted installed slot facts plus a nested, idempotent cleanup capability. Secret values remain callback-opaque; the receipt contains no plaintext and cannot be serialized into a reusable environment snapshot.
@ack Build and send acknowledgement only after the install receipt exactly matches the planned patch. The transport does not report success until the helper exits with code 0 after committing its durable terminal transition.
@rollback Invoke cleanup when a post-install receipt or acknowledgement is invalid, acknowledgement send fails, the channel disconnects or times out before clean helper completion, the helper exits nonzero after acknowledgement, or deferred application import rejects. Cleanup removes only the newly installed names; pre-existing names were rejected before installation and therefore are never overwritten or reconstructed.
@rollback_failure If cleanup rejects or cannot remove every installed name, return a typed `environment-invalid` failure that explicitly refuses to claim rollback. Do not mask the exposure ambiguity with the original transport or import error.
@public The normative credential-bearing entrypoint is `prepareRecipeEnvironmentThenImport`, which retains the private cleanup capability until application import succeeds. `prepareRecipeEnvironment` returns only a redacted prepared receipt on success; it intentionally does not expose secret values or a general-purpose environment mutation handle.

## Composition gate and current fail-closed root

@root The public `broker.ts` parser recognizes exactly one control or bootstrap child suffix. Control mode remains wired; bootstrap mode intentionally exits with configuration status 78 before sending a hello because the production durable authority and receiver adapters are not admitted. Exit 78 is evidence of honest unavailability, not a successful broker deliverable.
@sqlite Before enabling root bootstrap, migrate the journal with an atomic `claimAuthorized` operation and a database-enforced uniqueness strategy for nonterminal leases. Add the durable attempt-to-grant/receiver/recipe-locator facts and indexes required to reconstruct authority without trusting the request.
@pm2 Before enabling root bootstrap, implement a bounded host-owned PM2 adapter plus operating-system parent/current-attempt verification. Exact PM2 name or metadata alone is insufficient; prove PID-generation/creation identity and reject a helper whose parent is not the admitted current attempt.
@git Before enabling root bootstrap, implement a production `ProfilePathPort`, canonical Git worktree resolver, checked-in recipe locator/re-reader, semantic revision computation, and slot projection. The database path and recipe path cannot come from cwd or caller overrides.
@proof Required production conformance covers concurrent double claim, stale/restarted/reused PID, recipe replacement between lookup and delivery, grant revoke/expiry races, receiver drift, all transition-write failure points, acknowledgement response loss, helper exit after install, rollback failure, deferred import failure, restart reconciliation, secret-canary scans, and absence of a surviving helper.
@proof The existing pure/fake-backed seams and live two-process harness prove the algebra, protocol correlation, independent revalidation at the test composition root, atomic current-process install, post-install rollback branches, deferred-import ordering, clean helper exit, and redacted receipt shape. They do not prove the missing production SQLite, Git, PM2, Windows process, or public-root composition.
