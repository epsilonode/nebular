---
id: broker-windows-process-tree-conformance
kind: proof
status: proposed
created: 2026-08-23
updated: 2026-08-23
roadmap: broker
refs:
  - roadmaps/broker.md#adopt-and-harden-pk-ipc-and-lifecycle-semantics
  - roadmaps/broker.md#implement-os-backed-vault-and-local-broker
  - roadmaps/broker.md#security-and-lifecycle-conformance
  - memories/teleport/broker/broker-universal-process-contract.md
  - memories/teleport/broker/broker-direct-receiver-materialization.md
  - memories/teleport/broker/broker-process-receiver-algebra.md
hook: "read before claiming PM2 cancellation on Windows, implementing stop/delete, relying on taskkill or tree-kill, testing interpreted descendants, adding Job Objects, or selecting an alternative receiver"
---

# Windows Process-Tree Conformance

@decision Exact bounded cleanup of the complete managed descendant tree is a mandatory receiver capability, not an implementation detail. Prove PM2's actual Windows behavior before expanding the adapter. A live descendant after terminal cancellation is a receiver failure.
@constraint Do not repair failed proof by inserting a resident Bun/Node/Python wrapper per target, a PM2 observer module, localhost service, or unbounded polling loop. The remedy must be receiver-level or a replacement receiver such as the deferred Python/uv Windows Job Object design.

## Fixture matrix

@targets Test native executable, Bun script, Node script where needed by PM2, Python through uv, PowerShell script, Mise task, shell-free interpreted entrypoint, child spawning grandchild, child exiting before grandchild, detached/background child, rapid spawn during cancellation, and a process that ignores cooperative shutdown where Windows permits.
@lifecycles Cover one-shot success/failure/timeout, bounded foreground cancellation, long-lived readiness then stop, service restart, cancellation during startup/probe/bootstrap, restart-loop limit, PM2 daemon/client disconnect, and broker/runner termination.
@identity Capture receiver name/id, root PID plus creation time, descendant PIDs plus creation times, attempt id, restart lineage, start/stop timestamps, and cleanup method. Never accept PID absence alone without guarding against reuse and escaped descendants.

## Required sequence

@grace Request the declared cooperative shutdown mechanism first where supported, record delivery and acknowledgement facts, and wait only the recipe's bounded grace period.
@force Escalate through the PM2 receiver's exact stop/delete/kill path, then independently enumerate and verify the descendant set after a bounded cleanup deadline. Cleanup verification is separate from PM2's returned success status.
@terminal Commit stopped/cancelled/timed-out terminal state only after receiver identity is absent or stopped as required and no attributed descendant remains. Otherwise return cleanup-failed/recovery-required with exact redacted remediation.
@leases Do not release a secret lease merely because the root process disappeared. Release/finalize only after cleanup proof or record an explicit compromised/orphaned recovery state requiring further action.

## Evidence and classification

@facts Record which PM2/Node versions, invocation path, Windows build, process shapes, signals/messages, timeouts, tree enumeration method, exit codes, and cleanup outcomes were tested. Treat PM2 documentation or a successful simple child test as insufficient for arbitrary interpreted trees.
@pass The backend passes only when every mandatory fixture ends within its deadline with no surviving attributed descendant, no unrelated process killed, exact idempotent retry behavior, and stable status after a fresh client invocation.
@fail Any escape, unrelated kill, indefinite control call, false terminal success, PID-reuse ambiguity, or dependence on a resident per-target helper blocks PM2 release qualification for that lifecycle/entrypoint class.
@capabilities Capability negotiation may narrow PM2 support if a specific process shape cannot be safely contained, but public recipes cannot silently run with weaker cleanup. Unsupported combinations fail before secret acquisition/materialization.

## Alternative path

@job If receiver-level Job Object containment can be integrated without a persistent per-target runtime and without racing PM2 restarts, document and prove it as a PM2 receiver enhancement. Do not assume a post-launch PID assignment is race-free.
@python If PM2 cannot satisfy the universal contract, use the same fixture matrix to evaluate `PythonWindowsJobReceiver`. The alternative replaces PM2; it does not run beside PM2 as another persistent observer.
@proof Preserve executable fixtures and machine-readable results as the reusable backend conformance suite required by every future receiver.
