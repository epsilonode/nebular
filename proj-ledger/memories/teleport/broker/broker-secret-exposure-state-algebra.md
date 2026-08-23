---
id: broker-secret-exposure-state-algebra
kind: contract
status: proposed
created: 2026-08-23
updated: 2026-08-23
roadmap: broker
refs:
  - roadmaps/broker.md#expand-domain-algebras-and-lawful-composition
  - roadmaps/broker.md#secret-delivery-hierarchy
hook: "read before representing keychain references, plaintext secrets, encrypted bytes, secret leases, redaction, export encryption, or child environment delivery"
---

# Secret Exposure-State Algebra

@contract Distinguish stored secret reference, protected transfer bytes, scoped plaintext secret, operation handle, and lease identity as incompatible opaque types. A reference is never assignable to plaintext and encrypted bytes are never treated as decoded secret text.
@contract `SecretStore` exposes scoped use rather than general retrieval: resolve a reference, acquire a redacted secret resource, execute one authorized callback/effect, and finalize the resource on success, failure, or interruption.
@contract Plaintext wrappers expose no JSON serialization, useful inspection, equality, cloning, concatenation, or default string conversion. Explicit delivery adapters alone may reveal the underlying value inside their Scope.
@contract Secret exposure class is part of planned effects: none, opaque handle, provider operation, child environment, transfer encryption, or elevated raw compatibility. Policy and consent operate on this class before acquisition.
@contract Export acquires plaintext only after recipient and plan authorization, encrypts before writing blocks, and releases it. Import decrypts inside isolated staging, writes through `SecretStore`, and releases plaintext without persisting decoded CAR blocks.
@contract Effect Scope/finalizers enforce lifetime in privileged runtime; portable types and IPC carry only opaque ids and redacted metadata. Type discipline reduces accidental exposure but does not claim same-user sandboxing or guaranteed JavaScript memory erasure.
@proof Tests cover inspection/serialization resistance, finalization under every exit, no acquisition before consent, no persistence in reports/journals, correct exposure-class policy, artifact scans, and compile-negative reference/plaintext confusion.

