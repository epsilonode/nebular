---
id: broker-domain-algebra-implementation-sequence
kind: strategy
status: proposed
created: 2026-08-23
updated: 2026-08-23
roadmap: broker
refs:
  - roadmaps/broker.md#expand-domain-algebras-and-lawful-composition
  - roadmaps/broker.md#hard-fp-tooling-and-fast-migration
hook: "read before sequencing implementation of domain primitives, authority algebra, state machines, reducers, plans, secret states, codec witnesses, properties, or ownership lint"
---

# Domain Algebra Implementation Sequence

@strategy Land algebras from foundational values toward privileged interpretation. Each phase removes the primitive/branching API it replaces, adds laws and negative fixtures, and keeps canonical CAR vectors plus consumer behavior green.
@sequence Phase 1 establishes identity, nonempty collection, positive bound, Instant, Duration, TimeWindow, provider id, account/environment, scope, credential reference, grant/lease/transfer ids, canonical project root, and constructor-only brand policy.
@sequence Phase 2 implements warning-preserving accumulating Validation and fail-fast Operation façades over neverthrow, typed error families, deterministic report combination, and their algebra laws.
@sequence Phase 3 implements provider-indexed scope/authority lattices and temporal derivation, then models credential record, provider authority, local grant, and lease as incompatible domains with non-escalation proofs.
@sequence Phase 4 introduces cartridge/import trust states and pure request, consent, grant, lease, renewal, revocation, export, import, replay, and recovery state machines with exhaustive transition tables.
@sequence Phase 5 introduces reducer transitions containing next state, closed effect commands, audit facts, and warnings; live IO remains absent while deterministic and replay tests land.
@sequence Phase 6 implements the composable broker plan algebra, typed step metadata, dependency/resource/authority validation, confirmation projection, and recovery obligations; align shared mechanics with neutral restore planning without hiding credential semantics.
@sequence Phase 7 introduces secret exposure-state types and scoped secret-use contracts, then implements broker Effect services/interpreters and Result/Effect conversion at the single privileged composition boundary.
@sequence Phase 8 refactors capability codecs into typed witnesses, separates migration/dependency/restore algebras, confines registry erasure, and lands credential requirement plus secret-transfer codecs without changing locked bytes unintentionally.
@sequence Phase 9 activates algebra ownership lint and default-deny import rules, removes temporary assertion/effect/state exceptions, and verifies the four artifact graphs.
@sequence Phase 10 expands fast-check properties, compile-negative fixtures, interruption/fault injection, browser/Bun conformance, keychain/replay recovery, and artifact security scans.
@sequence Phase 11 evaluates optics only against measured nested-update duplication; default outcome is no dependency unless the adoption card's trigger and proof are satisfied.
@gate Do not begin provider effects or UI before phases 1-6 stabilize their pure contracts. Do not expose secret plaintext before phase 7 scoped lifetime proof. Do not migrate consumers before phase 9 package declarations and artifact boundaries pass.
@gate A phase completes only with zero-warning lint, strict compile including negative fixtures, unit/law tests, recorded composition simplification, removed obsolete API, and no regression in canonical vectors, streaming budgets, or recovery behavior.
