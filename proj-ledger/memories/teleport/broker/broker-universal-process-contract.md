---
id: broker-universal-process-contract
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
hook: "read before admitting any executable recipe, defining lifecycle defaults, allowing long-lived work, or changing timeout, stall, cancellation, and cleanup requirements"
---

# Universal Process Contract

@principle Every agent-launched process is a bounded, observable, addressable attempt interpreted by a backend receiver. A raw spawn whose only observable is a blocked shell call is invalid production behavior.
@attempt Construct a unique `ProcessAttemptId` for every run and bind it to repository identity, normalized recipe revision, receiver id/version, lifecycle class, resolved cwd, argv summary, nonsecret environment summary, credential lease references, policy version, and creation time.
@classes Model `one-shot`, `foreground`, `long-lived`, `service`, and `observe-only` explicitly. `observe-only` launches nothing. Every executable class has defined start, active, cancellation, cleanup, and terminal semantics; no boolean `detached` flag substitutes for lifecycle state.
@required_policy Before materialization require a startup deadline, readiness policy or explicit none, liveness/progress policy, silence/stall window or explicit quiet exemption, hard runtime deadline or intentionally-unbounded-lifetime declaration, output-retention budget, cancellation grace, forced-cleanup deadline, restart policy, and terminal-record retention.
@bounded Indefinite intended lifetime is permitted only for `long-lived` and `service`; it does not remove bounds from startup, readiness, heartbeat freshness, liveness failure, cancellation, restart frequency, output retention, or cleanup.
@one_shot A one-shot attempt must reach terminal success/failure within a hard deadline. If the process may legitimately be quiet, the recipe supplies another progress signal or an explicit bounded quiet policy. Timeout and stall are distinct terminal causes.
@foreground A foreground attempt remains agent-attached for presentation but is still receiver-owned. User or agent disconnect does not erase its identity; policy determines cancel-on-disconnect, continue-and-observe, or recovery-required behavior.
@long_lived A long-lived/service attempt must become ready within its startup bound and remain objectively observable through heartbeat, probes, output progress, or declared receiver facts. `online` alone is not health.
@state Use closed states: planned, admitted, materializing, starting, running, ready, quiet-allowed, degraded, stalled, cancellation-requested, stopping, stopped, succeeded, failed, timed-out, orphaned, and recovery-required. Transitions are reducer decisions over supplied facts and clock values.
@effects Pure policy returns commands for receiver materialization, probe scheduling, output polling, graceful cancellation, forced cleanup, verification, journal writes, and audit emission. Adapters execute commands and return facts; they do not choose lifecycle policy.
@cancel Cancellation targets exactly one repository/recipe/receiver/attempt identity, is idempotent, records its initiator/reason, requests graceful stop, waits the declared grace, escalates to exact tree cleanup, verifies absence, and returns complete/partial/recovery-required cleanup.
@cleanup Terminal status is not complete until receiver resources, process descendants, temporary files, open IPC handles, credential leases, timers, probes, and journals are finalized or represented by an explicit recovery obligation.
@defaults Defaults may be ergonomic but never unlimited. Keep versioned defaults by lifecycle class, record the effective values in the attempt plan, and allow recipe overrides only inside policy-set minima/maxima.
@proof Use deterministic clocks and receiver fakes to prove every state transition, deadline precedence, quiet exemption, stall recognition, cancellation race, restart limit, cleanup escalation, idempotent terminal replay, and absence of any executable route that bypasses a receiver.
