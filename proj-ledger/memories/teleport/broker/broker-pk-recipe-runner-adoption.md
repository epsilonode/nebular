---
id: broker-pk-recipe-runner-adoption
kind: strategy
status: proposed
created: 2026-08-23
updated: 2026-08-23
roadmap: broker
refs:
  - roadmaps/broker.md#git-scoped-recipe-command-authority
  - roadmaps/broker.md#adopt-and-harden-pk-ipc-and-lifecycle-semantics
  - roadmaps/broker.md#add-child-process-and-jsts-clients
hook: "read before porting or implementing pk XML recipes, leaf execution, IPC, output streaming, heartbeat polling, lifecycle operations, PM2 integration, or runner observability"
---

# PK Recipe Runner, IPC, And Lifecycle Adoption

@source Audit `R:/Code/pk` as implementation evidence, then implement the admitted behavior locally in wx-teleport-cartridge. Do not import `pk` packages or require its workspace at runtime. Where `pk` roadmap text exceeds its source/tests, treat the feature as unimplemented rather than inherited.
@format Adopt the implemented human/agent-editable XML recipe model and typed pipeline: XML boundary parse, runtime schema validation, strongly typed recipe union, parameter resolution, policy selection, receiver materialization, execution, and structured status. Preserve argv atoms rather than shell strings.
@admitted_v1 Admit only fields and behavior proven in `pk` source/tests and needed by the broker: recipe id/kind/status/inheritance where proven, source provenance, params, backend receiver, cwd/tool/argv/nonsecret env, lifecycle, stop policy, ports, probes, completion, timeout/temporal behavior where implementation tests exist, and a new versioned broker credential-slot extension. Windows defaults executable recipes to PM2; legacy `direct` is rejected at the public boundary or admitted only by an explicit internal test/bootstrap policy.
@ignore Do not assume `<requires>`, `<produces>`, fixtures/corpora/artifacts, composition, recipe-index asset resolution, `BAKE_RECIPE_ID` harness lookup, or full heartbeat service integration merely because durable `pk` memories specify them. Admit each later only with source/tests and a concrete broker need.
@leaf Use receiver-specific leaf functions instead of a general mutable process manager. Every agent-launched executable recipe selects a backend receiver; on Windows V1 that receiver is PM2. `direct` remains only an internal bootstrap/test adapter. Observe-only leaves return probe/status facts without ownership claims and do not launch work.
@status Adopt the agent-facing state vocabulary and structured facts: planned, starting, running, ready, degraded, blocked, failed, stopping, stopped, cancelled, timed out, orphaned, and unknown; PID/name/cwd/redacted argv/environment summary; ports; probes; logs; bounded output; exit code; blockers; cleanup; and next actions.
@events Adopt typed runner events for recipe loaded, policy selected/blocked, preflight started/ok/blocked, direct started/exited, PM2 requested/online/reused, probe ready, timeout, failure, and final readiness. Reducers and renderers consume events; adapters do not invent user-facing policy.
@output Preserve `pk`'s useful direct-stream mechanics and improve integration: byte-bounded stdout/stderr tails, total offsets, last-output timestamps, raw-terminal/tee/structured modes, truncation flags, and live chunks. Authorized secret-bearing recipes use the same observable path; V1 assumes the recipe/agent is well behaved and warns that child output can disclose inherited secrets.
@heartbeat Adopt tick/tock cursor semantics as the scalable agent polling model: snapshots/deltas for state, independent stdout/stderr offsets, bounded retained tocks, gap detection, stale/last-heartbeat facts, and attempt identity. Complete the runtime wiring that remains scaffolded in `pk`; do not persist plaintext output by default.
@lifecycle Adopt start/status/stop/delete semantics, exact-name cleanup, idempotent delete/not-found handling, readiness gates, bounded timeouts, safe-stop policy, orphan detection, and actionable remediation. Preserve PM2 as a receiver adapter, not broker authority; broker grants remain independent of PM2 state.
@preflight Validate recipe availability/status, parameter resolution, receiver support, Git/worktree binding, credential slots, cwd, tool resolution through declared workspace tooling, argv/env shape, port conflicts, probes, keychain/grant availability, and cleanup capability before acquiring secrets or starting opaque backend work.
@ipc `pk` currently provides typed Hono/HTTP recipe routes, but V1 broker control does not need a server. Preserve request/response/error/status semantics over inherited Bun parent-child IPC between `recipe-runner.js` and a short-lived `broker.js` control process. Use versioned JSON envelopes, request/attempt ids, bounded messages, cancellation, disconnect handling, and redacted terminal outcomes.
@direct_materialization PM2 starts and directly manages the requested target command. Do not add a resident Bun wrapper per attempt. Its config contains nonsecret repository, recipe, attempt, protocol, observation, and opaque grant/bootstrap references only.
@process_lifetime PM2 owns target start/status/stop/delete and restart policy. Agent/control-side evaluators compose PM2 state, output cursors, probes, cooperative heartbeats, deadlines, and process-tree facts into universal status. Credential bootstrap is short-lived inside compatible target runtimes and does not become the long-lived observer.
@long_lived A secret-bearing managed leaf holds a lease for its full process lifetime. Expiry or revocation triggers exact safe-stop/delete and records the terminal result; if the recipe lacks an enforceable safe termination policy, policy rejects secret delivery. Capsule restart revalidates the grant and never silently recreates expired authority.
@fp Keep parsing, normalization, policy, state reduction, status shaping, heartbeat deltas, and error mapping pure. Keep Git, filesystem, keychain, IPC, PM2, process, clock, prompt, and journal behavior behind explicit capability ports interpreted in `broker.js`.
@proof Port focused fixtures from implemented `pk` behavior, then add broker-specific proofs for repository approval, credential slots, inherited Bun IPC disconnect/cancellation, short-lived bootstrap, live secret-bearing output, cursor gaps, PM2 direct materialization, exact cleanup, orphan reporting, PM2 reuse mismatch, alternative receiver conformance, bounded overhead, and no broker-originated secret persistence.
