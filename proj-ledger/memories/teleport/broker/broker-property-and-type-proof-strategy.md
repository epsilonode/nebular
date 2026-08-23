---
id: broker-property-and-type-proof-strategy
kind: strategy
status: proposed
created: 2026-08-23
updated: 2026-08-23
roadmap: broker
refs:
  - roadmaps/broker.md#expand-domain-algebras-and-lawful-composition
  - roadmaps/broker.md#fp-and-tooling-conformance
hook: "read before adding algebra laws, property tests, compile-negative fixtures, type assertions, fuzz generators, or proof gates"
---

# Property And Type Proof Strategy

@dependency Add pinned `fast-check` 4.9.0 as a development dependency for generated algebra-law and hostile-boundary tests. Use Vitest `expectTypeOf` plus dedicated `tsc` negative fixtures unless a separate type-test package proves necessary.
@generator Define bounded generators only through public constructors for ids, scope sets, time windows, plans, state events, warnings, reports, protocol values, and cartridge graphs. Add separate raw-unknown generators for decoder rejection.
@law Prove scope lattice normalization/intersection/subset laws, temporal intersection/monotonicity, grant/lease non-escalation, validation/report combination, Result composition, reducer determinism, replay idempotence, plan ordering, reverse rollback, redaction monotonicity, and canonical codec idempotence.
@type Compile-negative fixtures prove unverified cannot decode, planned cannot commit, credential cannot act as grant, grant cannot act as lease, provider scopes cannot cross providers, secret reference cannot act as plaintext, portable/client cannot satisfy privileged requirements, and insufficient ports cannot execute richer operations.
@type_gate Keep compile-negative fixtures outside every production/test declaration build and include them only through `tsconfig.type-negative.json`. Every forbidden assignment or call carries `@ts-expect-error`; the gate fails both when an illegal edge compiles without the expected diagnostic and when a stale expectation no longer corresponds to a compiler error.
@contract Property failures record seed and minimal counterexample through redacted test output. Security-sensitive values use synthetic fixtures and never real credentials.
@contract Bound generator size by production budgets so tests remain deterministic and useful; supplement with explicit maximum-boundary and malformed byte fixtures.
@gate Laws are part of ordinary `mise run test`, compile-negative fixtures run through the dedicated `verify:type-policy` gate, and browser/runtime cross-environment laws remain focused conformance tasks included by final verification. A clean build must not depend on declarations or artifacts left by an earlier run.
