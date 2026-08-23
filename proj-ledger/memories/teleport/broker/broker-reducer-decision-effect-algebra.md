---
id: broker-reducer-decision-effect-algebra
kind: contract
status: proposed
created: 2026-08-23
updated: 2026-08-23
roadmap: broker
refs:
  - roadmaps/broker.md#expand-domain-algebras-and-lawful-composition
hook: "read before implementing broker state, events, reducers, effect commands, completion correlation, audit derivation, or replayable policy decisions"
---

# Reducer, Decision, And Effect Algebra

@contract Each lifecycle domain owns closed immutable `State`, `Command`, `Event`, `EffectCommand`, and `Transition` unions. Reducers are total pure functions from state plus event/command to a typed transition or transition error.
@shape A transition contains next state, ordered effect commands, redacted audit facts, warnings, and optional terminal projection. It never executes IO or mutates the previous state.
@contract Effect commands carry stable request/transaction correlation ids, expected predecessor generation, required authority class, idempotency key, deadline, and redacted operands. Secret values remain opaque handles resolved only by the interpreter.
@contract Effect interpreters return closed completion events. Reducers reject or no-op stale, duplicate, mismatched, or terminal completions according to explicit laws; adapters do not mutate state directly.
@contract Audit facts are derived alongside the decision so logging cannot invent a different interpretation later. Rendering, persistence, and transport of audit facts are separate effects.
@contract Use ts-pattern exhaustive matches or exhaustive switches for every state/event pair. Unsupported pairs return a typed illegal-transition result rather than falling through.
@constraint Do not introduce a generic free-monad framework. Closed domain effect unions plus interpreters are sufficient and preserve readable security review.
@proof Table-driven tests cover the state/event product, correlation guards, duplicate/idempotent behavior, terminal-state closure, deterministic effects/audit, state immutability, and replay equivalence.

