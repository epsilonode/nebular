---
id: broker-validation-versus-operation-composition
kind: contract
status: proposed
created: 2026-08-23
updated: 2026-08-23
roadmap: broker
refs:
  - roadmaps/broker.md#expand-domain-algebras-and-lawful-composition
hook: "read before choosing fail-fast versus accumulating errors, composing decoders, validating requests, or chaining dependent broker operations"
---

# Validation Versus Dependent Operation Composition

@contract Define warning-preserving accumulating `Validation<A>` separately from fail-fast dependent `Operation<A,E>`, even when both use neverthrow as the underlying representation.
@validation Independent fields and constraints accumulate all applicable issues: CLI/IPC fields, grant-policy constraints, provider declarations, configuration, CAR inventory, consent-display facts, and profile documents.
@operation Dependent flows short-circuit through `andThen`: verify then unlock then decode; authenticate then authorize then lease; stage then commit then verify; import then keychain write then replay commit.
@contract Accumulation combines nonempty issue collections with deterministic path and category ordering. A later validation must not run when its input depends on a failed decoder, but sibling field validations should still accumulate.
@contract Warnings remain successful evidence and accumulate in order. Policy narrowing, deprecated schema, unknown optional capability, conservative expiry, and unavailable enhancement warnings never become logs-only side channels.
@contract Name helpers by semantics—`validateAll`, `traverseValidation`, `andThenOperation`, `liftForeignTask`—rather than exposing several ambiguous `combine` functions.
@proof Laws cover validation accumulation associativity and ordering, fail-fast dependency behavior, warning preservation, no empty failure, and equivalence between sequential and composed success paths.

