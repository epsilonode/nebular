---
id: broker-result-task-result-and-error-algebra
kind: contract
status: proposed
created: 2026-08-23
updated: 2026-08-23
roadmap: broker
refs:
  - roadmaps/broker.md#strengthen-typing-and-functional-boundaries
  - roadmaps/broker.md#security-and-lifecycle-conformance
hook: "read before changing Result, asynchronous error handling, diagnostic composition, warning accumulation, exception conversion, or broker error rendering"
---

# Result, TaskResult, And Typed Error Algebra

@contract Standardize pure expected-failure composition on pinned `neverthrow` `Result<Value, Issue>` and portable/client asynchronous composition on `ResultAsync<Value, Issue>`. Expose these through project-owned façade modules so dependency APIs and error policy do not leak arbitrarily across the source tree.
@contract Preserve Teleport's warning semantics as `Result<Warned<Value>, NonEmptyIssues>`, where `Warned<Value>` contains the semantic value and ordered warnings. Do not silently drop warnings merely to adopt a package API.
@contract Failure contains a nonempty issue collection. Project helpers for `map`, `andThen`, `mapErr`, `combine`, `combineWithAllErrors`, `traverse`, foreign exception conversion, and contextual annotation preserve deterministic warning and issue order.
@contract The privileged broker runtime may use `Effect<Value, Issue, Requirements>` internally for scoped resources and concurrency; its public functions, IPC projections, and cartridge/client boundaries translate to closed project result or wire outcomes exactly once at the composition edge.
@contract Ordinary validation, policy denial, missing data, provider rejection, keychain failure, cancellation, and transaction failure flow through typed results rather than thrown arrays or exception-driven branching.
@contract Exceptions are caught only at foreign effect boundaries and translated immediately into closed internal issue variants. Programming defects may still throw and fail fast; they are not relabeled as user or provider errors.
@contract Define subsystem-specific discriminated issue families for codec, graph, policy, consent, keychain, IPC, provider, lease, transfer, execution, rollback, and cleanup. UI text and redacted logs render these structured issues at the outer boundary.
@contract Internal causes and public diagnostics remain separate. Secret values, provider response bodies, raw exception messages, filesystem details, and IPC payloads never enter user-visible or persisted issue data without explicit redaction.
@constraint Do not create a second hand-rolled async result library, mix rejected promises with `ResultAsync`, expose Effect requirements from `teleport.js` or `broker-client.js`, or use both Zod and Effect Schema for the same wire contract.
@constraint Avoid point-free style and generic abstraction that obscures domain transitions. Package adoption exists to delete bespoke branching and cleanup glue, not to maximize FP vocabulary.
@proof Algebra tests cover identity and associativity for supported composition, deterministic warning order, nonempty failures, contextual annotation, exception conversion, and public diagnostic redaction.
