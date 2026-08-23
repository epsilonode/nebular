---
id: broker-typed-restore-effects-and-recovery
kind: contract
status: proposed
created: 2026-08-23
updated: 2026-08-23
roadmap: broker
refs:
  - roadmaps/broker.md#strengthen-typing-and-functional-boundaries
  - roadmaps/broker.md#implement-encrypted-credential-car-export-and-import
hook: "read before changing restore execution, typed effect handlers, keychain import staging, receipts, rollback, cleanup, or recovery journals"
---

# Typed Restore Effects And Recovery Outcomes

@contract Keep restore plans declarative and serializable, then resolve each effect kind through an application-owned typed handler whose command, staged value, commit receipt, verification, rollback, and cleanup types remain related.
@contract The handler registry may existentially erase those related types inside one audited dispatch boundary; application handlers and tests do not exchange unstructured `unknown` tokens.
@contract Execution composes `TaskResult` values directly and never throws issue arrays for expected commit or verification failure.
@contract Stage all required reversible work before commit. Commit follows the verified dependency order; rollback follows reverse commit order; cleanup covers every acquired staged resource.
@contract Rollback and cleanup failures are first-class report data, not discarded `allSettled` results. Execution returns a closed outcome: committed, recovered, or recovery-required with a durable journal reference.
@contract Every effect accepts cancellation where the underlying operation supports it. Cancellation does not erase the distinction between uncommitted staging, committed state, and pending recovery.
@contract Credential import treats keychain write and consumed-transfer replay recording as one recoverable logical transaction. An interruption cannot silently leave both a reusable transfer and an untracked destination credential.
@contract Secret-bearing staged values and receipts use opaque secret handles or leases wherever possible; reports and journals contain only redacted stable references.
@proof Conformance injects failure and termination at every stage, commit, verify, rollback, cleanup, keychain-write, and replay-record boundary and proves exact terminal state plus recoverable journal behavior.

