---
id: broker-typing-fp-implementation-sequence
kind: strategy
status: proposed
created: 2026-08-23
updated: 2026-08-23
roadmap: broker
refs:
  - roadmaps/broker.md#strengthen-typing-and-functional-boundaries
  - roadmaps/broker.md#four-artifact-distribution-conformance
  - roadmaps/broker.md#security-and-lifecycle-conformance
hook: "read before sequencing or reviewing the typing, FP composition, broker state-machine, effect-boundary, restore, recipe authority, or four-artifact refactor"
---

# Typing And FP Implementation Sequence

@strategy Execute a hard, bounded migration before feature expansion. Do not establish a permanent warning baseline or leave old and new FP styles available to new broker code.
@sequence Phase 0 records current test, typecheck, golden-vector, browser, consumer, lint, thrown-error, unsafe-assertion, ambient-effect, and import-graph baselines. Every discovered exception receives an owner category before editing.
@sequence Phase 1 installs the exact lint/runtime package set, adds type-aware flat ESLint configuration, establishes separate compiler projects, and makes `mise run lint`, `mise run typecheck`, and `mise run verify` authoritative.
@sequence Phase 2 converts result handling to the project façade over `neverthrow`, preserves warnings in `Warned<T>`, adds nonempty issue families and law tests, and removes thrown issue arrays and rejected-promise expected-failure flow.
@sequence Phase 3 adds boundary constructors and branded domain types for ids, versions, paths, scopes, time, recipient identity, credential references, grants, leases, and transfers; unsafe casts become confined decoder or registry operations.
@sequence Phase 4 splits structured/raw codec ADTs, current-only/migrating variants, closed protocol wire types, and the single audited dynamic registry erasure point; locked canonical bytes and CIDs remain unchanged.
@sequence Phase 5 enforces portable/client/runner/privileged dependency direction with compiler projects, boundary lint, restricted globals/imports, and four independent entrypoints before broker adapters land.
@sequence Phase 6 defines Git-scoped normalized recipe revision identity without code hashing, the admitted `pk` XML subset, receiver-specific leaf lifecycle contracts, then closed request, consent, grant, lease, renewal, revocation, export, import, replay, execution, rollback, and recovery state machines using exhaustive matching and supplied clocks.
@sequence Phase 7 defines capability-specific effect ports and the broker Effect environment, then adapts and hardens `pk` lifecycle/observability semantics behind authenticated IPC, Git/worktree and recipe revalidation, key-entry and CAR-unlock consent, audit, recovery journals, receiver-specific execution, and `Bun.secrets` as leaf adapters with scoped acquisition/release.
@sequence Phase 8 refactors restore execution to typed handlers, compositional result/effect flow, cancellation, rollback/cleanup reports, and committed/recovered/recovery-required outcomes.
@sequence Phase 9 implements credential requirement and encrypted secret-transfer codecs, transactional export/import, provider adapters, and minimally scoped delivery.
@sequence Phase 10 builds exactly four runtime artifacts, generates declarations, installs isolated fixtures, and runs browser, Bun, OS-keychain, repository/recipe-grant drift, interpreted-source-churn, lifecycle/observability, interruption, security, and artifact scans before consumer migrations.
@sequence Phase 11 migrates associated workspaces in hard bounded passes using the complete rules written in this roadmap's memories; each workspace becomes independently green without importing configuration or runtime code from an external reference project.
@gate Every phase keeps existing neutral and consumer verification green; phase 3 must not change locked canonical bytes or CIDs, and no phase may weaken unknown-capability retention or restore rollback behavior.
@law Verify Result map identity, flatMap left/right identity and associativity for pure callbacks, deterministic warning accumulation, canonical encode idempotence, codec round trip, deterministic policy evaluation, monotonic expiry under a supplied clock, idempotent replay consumption, and reverse-order rollback.
@law Verify insufficient effect ports cannot satisfy richer operations, client import has no effects, portable imports cannot reach broker authority, grant scope never widens without consent, and transfer import cannot create local project authority from portable metadata.
@decision Adopt `neverthrow` for portable/client result composition and adopt Effect only inside privileged `broker.js` for structured concurrency, cancellation, scoped finalizers, and service layers. Do not adopt `fp-ts`; do not expose Effect from portable or client public APIs.
