---
id: broker-report-combination-algebras
kind: contract
status: proposed
created: 2026-08-23
updated: 2026-08-23
roadmap: broker
refs:
  - roadmaps/broker.md#expand-domain-algebras-and-lawful-composition
hook: "read before merging warnings, issues, audit facts, receipts, rollback results, cleanup results, recovery evidence, or redaction levels"
---

# Report Combination Algebras

@contract Define separate named combination functions for warnings, validation issues, audit facts, execution receipts, rollback reports, cleanup reports, and recovery evidence. Do not use a generic structural merge across unrelated semantics.
@contract Each report type declares stable identity, deterministic canonical ordering, duplicate behavior, identity element when valid, redaction classification, and whether combination is fail-fast or accumulating.
@law Warning, audit, rollback, and cleanup combination is associative. Empty identity is permitted only for report types where absence is meaningful. Deduplication uses stable semantic identity, never message text.
@law Combining reports never discards failure, unresolved recovery, secret-exposure classification, or stricter redaction. Redaction combines by maximum restriction and cannot be downgraded by later input.
@contract Rollback and cleanup reports retain attempted, succeeded, failed, skipped, retryable, and journal-required outcomes per step. The primary operation failure remains distinct from recovery failures.
@contract Audit combination preserves causal order within a transaction and deterministic ordering across independent validations. Human rendering occurs only after combination.
@proof Property tests cover associativity, identity, deterministic order, stable deduplication, no failure loss, redaction monotonicity, and serialization round trips.

