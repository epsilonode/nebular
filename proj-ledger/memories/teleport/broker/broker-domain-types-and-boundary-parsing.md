---
id: broker-domain-types-and-boundary-parsing
kind: contract
status: proposed
created: 2026-08-23
updated: 2026-08-23
roadmap: broker
refs:
  - roadmaps/broker.md#strengthen-typing-and-functional-boundaries
  - roadmaps/broker.md#define-closed-broker-contracts-and-threat-model
hook: "read before defining broker identifiers, project bindings, scopes, versions, time values, IPC decoders, or any parser for untrusted input"
---

# Broker Domain Types And Boundary Parsing

@contract Parse and validate every external value once at its ingress boundary, then pass only constructed domain types through internal logic. TypeScript assertions do not establish trust.
@contract Use opaque or branded types with total `parse` constructors for capability id, instance id, provider id, credential reference, account/environment id, canonical project root, scope/operation, request/grant/lease/transfer id, schema version, instant, duration, and CID text.
@contract Constructors return typed results and normalize only behavior explicitly owned by the contract. They never silently trim, case-fold, resolve a path, follow a symlink, guess an account, or coerce a number unless the specific domain type defines that operation.
@contract Canonical project identity is produced by a filesystem-aware boundary adapter that resolves the requested root and its security-relevant aliases before constructing `CanonicalProjectRoot`; pure policy code never compares caller-provided path strings.
@contract Nonempty collections, positive limits, bounded durations, future expirations, and provider-supported scope sets use constructors that make their cardinality and bounds explicit.
@contract IPC, keychain metadata, CAR payloads, provider responses, CLI arguments, environment values, and persisted profile records enter as `unknown` and are decoded into closed domain values before policy evaluation.
@contract Serialization projects branded internal values back into explicit wire schemas; branded values are not treated as runtime validation or emitted by spreading arbitrary objects.
@constraint Keep brands structural and dependency-free. Do not create class hierarchies, ambient global brands, or constructors that perform network, keychain, consent, or clock effects.
@proof Boundary tests cover malformed values, Unicode and case ambiguity, path aliases and symlinks, traversal attempts, oversized inputs, duplicate scopes, invalid time intervals, and encode/decode round trips.

