---
id: broker-direct-receiver-materialization
kind: contract
status: proposed
created: 2026-08-23
updated: 2026-08-23
roadmap: broker
refs:
  - roadmaps/broker.md#adopt-and-harden-pk-ipc-and-lifecycle-semantics
  - memories/teleport/broker/broker-universal-process-receiver.md
  - memories/teleport/broker/broker-process-receiver-algebra.md
  - memories/teleport/broker/broker-agent-objective-observability.md
  - memories/teleport/broker/broker-receiver-secret-delivery.md
  - memories/teleport/broker/broker-pm2-execution-capsule.md
hook: "read before implementing PM2 materialization, adding a process wrapper, choosing a credential bootstrap, measuring receiver overhead, or changing direct target supervision"
---

# PM2 Direct Receiver Materialization

@decision PM2 directly manages every Windows V1 target command. Do not insert a resident Bun execution capsule between PM2 and each target; that rejected topology adds one runtime, event loop, handle set, and memory footprint per managed process.
@topology Normal execution is `agent -> recipe-runner.js -> short-lived broker control over inherited Bun IPC -> PM2 -> requested command`. Broker control exits after the bounded materialization/status operation. PM2 supplies durable cross-invocation ownership.
@universal Direct materialization does not weaken the universal process contract. Every command still has an exact receiver identity, lifecycle class, startup/readiness/liveness/stall/deadline policy, output cursors, cancellation, cleanup, reconciliation, and actionable status.
@pm2 Materialize the validated recipe to a typed PM2 config with exact name, direct script/interpreter/argv, canonical cwd, filtered nonsecret environment, ports/probes metadata, lifecycle/restart policy, bounded kill timeout, and logs. PM2 config never contains raw credentials or secret-derived identifiers.
@observation Observe without a resident wrapper by composing PM2 exact-name state/PID/restarts/logs, stdout/stderr cursor advancement, declared readiness/liveness probes, OS process/tree facts, recipe deadlines, and optional cooperative heartbeat/domain progress. A short-lived agent/control evaluator computes universal state whenever it polls or waits.
@stall PM2 `online` is only an existence fact. External evaluation may classify ready, quiet-allowed, degraded, or stalled from current facts and monotonic time. A target that supports cooperative heartbeat improves evidence but is not required when probes/output/domain facts suffice.
@continuous Continuous unattended remediation is not purchased with one wrapper per target. If later required, add one shared receiver observer per PM2 domain or use backend-native monitoring; keep observation cost sublinear in the number of targets.
@bootstrap Bun/JS/TS targets needing credentials import the broker bootstrap before application initialization. The bootstrap spawns a short-lived `broker.js` helper over inherited IPC, proves repository/recipe/grant/attempt identity, receives only admitted credential slots, installs them in the current PM2-managed process, disconnects, and lets the helper exit.
@same_process For a Bun application the bootstrap and application execute in the same PM2-managed runtime. No extra persistent Bun process remains after acquisition. Renewal may invoke another bounded helper exchange; it never requires a resident local server.
@other_runtimes Add equivalent cooperative language/runtime adapters or receiver-native facilities only when required. A runtime that cannot cooperate receives a typed unsupported-delivery outcome; do not silently choose a resident wrapper or leak plaintext through PM2 metadata.
@nonsecret Nonsecret recipes require no bootstrap and PM2 starts the exact declared target. Observability and cancellation remain identical whether or not credentials are required.
@restart PM2 restarts the target directly. Credentialed cooperative targets repeat bootstrap and grant validation on every restart; expired, revoked, drifted, or denied authority fails initialization through a configured non-restarting exit classification.
@cancel Cancellation addresses the exact PM2 name and attempt, performs graceful stop then bounded tree escalation, verifies descendant absence, records terminal facts, and revokes/releases applicable leases. Windows proof must establish PM2 tree cleanup or add a receiver-level Job Object mechanism that does not require a resident Bun process.
@overhead Measure baseline PM2 direct target overhead, short-lived bootstrap peak/duration, status-poll cost, log/heartbeat retention, and parallel-attempt behavior. Fail architecture review if credential infrastructure leaves a persistent per-target helper after bootstrap or materially multiplies idle process memory.
@supersedes This contract supersedes the resident topology in `broker-pm2-execution-capsule.md`, retained only to explain why it was rejected.
@proof Prove nonsecret direct execution, cooperative credential bootstrap, helper exit, no PM2-visible secret, source/package churn, restart revalidation, unsupported-runtime failure, objective stall detection, exact cancellation/tree cleanup, cross-invocation status, parallel runs, and bounded process/memory overhead.
