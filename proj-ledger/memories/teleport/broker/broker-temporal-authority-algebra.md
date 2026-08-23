---
id: broker-temporal-authority-algebra
kind: contract
status: proposed
created: 2026-08-23
updated: 2026-08-23
roadmap: broker
refs:
  - roadmaps/broker.md#expand-domain-algebras-and-lawful-composition
hook: "read before implementing timestamps, TTLs, expiration, lease duration, transfer lifetime, renewal windows, clock access, or timeout policy"
---

# Temporal Authority Algebra

@contract Define constructed `Instant`, positive bounded `Duration`, and nonempty `TimeWindow { issuedAt, expiresAt }`. Raw numbers, date strings, and `Date` objects do not enter domain policy.
@algebra Provide pure `expiresAfter`, `contains`, `isExpired`, `remaining`, `intersectWindows`, `clampDuration`, and canonical wire encode/decode operations. All current-time decisions receive a `Clock` fact or port.
@law Effective lease expiry is the earliest of requested expiry, grant expiry, upstream credential expiry when known, transfer expiry when applicable, policy maximum, and delivery-mode maximum.
@law Advancing the clock never increases remaining duration; a lease never outlives its grant; a grant never outlives known upstream authority; a consumed or revoked authority does not become active through clock rollback.
@contract Distinguish local grant expiry, secret lease expiry, upstream token expiry, consent-proof validity, transfer expiry, prompt timeout, and IPC request deadline. One timestamp cannot stand for several meanings.
@contract Unknown upstream expiry is explicit and governed by a conservative local maximum; it is not represented as infinity or omitted policy.
@contract Persist canonical UTC instants with schema version and decode bounds. Monotonic elapsed-time adapters may enforce in-process deadlines, while persisted authority decisions use wall-clock instants plus rollback/replay protections.
@proof Property tests cover window intersection laws, minimum-expiry derivation, boundary equality, overflow and invalid duration rejection, deterministic serialization, clock advancement, clock rollback handling, and renewal constraints.

