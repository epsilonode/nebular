---
id: broker-scope-and-authority-lattice
kind: contract
status: proposed
created: 2026-08-23
updated: 2026-08-23
roadmap: broker
refs:
  - roadmaps/broker.md#expand-domain-algebras-and-lawful-composition
hook: "read before implementing provider scopes, requested operations, consented authority, grant derivation, lease narrowing, scope expansion, or authorization comparison"
---

# Scope And Authority Lattice

@contract Replace scope string arrays with a provider-owned canonical `ScopeSet<Provider>` constructed from a nonempty decoded collection. Construction validates provider vocabulary, removes exact duplicates, applies declared implication rules, and emits deterministic ordering.
@algebra Define `contains(granted, required)`, `intersect`, `difference`, `equals`, and request-only `union`. `intersect` derives effective authority; `union` never mutates an existing grant and only constructs a new request that requires policy and consent.
@law Lease scopes are a subset of grant scopes; grant scopes are a subset of local consent, provider credential authority, and project policy; renewal never widens authority without a new request and consent.
@law Effective authority is the intersection of requested, locally consented, provider credential, project policy, delivery-mode, and environment/account constraints. Missing authority produces a typed denial rather than a partial accidental grant.
@contract Model provider scope implication explicitly as data or pure functions. Never infer hierarchy from string prefixes, separators, display labels, or undocumented provider behavior.
@contract Unknown portable scopes remain factual imported metadata and cannot be activated. A provider adapter may migrate known historical scope identifiers through a versioned pure mapping.
@contract Authorization decisions return granted effective scope, denied requirements, narrowing warnings, and the evidence sources used. UI renders this result; it does not recompute scope logic.
@proof Property tests cover normalization idempotence, intersection commutativity/associativity/idempotence, subset transitivity, difference correctness, deterministic ordering, no widening through derivation, and cross-provider type rejection.

