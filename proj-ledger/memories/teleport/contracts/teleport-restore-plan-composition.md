---
id: teleport-restore-plan-composition
kind: contract
status: active
created: 2026-08-22
updated: 2026-08-22
roadmap: car-teleport
refs:
  - roadmaps/car-teleport.md#define-composable-restore-plan-algebra
hook: "read before projecting decoded capabilities into effects, composing cross-capability restore order, adding confirmation boundaries, or implementing rollback"
---

# Composable Restore-Plan Algebra

@contract A decoded capability is inert. Its codec may project a declarative restore plan but cannot execute that plan.
@contract Every restore step has stable identity, capability instance, effect class, dependencies, required resources, preconditions, confirmation policy, redacted diagnostics, verification predicate, rollback description, and reversibility classification.
@contract Effect classes include safe-local, network-rebase, secret-unlock, store-stage, destructive-replace, merge, asset-materialize, stale-exact-replay, and unresolved-retain.
@contract The shared planner validates and topologically orders steps, detects resource conflicts, merges compatible confirmations, and rejects cycles or an irreversible step preceding an unverified required dependency.
@contract Applications own policy decisions and effect adapters. Decode success never authorizes network traffic, secret access, destructive replacement, or stale replay.
@contract Execution produces typed receipts. Required-step failure rolls back completed reversible steps in reverse dependency order and preserves the pre-import active state.
@constraint Rollback is part of the plan contract, not an exception-handler afterthought; a destructive step without an accepted recovery source is not executable.
