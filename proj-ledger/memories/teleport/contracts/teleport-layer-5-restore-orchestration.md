---
id: teleport-layer-5-restore-orchestration
kind: contract
status: active
created: 2026-08-22
updated: 2026-08-23
roadmap: car-teleport
refs:
  - roadmaps/car-teleport.md#seven-layer-teleport-architecture
  - roadmaps/car-teleport.md#define-composable-restore-plan-algebra
  - roadmaps/car-teleport.md#transactional-import-migration-and-restore-planning
hook: "read before changing import phases, restore plans, authorization, dependency ordering, staging, commit, verification, rollback, or cleanup"
---

# Layer 5: Restore Planning And Orchestration

@contract Decode success produces inert current values and declarative restore steps; it never mutates an application. Import advances through parse, CID/DAG verification, inventory, unlock, decode, migration, plan composition, policy decisions, staging, commit, verification, rollback or finalize, and cleanup.
@contract Every restore step declares stable identity, source capability instance, effect class, dependencies, required resources, preconditions, confirmation policy, redacted diagnostics, verification predicate, reversibility, and rollback action or accepted recovery source.
@contract The shared planner composes capability plans, topologically orders dependencies, detects cycles and resource conflicts, merges compatible confirmation boundaries, and prevents irreversible work before all required verifiable prerequisites succeed.
@contract Effect classes include safe-local, network-rebase, secret-unlock, asset-materialize, store-stage, merge, destructive-replace, stale-exact-replay, and unresolved-retain. Applications own authorization policy for every effectful class.
@contract Required failure aborts commit. Unsupported optional capabilities remain retained and unresolved. Completed reversible steps roll back in reverse dependency order when a later required step fails.
@contract Native databases and destructive workspace operations restore into isolated staging targets first and become active only after application-specific reopen/rebase verification succeeds.
@contract Interruption and every terminal failure destroy transient keys, close resources, remove temporary state, preserve the pre-import active workspace, and return bounded typed receipts and diagnostics.
@constraint Network access, credential use, stale replay, replacement, merge, and irreversible effects are never implied by parse, decryption, codec support, or user selection of a file alone.
@evidence 2026-08-22 the shared planner orders cross-capability dependencies and rejects cycles/resource conflicts; the executor authorizes effect classes before staging, stages all steps before commit, verifies receipts, rolls reversible commits back in reverse order, and always cleans staged state. wx-ui-melt CAR import now uses this executor and authorizes only safe-local and unresolved-retain effects.
@evidence 2026-08-22 JTWC's restore port applies imported intent then invokes the application-owned latest-scene refresh, while exact replay hydrates separately. Supa's persistent Fireproof port shares one isolated transaction across stage/commit steps; real native-store tests prove replace, semantic merge, verification, rollback, and cleanup.
@evidence 2026-08-22 wx-ui-melt's application-owned adapter stages and commits the complete workspace topology, verifies canonical topology plus a host predicate, and restores the prior complete topology when a forced post-commit host verification fails.
@evidence 2026-08-22 clean-profile Edge acceptance externally corrupts one rendered imported pane identity, observes a visible renderer-verification failure, and proves rollback restores the exact prior rendered panes and active pane before the same CAR succeeds without interference.
@evidence 2026-08-22 wx-ui-melt journals only the prior semantic workspace topology before commit, restores and consumes that journal during startup, and clears it on normal success or rollback. Clean-profile Edge forces a real page reload after imported panes render and before verification, then proves the prior topology and empty journal after restart.
@evidence 2026-08-22 `DurableActiveFireproofTarget` persists prior and incoming native-store locators before activation, retains rollback authority through application verification, and makes interrupted incoming-store disposal retryable before journal removal. `mise run fireproof-interruption` terminates a child runtime during active-pointer commit and proves prior encrypted-store reopen, journal consumption, absence of the incoming document, and staging-directory removal in a fresh runtime.
@proof_gap Bind durable activation storage and locator/disposal adapters in each production host that enables native Fireproof replacement; the reference filesystem host and process-termination acceptance are complete.
