---
id: broker-fp-runtime-package-contract
kind: decision
status: proposed
created: 2026-08-23
updated: 2026-08-23
roadmap: broker
refs:
  - roadmaps/broker.md#hard-fp-tooling-and-fast-migration
  - roadmaps/broker.md#strengthen-typing-and-functional-boundaries
hook: "read before adding, removing, upgrading, importing, or choosing between neverthrow, Effect, Remeda, ts-pattern, Zod, fp-ts, or another FP/schema package"
---

# FP Runtime Package Contract

@dependency Pin `neverthrow` 8.2.0 for portable/client `Result` and `ResultAsync` composition, `remeda` 2.39.0 for selected immutable data pipelines, `ts-pattern` 5.9.0 for exhaustive discriminated-union matching, and `zod` 4.4.3 for ordinary untrusted JSON/CLI/IPC/profile/provider boundaries.
@dependency Pin Effect 3.22.1 only for privileged `broker.js` structured concurrency, cancellation, queues/deferred coordination, scoped acquisition/finalization, redacted values, retry schedules, and typed service layers.
@dependency Pin `fast-check` 4.9.0 as a development-only dependency for domain algebra laws and bounded hostile-input generation; it never enters the four runtime artifacts.
@neverthrow Centralize imports through project façades that define warning-preserving validation, nonempty issues, foreign exception mapping, and public result policy. Use `ResultAsync.fromThrowable` or an equivalent safe thunk wrapper when a foreign promise-returning function may throw synchronously.
@effect Keep Effect inside broker runtime/composition modules. Use services for domain-owned ports, Layer only at composition, Scope/acquire-release for server sockets, leases, keychain-returned secret lifetimes, staging, journals, and child processes, and explicit Exit mapping at the outer CLI/IPC boundary.
@effect Do not wrap pure synchronous domain functions in Effect merely for uniform syntax. They return immutable values or neverthrow Results and remain executable without the broker runtime.
@remeda Use Remeda when a named pipeline materially clarifies multi-stage transformation, grouping, sorting, partitioning, or immutable update. Native map/filter/reduce and clear recursion remain valid; do not mandate a library call for every collection operation.
@pattern Use ts-pattern for request/grant/lease/transfer/execution state machines and multi-variant error projection with `.exhaustive()`. Two-way guards and validation predicates may remain ordinary expressions.
@zod Use Zod at IPC envelopes, CLI/config/profile documents, provider JSON, and persisted nonsecret metadata. Prefer safe parsing that returns typed issues. Do not use Zod for canonical DAG-CBOR encoding, byte/depth/node budgets, CID verification, raw blocks, or cryptographic envelope parsing owned by the Teleport codec kernel.
@avoid Do not add fp-ts. Do not use Effect Schema and Zod for the same wire document. Do not expose neverthrow or Effect implementation classes in serialized data. Do not import Effect into `teleport.js` or `broker-client.js`.
@upgrade Package upgrades require Mise-managed install, type-aware lint, strict compile, unit/law tests, golden vectors, browser proof, broker interruption proof, isolated package import, and bundle inventory. Caret ranges are not used for the security-sensitive core toolchain.
