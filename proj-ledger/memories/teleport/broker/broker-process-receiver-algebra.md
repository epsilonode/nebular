---
id: broker-process-receiver-algebra
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
hook: "read before defining ProcessReceiver types, adding a backend, coupling recipes to PM2, or changing process plan, handle, snapshot, event, or cleanup contracts"
---

# Process Receiver Algebra

@boundary A receiver translates a backend-neutral admitted process plan into supervised runtime effects. Recipe and broker domains depend on the receiver algebra, never PM2/systemd/launchd APIs or backend-shaped status records.
@types Brand `ReceiverId`, `ReceiverVersion`, `ReceiverPlanId`, `ReceiverHandle`, `ProcessAttemptId`, `OutputCursor`, `HeartbeatCursor`, `ProbeId`, and `CleanupId`. Handles are opaque and receiver-indexed so a PM2 handle cannot be passed to a systemd adapter.
@capabilities Split the port into capability-specific interfaces rather than one ambient service: `ReceiverPreflight`, `ReceiverMaterialize`, `ReceiverStart`, `ReceiverInspect`, `ReceiverOutput`, `ReceiverProbe`, `ReceiverCancel`, `ReceiverStop`, `ReceiverDelete`, `ReceiverReconcile`, and `ReceiverDispose`.
@shape Conceptually support `preflight(plan)`, `materialize(admitted)`, `start(materialized)`, `inspect(handle)`, `pollOutput(handle,cursor,budget)`, `probe(handle,spec)`, `cancel(handle,policy)`, `stop(handle,policy)`, `delete(handle)`, `reconcile(identity)`, and `dispose(session)`, each returning closed typed outcomes.
@plan `ProcessPlan` contains normalized recipe revision, lifecycle class, cwd, argv atoms, nonsecret environment description, credential-slot references without values, ports/resources, readiness/liveness/stall policies, deadlines, restart rules, output budgets, cleanup policy, and required receiver capabilities.
@admission Select a receiver only when its declared capabilities satisfy the plan. Missing tree cleanup, output cursors, long-lived reconciliation, restart control, or readiness support is an admission failure—not a runtime best effort.
@facts Receiver adapters return factual snapshots/events: backend state, PID/tree identity, timestamps, restart count, output offsets, logs, probes, backend diagnostics, and cleanup evidence. Pure broker reducers map facts into universal agent state and next actions.
@errors Define closed failure families for unavailable receiver, incompatible capability, invalid materialization, name collision, start timeout, inspect failure, stale handle, output gap, probe failure, cancellation failure, cleanup partial, daemon/backend disconnect, and reconciliation ambiguity.
@laws Starting an admitted plan yields one addressable handle or a typed failure; inspect never mutates; cancel/stop/delete are exact-target and idempotent where the backend permits; output cursors are monotonic; terminal states never transition back to active for the same attempt; cleanup cannot claim complete without verification.
@pm2 PM2 is the Windows V1 implementation, not the algebra. Its daemon, names, `pm2_env`, logs, restart counts, and API callbacks are confined to the adapter and mapped into universal facts.
@alternatives A systemd receiver maps attempts to units/scopes and cgroups; launchd maps to jobs; a container receiver maps to container/task identity. Each must pass the same conformance suite even when its native observation or cleanup mechanisms differ.
@composition Keep receiver resource lifetime in the privileged Effect environment: acquire/connect, perform bounded operations, disconnect/dispose in finalizers, and translate defects once at the broker boundary. Portable/client APIs expose only universal requests/outcomes.
@proof Build a receiver conformance kit with a deterministic fake plus PM2 integration proof. Require every alternative adapter to pass identity, lifecycle, cursor, cancellation, cleanup, restart, reconciliation, and hostile-fact mapping cases before it becomes selectable.
