---
id: broker-composable-plan-algebra
kind: contract
status: proposed
created: 2026-08-23
updated: 2026-08-23
roadmap: broker
refs:
  - roadmaps/broker.md#expand-domain-algebras-and-lawful-composition
  - roadmaps/broker.md#implement-encrypted-credential-car-export-and-import
hook: "read before defining broker plans, planned steps, dependencies, resource conflicts, confirmation boundaries, retries, idempotency, or recovery behavior"
---

# Composable Broker Plan Algebra

@contract Model request, renewal, revocation, child delivery, encrypted export, encrypted import, and recovery as declarative plans assembled from closed typed steps before effects execute.
@shape Every step declares stable id, operation kind, dependencies, required authority, resources, secret exposure class, confirmation policy, deadline, idempotency semantics, retry policy, verification predicate, reversibility, rollback description, and recovery-journal requirement.
@algebra Provide plan constructors, validated concatenation, dependency augmentation, resource-conflict detection, topological ordering, confirmation grouping, authority aggregation, and plan projection to redacted consent/audit views.
@contract Composition rejects duplicate ids, missing dependencies, cycles, unordered resource conflicts, authority gaps, irreversible work before required reversible verification, and secret exposure without an authorized delivery mode.
@contract Retry is never a generic boolean. Steps declare never, idempotent, conditional-on-version, or resume-from-journal behavior with stable idempotency keys.
@contract Planning remains pure. Resolution binds each step to a typed handler only after policy authorization; execution cannot invent additional undeclared effects.
@contract Broker plans may reuse neutral restore-plan vocabulary and algorithms, but credential-specific authority, secret exposure, replay consumption, and keychain journal semantics remain explicit extensions rather than hidden strings.
@proof Property tests cover composition associativity for compatible plans, deterministic order, cycle/conflict rejection, confirmation aggregation, authority monotonicity, and preservation of every declared rollback/recovery obligation.

