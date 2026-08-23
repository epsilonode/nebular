---
id: broker-provider-indexed-contract-algebra
kind: contract
status: proposed
created: 2026-08-23
updated: 2026-08-23
roadmap: broker
refs:
  - roadmaps/broker.md#expand-domain-algebras-and-lawful-composition
  - roadmaps/broker.md#add-provider-adapters-and-renewal
hook: "read before defining providers, accounts, provider scopes, secret kinds, refresh authority, provider registries, or generic provider adapters"
---

# Provider-Indexed Contract Algebra

@contract A provider contract indexes its provider id, scope type, account/environment type, secret-kind union, credential metadata, request schema, and supported operations. Provider-specific values cannot cross provider types without explicit registry erasure.
@contract Each provider supplies pure decoders/encoders, scope algebra, account normalization, secret-kind rules, upstream expiry interpretation, redacted display projection, and capability declaration. Effects live in a separate adapter implementing only declared provider operations.
@scope Construct provider scope sets only through the sealed contract witness. Scope sets are nonempty, unique, sorted, implication-closed, and indexed by the provider id and scope vocabulary; private seals prevent structural fabrication outside the module.
@implication Require a bounded acyclic implication graph whose nodes all belong to the declared vocabulary. Normalization is deterministic and idempotent; containment and equality include implied scopes; intersection never widens; difference is exact; union is explicitly a request-building upper bound and never an authority grant.
@contract Provider capability is a discriminated union: static credential validation, identity introspection, refresh, token exchange, revocation, signed operation, or scoped client construction. Missing capability is rejected during planning, not discovered through an optional method call.
@contract The dynamic provider registry owns the only generic erasure point. Registration validates unique provider id, schema version, complete operation handlers, and consistent scope/secret declarations, then returns an existential provider witness.
@dispatch The erased witness exposes only provider id, schema version, declared capabilities, and a redacted planner. Dispatch rejects an unregistered provider or unsupported capability before invoking the provider request decoder or any effect adapter.
@contract Cross-provider requests, scopes, accounts, and refresh artifacts fail decoding or typing. Never infer provider from environment-variable name or secret prefix alone.
@contract Provider adapters translate foreign failures into closed typed facts and cannot create local grants, choose consent, widen scope, persist secrets outside `SecretStore`, or render user-facing diagnostics.
@proof Conformance proves implication-cycle and invalid-vocabulary rejection, normalization/idempotence, commutative non-widening intersection, request-union upper bounds, exact difference, registry collision, redacted exact dispatch, unsupported-operation rejection before decoder/effect execution, and compile-negative cross-provider scope use and seal fabrication. Before calling the abstraction universal, also register two real providers with materially different authority models.
