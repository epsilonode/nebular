---
id: broker-possession-versus-authority-algebra
kind: contract
status: proposed
created: 2026-08-23
updated: 2026-08-23
roadmap: broker
refs:
  - roadmaps/broker.md#expand-domain-algebras-and-lawful-composition
  - roadmaps/broker.md#encrypted-car-is-the-explicit-portability-channel
hook: "read before deriving grants from imported credentials, representing stored credentials, issuing leases, or deciding whether possession implies authorization"
---

# Credential Possession Versus Authority

@contract Separate four domains: a keychain `CredentialRecord`, factual upstream `ProviderAuthority`, locally consented `LocalGrant`, and operation-specific `SecretLease`. None is structurally assignable to another.
@shape A credential record contains opaque reference, provider/account/environment identity, secret kind, known upstream authority and expiry facts, lifecycle metadata, and no local project permission.
@shape A local grant binds canonical project, credential reference, effective operation/scope set, delivery modes, local time window, consent evidence reference, and revocation generation.
@shape A lease binds one grant generation, one request/client/process identity, one narrowed operation set, one delivery mode, and a no-longer-lived time window.
@contract Encrypted CAR import may create or replace a credential record after verification and consent, but cannot create a local grant from portable project metadata. Grant construction always runs destination policy and consent.
@contract Secret possession does not prove provider authority: provider scopes and expiry are decoded/verified factual metadata or refreshed facts. Unknown authority narrows use or requires provider introspection.
@contract Revocation increments or replaces the grant generation so previously issued leases fail validation even when their nominal time window remains open.
@proof Compile-negative tests reject credential-as-grant and grant-as-lease use. Runtime tests prove imported project bindings cannot authorize use, revoked generations invalidate leases, and lease derivation only narrows authority.

