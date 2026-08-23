---
id: teleport-restore-and-migration
kind: contract
status: active
created: 2026-08-22
updated: 2026-08-22
roadmap: car-teleport
refs:
  - roadmaps/car-teleport.md#transactional-import-migration-and-restore-planning
  - roadmaps/car-teleport.md#cross-project-round-trip-and-compatibility-matrix
hook: "read before changing Teleport import sequencing, migration behavior, restore plans, rollback, or cleanup"
---

# Transactional Restore And Migration

@contract Import proceeds through bounded CAR parse, full CID/DAG verification, capability inventory, strict decode, pure in-memory migration, restore planning, dependency validation, isolated staging, application commit, reopen or rebase verification, and cleanup.
@contract No parse, verification, decode, inventory, or migration phase mutates application state or performs network requests.
@contract Restore plans classify effects as safe, network-rebase, secret-bearing, destructive, unsupported, or stale exact replay and identify required operator decisions before execution.
@contract Replace and merge are application policies, not CAR parser behavior. Destructive store replacement requires an explicit approval boundary and a verified rollback source.
@contract A required-capability failure aborts the transaction. Optional unsupported capabilities remain retained and unresolved without discarding their bytes or references.
@contract Interruption, wrong passphrase, migration failure, staging failure, commit failure, or verification failure closes stores, destroys transient keys, removes temporary state, and preserves the pre-import active workspace.
