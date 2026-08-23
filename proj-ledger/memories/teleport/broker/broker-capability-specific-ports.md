---
id: broker-capability-specific-ports
kind: contract
status: proposed
created: 2026-08-23
updated: 2026-08-23
roadmap: broker
refs:
  - roadmaps/broker.md#strengthen-typing-and-functional-boundaries
  - roadmaps/broker.md#add-provider-adapters-and-renewal
hook: "read before defining optional adapter methods, provider capabilities, keychain operations, transport stores, IPC services, or broker/client ports"
---

# Capability-Specific Ports

@contract Functions request the smallest port that guarantees the operations they require. Avoid broad ports with optional methods that create runtime unsupported-operation states.
@contract Separate immutable object storage, mutable-head publication, object reading, range reading, and multipart optimization. Optional optimization is permitted only when a complete behaviorally equivalent fallback exists.
@contract Separate secret get/set/delete behavior from enumeration, OS-user verification, refresh authority, provider revocation, and raw-secret delivery. A port's type documents its authority.
@contract Provider adapters expose discriminated supported operations and provider-specific scope validation. A provider without refresh authority cannot satisfy a renewal transition that requires upstream renewal.
@contract IPC client and server ports separate connection/authentication, request exchange, event delivery, cancellation, and shutdown as needed; importing a client capability cannot start or administer the server.
@contract Prefer closed outcome unions such as created/existing, deleted/missing, approved/denied/cancelled, and committed/recovery-required over booleans whose meaning depends on the caller.
@contract Constructors validate adapter configuration once and return a typed capability. Business functions do not repeatedly probe optional members or inspect runtime method presence.
@proof Contract tests demonstrate that insufficient ports cannot type-check at call sites, optimizations preserve fallback semantics, unsupported provider authority fails before effects, and adapters return closed outcomes for every declared operation.

