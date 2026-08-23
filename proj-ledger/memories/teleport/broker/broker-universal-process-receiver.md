---
id: broker-universal-process-receiver
kind: contract
status: proposed
created: 2026-08-23
updated: 2026-08-23
roadmap: broker
refs:
  - roadmaps/broker.md#adopt-and-harden-pk-ipc-and-lifecycle-semantics
  - roadmaps/broker.md#add-child-process-and-jsts-clients
  - memories/teleport/broker/broker-universal-process-contract.md
  - memories/teleport/broker/broker-process-receiver-algebra.md
  - memories/teleport/broker/broker-direct-receiver-materialization.md
  - memories/teleport/broker/broker-agent-objective-observability.md
  - memories/teleport/broker/broker-receiver-secret-delivery.md
hook: "read before implementing or changing process execution, PM2/systemd receivers, lifecycle bounds, stall detection, cancellation, heartbeats, long-lived commands, or Windows process-tree cleanup"
---

# Universal Backend Receiver And Bounded Process Contract

@index This card is the architectural index. Read the linked focused contracts for universal bounds, receiver algebra, PM2 direct materialization, objective agent observations, and the cooperative secret-delivery seam before implementation.
@purpose Agents lack the human operating-system affordances used to recognize a hung terminal, stalled command, healthy long-lived service, orphan tree, or safe cancellation target. Every agent-launched process therefore runs through an observable backend receiver; raw unbounded spawn is not the default execution model.
@receiver Define `ProcessReceiver<Plan, Handle, Snapshot, Event, Failure>` with capabilities for preflight, materialize, start, inspect, poll output, probe, cancel, stop, delete, reconcile, and dispose. Domain plans and status remain backend-neutral; adapters translate PM2 first and later systemd, launchd, containers, schedulers, or other supervisors.
@windows PM2 is the mandatory Windows V1 receiver for executable recipes. It directly manages the requested command and supplies durable identity, daemon-owned lifecycle, process status, logs, restart counts, exact-name operations, and cross-invocation observation without a resident Bun wrapper per process.
@materialization The receiver adapter validates and materializes the typed recipe directly to PM2. Observation composes PM2 facts, log cursors, probes, process/tree facts, cooperative heartbeat/progress, and monotonic policy evaluation outside the managed target.
@target The requested command is the PM2-managed process. Cooperative credential bootstrap occurs inside that process using a short-lived broker exchange; noncooperative secret delivery requires a separately admitted receiver-native adapter and never silently falls back to a resident capsule.
@all_processes One-shot commands, ordinary foreground commands, long-running checks, dev servers, daemons, and services all use a receiver. `direct` may exist only inside isolated tests, receiver bootstrap, or emergency diagnostics explicitly unavailable as the normal agent API.
@bounds Every executable recipe declares or receives policy defaults for startup deadline, completion/lifetime class, output-retention bound, silence/stall window or explicit exemption, readiness expectation, liveness probes when applicable, cancellation grace, forced-cleanup deadline, and terminal retention. Missing policy produces a typed blocker rather than an unbounded run.
@one_shot A one-shot attempt must reach a terminal exit before its hard runtime deadline. Silence may be valid only when the recipe declares it or supplies another progress/probe signal. Timeout or stall transitions trigger the declared action sequence and exact cleanup.
@long_lived A long-lived/service attempt may have indefinite intended lifetime, but startup, readiness, heartbeat freshness, cancellation, failure recognition, and cleanup are bounded. Healthy waiting is a declared observable state; it is not inferred merely from PM2 reporting `online`.
@stall PM2 process status alone cannot distinguish useful work from a stalled event loop or silent deadlock. Stall evaluation composes output activity, heartbeat advancement, readiness/liveness probes, child/process facts, recipe-specific progress signals, and supplied monotonic time into an explicit healthy, quiet-allowed, degraded, stalled, or failed decision.
@identity Derive a deterministic sanitized PM2 process name from repository identity, recipe id, and execution lane; assign a unique attempt id separately. Reuse requires an exact match of repository, recipe revision, receiver, cwd, argv summary, nonsecret env summary, ports, probes, grant generation, and active attempt state. Mismatch blocks rather than restarting or adopting implicitly.
@operations Expose plan, start, status, heartbeat, logs, cancel, stop, delete, and doctor. All mutation targets an exact typed name/attempt and is idempotent where possible. Never offer broad process-name matching, stop-all, delete-all, or guessed PID cleanup through the agent API.
@events Emit typed lifecycle events for accepted plan, materialized receiver, starting, running, output activity, readiness, heartbeat, degraded, stalled, cancellation requested, graceful stop, forced tree cleanup, exited, failed, timed out, orphaned, reconciled, and recovery required. Derive audit and agent status from the same events.
@observation Provide a current snapshot plus cursor-based deltas: state/sequence/attempt, PID and child facts, uptime, restart count, ports, probes, last heartbeat, stdout/stderr offsets and bounded tails, truncation/gap facts, deadlines, blockers, cleanup state, and next actions. Agents should never need to infer state from a still-blocked shell call.
@cancellation Cancellation is an addressable domain operation, not terminal interruption folklore. It identifies repository, recipe, receiver name, and attempt; requests graceful stop; waits the recipe bound; escalates through Job Object/tree cleanup; verifies absence; and reports partial/recovery-required outcomes without broad kills.
@pm2_control Reuse `pk`'s bounded Bun-native PM2 adapter shape: probe daemon, connect, list/get exact name, start typed config, stop exact name, delete exact name, disconnect, and map PM2 snapshots. Guard every call with deadlines and preserve a forced client-process close fallback if Bun/Windows PM2 handles regress.
@pm2_config Use fork mode, one instance, watch disabled, explicit cwd, bounded `kill_timeout`, readiness handshake where needed, bounded restart delay/count, and stop exit codes for normal, expired, revoked, or policy-denied terminal states. Filter inherited environment and never put credentials, PINs, passphrases, or decrypted CAR material in PM2 env, args, names, metadata, or ecosystem files.
@restart A PM2 restart starts the target directly. Cooperative bootstrap repeats repository/recipe/grant validation before retrieving a credential. Valid unexpired authority may restart; expired, revoked, drifted, denied, or unsupported delivery exits through a configured non-restarting state. Restart storms become a typed failed state after the bounded retry policy.
@reconcile A new runner invocation reconstructs objective state from PM2 exact-name snapshots, cooperative heartbeat/status records when present, probes, log cursors, grant state, and OS process facts. Unknown PM2 records are reported as orphans and never silently adopted or written into authority state.
@alternative Systemd or another receiver must satisfy the same laws and agent-facing contract: exact identity, typed materialization, bounded operations, observable progress/output, cancellation, tree/cgroup cleanup, restart policy, reconciliation, and backend-neutral status. Backend-specific features may enrich facts but cannot weaken the universal bounds.
@proof Prove fast success, ordinary failure, output-heavy work, declared quiet work, silence stall, probe stall, startup timeout, runtime timeout, healthy long-lived service, cancellation at every phase, graceful and forced Windows tree cleanup, PM2 daemon unavailable, PM2 operation timeout, reuse match/mismatch, crash restart, restart exhaustion, grant expiry/revocation, bootstrap failure, orphan reconciliation, cursor gaps, bounded per-process overhead, and alternative-receiver contract fixtures.
