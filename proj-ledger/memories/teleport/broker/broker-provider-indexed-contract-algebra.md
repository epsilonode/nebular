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
@contract Provider capability is a discriminated union: static credential validation, identity introspection, refresh, token exchange, revocation, signed operation, or scoped client construction. Missing capability is rejected during planning, not discovered through an optional method call.
@contract The dynamic provider registry owns the only generic erasure point. Registration validates unique provider id, schema version, complete operation handlers, and consistent scope/secret declarations, then returns an existential provider witness.
@contract Cross-provider requests, scopes, accounts, and refresh artifacts fail decoding or typing. Never infer provider from environment-variable name or secret prefix alone.
@contract Provider adapters translate foreign failures into closed typed facts and cannot create local grants, choose consent, widen scope, persist secrets outside `SecretStore`, or render user-facing diagnostics.
@proof Conformance registers two providers with materially different authority models, proves exact dispatch and unsupported-operation rejection, and includes compile-negative cross-provider fixtures plus registry collision tests.

