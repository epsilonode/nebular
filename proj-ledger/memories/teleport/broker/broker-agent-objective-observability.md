---
id: broker-agent-objective-observability
kind: contract
status: proposed
created: 2026-08-23
updated: 2026-08-23
roadmap: broker
refs:
  - roadmaps/broker.md#adopt-and-harden-pk-ipc-and-lifecycle-semantics
  - memories/teleport/broker/broker-universal-process-receiver.md
  - memories/teleport/broker/broker-universal-process-contract.md
  - memories/teleport/broker/broker-direct-receiver-materialization.md
hook: "read before implementing status, heartbeat, tick/tock output, stall detection, readiness/liveness, cancellation UX, or agent next-action reporting"
---

# Objective Agent Process Observability

@goal Replace human-only inference from terminals, Task Manager, elapsed patience, and shell interruption with typed objective facts an agent can poll, compare, and act on.
@questions Every status response answers: what attempt is this; what state is it in; is it healthy, progressing, intentionally quiet, degraded, stalled, or terminal; what changed since the cursor; which deadlines apply; can it be cancelled; did cleanup finish; and what exact next actions are valid.
@snapshot Provide attempt/repository/recipe/receiver identity, universal state and sequence, backend state, managed PID and tree facts, start/ready/heartbeat/output times, uptime, restarts, deadlines, ports, probes, credential-lease expiry metadata without secret value, output cursors, blockers, cleanup, and next actions.
@tick Use a `tick` lane for current state plus bounded deltas: monotonically increasing sequence, attempt id, state changes, process facts, probe changes, deadline facts, output counters, stale/degraded facts, and terminal/cleanup facts. Return a full snapshot when a requested delta is unavailable.
@tock Use independent stdout/stderr `tock` lanes with monotonically increasing byte offsets, bounded chunk size, creation time, attempt id, stream id, and truncation/gap indication. Cursor polling must never confuse output across attempts or restarts.
@retention Keep bounded in-memory/output-log tails and explicit retention budgets. Status metadata may persist in the user profile; raw output follows receiver log policy and is never copied into repository ledger, grants, audit events, IPC errors, or CAR metadata.
@progress Progress is a recipe-selected algebra over output advancement, heartbeat advancement, probe facts, child/process facts, domain progress events, and monotonic time. Output alone is not required; a quiet process can remain healthy through explicit heartbeat/probe policy.
@stall Distinguish `quiet-allowed`, `degraded`, and `stalled`. Stall is a pure decision from policy plus facts, never merely “no stdout recently.” Record the specific missing progress signal, elapsed window, last known advancement, applicable probe, and selected remediation.
@readiness Readiness means declared service usability, not process existence. Evaluate explicit HTTP/TCP/custom probes, log/protocol milestones, or domain events with bounded retries and stable-success counts. Failure returns facts rather than a generic timeout string.
@liveness Liveness runs after readiness and may degrade, restart, cancel, or fail according to recipe policy. A PM2-managed target with `online` status and failed liveness is not reported healthy.
@blocking The initiating agent call need not remain blocked to preserve ownership. Return an addressable attempt handle after materialization/start policy permits, then expose status/poll/wait/cancel operations. Waiting is a bounded operation with cursor progress, not an opaque terminal hold.
@actions Derive actionable typed next steps: continue polling at/after a cursor, inspect bounded logs, run a declared probe, cancel exact attempt, wait until a deadline, repair receiver availability, resolve a port conflict, approve credentials, or reconcile an orphan. Do not emit generic “request failed” when a closed cause exists.
@cancellation Report requested time, graceful deadline, escalation, target/tree facts, PM2 result, Job Object result, remaining descendants, lease release, and terminal cleanup state. An agent can distinguish accepted cancellation from verified completion.
@security Agent observability is intentionally rich. It may expose command output because the threat model assumes vetted recipes and a well-behaved agent, but broker-generated metadata and diagnostics never add secret values. Mark the residual risk that an authorized child can print its inherited credential.
@proof Test monotonic cursors, stale cursors, gaps, truncation, restart/attempt separation, declared quiet health, silent stall, output-without-progress, probe-only progress, readiness stability, liveness degradation, blocked-call release, cancellation progress, orphan snapshots, actionable failures, and bounded memory/log behavior.
