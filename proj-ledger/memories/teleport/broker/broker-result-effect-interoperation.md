---
id: broker-result-effect-interoperation
kind: contract
status: proposed
created: 2026-08-23
updated: 2026-08-23
roadmap: broker
refs:
  - roadmaps/broker.md#strengthen-typing-and-functional-boundaries
  - roadmaps/broker.md#implement-os-backed-vault-and-local-broker
hook: "read before composing neverthrow with Effect, translating broker outcomes to IPC, handling warnings, or deciding where an effect program begins and ends"
---

# Result And Effect Interoperation

@contract Pure parsing, validation, migration, policy, state transition, plan composition, and public client operations use neverthrow Results. Portable asynchronous ports and the unprivileged client use ResultAsync.
@contract Broker orchestration begins as Effect only after an already-parsed authenticated command enters the privileged runtime. Broker domain functions called by the program remain plain pure functions returning values or Results.
@contract Convert `Result<A,E>` to Effect with one helper that preserves the exact typed error. Convert Effect Exit to a closed broker outcome only at IPC reply, CLI exit, or test-interpreter boundaries.
@contract Do not repeatedly alternate Result, Promise, ResultAsync, and Effect within a pipeline. Each function's layer has one primary composition type; boundary helpers perform explicit one-way transitions.
@contract Teleport validation success is `Warned<A>` containing value and ordered warnings; failure is a nonempty issue set. Effect orchestration must preserve warnings in receipts and sanitized diagnostics rather than treating them as logs or failures.
@contract Foreign promise or callback APIs are captured at adapter construction. A synchronously throwing promise factory is wrapped as a thunk; a rejecting promise maps `unknown` into one closed adapter error family.
@contract Cancellation is a typed broker outcome when user, caller, timeout, lease expiry, or shutdown initiates it. Effect interruption is mapped to that outcome with the current transaction phase and recovery journal reference when necessary.
@contract Defects remain defects. Do not catch assertion failures, impossible-state defects, or library invariant corruption and relabel them as user denial or provider unavailability.
@proof Tests cover every conversion helper, warning preservation, sync throw before promise creation, rejected promise, typed Effect failure, interruption, defect propagation, and redacted IPC/CLI projection.

