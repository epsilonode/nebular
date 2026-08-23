---
id: broker-python-uv-windows-job-receiver
kind: proposal
status: proposed
created: 2026-08-23
updated: 2026-08-23
roadmap: broker
refs:
  - roadmaps/broker.md#evaluate-pythonuv-windows-job-object-receiver
  - memories/teleport/broker/broker-universal-process-receiver.md
  - memories/teleport/broker/broker-process-receiver-algebra.md
  - memories/teleport/broker/broker-universal-process-contract.md
  - memories/teleport/broker/broker-agent-objective-observability.md
  - memories/teleport/broker/broker-receiver-secret-delivery.md
  - memories/teleport/broker/broker-direct-receiver-materialization.md
hook: "read before proposing Python or uv as a process receiver, replacing PM2 on Windows, reusing the tides Job Object pattern, adding pywin32 or psutil, or designing receiver persistence and observability"
---

# Deferred Python/uv Windows Job Object Receiver

@status This is a potential future development target, not part of the active V1 sequence. PM2 remains the required Windows V1 receiver. The `pk`-derived recipe format, Git-scoped recipe authority, lifecycle vocabulary, observation contract, and backend-neutral `ProcessReceiver` algebra remain canonical regardless of whether this receiver is later implemented.

## Architectural decision

@candidate Implement `PythonWindowsJobReceiver` as one shared receiver process per Windows user/domain, launched from a uv-locked Python environment. It replaces PM2 for attempts assigned to it; it never runs beside PM2 merely to observe PM2 and never inserts a resident Python process between the receiver and each target.
@topology The candidate topology is `agent -> short-lived recipe-runner/client -> user-scoped Python receiver -> named Windows Job Object -> requested target and descendants`. The target is created directly by the receiver and is the root member of its Job Object.
@overhead The acceptable cost is one receiver runtime per user/domain plus the requested targets. A topology with one Python supervisor per attempt or target is the rejected execution-capsule pattern under a different runtime.
@uv uv is the environment, lock, installation, and invocation mechanism; it is not the receiver or lifecycle authority. The receiver must report its Python version, lock/build identity, protocol version, schema versions, process identity, and capability set.
@portability This card specifies the Windows receiver only. The universal algebra may later admit systemd, launchd, container, scheduler, or other implementations, but Windows Job Object behavior must not leak into recipes or agent-facing semantics.

## Proven low-level baseline from tides

@evidence `R:/Code/tides/tidal_prediction/windows_job_object.py` proves direct Win32 creation of a suspended child, assignment to a Job Object before resume, aggregate/per-process commit limits, whole-job cleanup, synchronous exit collection, and best-effort peak-memory telemetry.
@evidence `R:/Code/tides/tests/test_windows_job_object.py` proves the current bounded synchronous API on Windows but does not prove durable receiver behavior, detached lifetime, reconnection, output capture, cancellation races, descendant cleanup, or crash recovery.
@evidence Detailed source rationale lives in `R:/Code/tides/project-ledger/memories/2026-06-03-windows-job-object-implementation-research.mdx`, `2026-06-03-pythonic-windows-job-object-supervisor.mdx`, and `2026-06-03-job-object-api-ergonomics.mdx`. These are evidence and design provenance, not runtime dependencies.
@warning The existing `tides` function is a synchronous supervisor, not a reusable receiver. It creates an unnamed Job Object with `KILL_ON_JOB_CLOSE`, waits while retaining the handle, and therefore requires the calling Python process to remain resident for the target lifetime. Reusing it unchanged would create one wrapper process per target and is forbidden.
@hardening Before extraction, explicitly terminate a suspended child when Job assignment fails, close the primary thread handle immediately after successful resume, replace heuristic memory-limit attribution with authoritative lifecycle evidence where possible, and add descendant/cancellation tests.

## Suggested dependency boundary

@pywin32 Prefer a pinned `pywin32` build for Windows Job Objects, suspended process launch, process/thread handles, inherited stdio, named pipes, overlapped I/O, security descriptors, ACLs, and current-user authorization. Keep it behind one `Win32ProcessPort`; no domain or recipe module imports Win32 bindings.
@psutil Use a pinned `psutil` version as a convenience `ProcessFactsPort` for PID plus creation-time validation, CPU, memory, I/O, handles, threads, status, waiting, and ordinary process facts. Job Object membership and accounting remain authoritative because recursive PID discovery is race-prone.
@sqlite Use Python's standard-library `sqlite3` for the local attempt/event journal rather than inventing a collection of mutable JSON state files. Use explicit transactions, schema versioning, migrations, monotonic event sequence numbers, local-disk storage, integrity checks, and bounded retention.
@output Store stdout and stderr in bounded append-only per-attempt files rather than large database values. SQLite stores path, generation, current length, retained range, truncation events, and cursor metadata. Redaction and secret-exposure policy apply before durable output is admitted.
@stdlib Prefer standard-library `asyncio`, `dataclasses`, `enum`, `json`, `pathlib`, `hashlib`, `secrets`, and `logging` for the remaining infrastructure until a measured gap justifies another dependency.
@avoid Do not adopt Circus, Supervisor, or another general supervisor as the receiver core merely to avoid implementing the domain contract. Supervisor does not support Windows; Circus supplies useful watcher/event/restart ideas but still lacks authoritative Job Object containment, repository/recipe/attempt authority, the required secure protocol, cursor/redaction semantics, and typed stall policy.

## Required receiver seams

@win32_port `Win32ProcessPort` owns create/open/query/assign/resume/terminate/close operations, named Job Object naming, suspended launch, inherited-handle wiring, environment block construction, Job accounting, process creation-time identity, and user-scoped named-pipe ACLs.
@domain `ReceiverCore` is pure typed logic owning recipe-to-attempt planning, lifecycle classes, state transitions, deadlines, probe evaluation, restart/flapping decisions, cancellation escalation, observation synthesis, reconciliation decisions, and redacted outcomes. It depends only on ports.
@journal `AttemptJournal` transactionally persists nonsecret receiver identity, repository id, recipe id and revision, attempt id, Job name, root PID plus creation time, argv/cwd identity, lifecycle policy, timestamps, state transitions, restart lineage, output cursors, probe facts, terminal facts, schema version, and recovery disposition.
@control `ReceiverControlPort` exposes a versioned, length-delimited, machine-readable local protocol over a current-user-ACL Windows named pipe. Do not use Hono, localhost HTTP, unauthenticated TCP, ambient global pipe names, or plaintext secrets in requests, responses, diagnostics, or persisted state.
@cli A short-lived uv-managed client provides `materialize`, `inspect`, `list`, `read-output`, `await`, `cancel`, `restart`, `remove`, `reconcile`, `capabilities`, and `doctor`. It connects, emits a typed result or event stream, and exits; it is not a second observer daemon.
@receiver_identity Use opaque branded `ReceiverId`, `AttemptId`, `RepositoryId`, `RecipeId`, and `OutputCursor` values. Never address a process by PID alone. Validate PID plus process creation time and expected Job membership before observation or control.

## Objective observability contract

@snapshot Each observation snapshot combines receiver state, Job/root-process identity, start and observation times, exit facts, restart lineage, active process count, active PID facts, current/peak committed memory, CPU and I/O totals plus deltas, stdout/stderr cursor movement, structured progress, readiness/liveness results, deadline facts, and the next valid agent actions.
@events Record structured events separately from human output: attempt created, target assigned, target resumed, output advanced, progress reported, readiness changed, probe result, deadline crossed, stall classified, restart scheduled, cancellation requested, escalation performed, target exited, receiver reconciled, and attempt finalized.
@cursors Output reads accept a receiver-issued cursor and return a bounded chunk, next cursor, retained range, truncation status, EOF/continuation facts, and redacted diagnostics. Cursors must survive client invocations and receiver restart.
@probes Recipes declare startup, readiness, liveness, output-silence, progress, total-runtime, cancellation, and cleanup bounds appropriate to their lifecycle class. Probe commands and endpoints remain typed recipe data and cannot expand recipe authority.
@stall `running` means the OS reports a live process; it does not mean healthy. A pure monotonic evaluator classifies starting, ready, quiet-allowed, degraded, stalled, exited, failed, cancelled, orphaned, or unknown from current facts and policy. Classification is reproducible from journaled evidence.
@continuous Continuous deadline enforcement, autonomous restart, and crash detection require the one shared receiver to remain alive. A future daemonless named-Job variant may support launch, on-demand inspect, and cancellation, but it cannot claim equivalent unattended lifecycle semantics.

## Secret delivery and authority

@recipe The checked-in Git-scoped recipe remains the authorized command description. The Python receiver receives a fully validated execution plan and opaque grant/bootstrap references; it must independently validate protocol identity and must never infer broader command or credential authority.
@delivery Secrets are admitted only for declared slots and only at the final target-creation boundary. Raw values never enter argv, Job names, pipe names, journal fields, output metadata, exception text, crash reports, or diagnostic serialization.
@broker The Bun broker and `Bun.secrets` remain authoritative for credential retrieval and consent. A bounded private handoff may supply admitted values to the Python receiver for immediate environment-block construction; the receiver must acknowledge materialization without echoing values and release temporary buffers promptly.
@restart Every restart is a new materialization attempt or explicit lineage event and repeats grant, expiry, recipe, repository, and delivery validation. The receiver never persists a reusable plaintext environment for restart convenience.
@same_user The Windows V1 threat model remains same-user accidental-exposure reduction, not containment against arbitrary malicious code already executing as the same user. Named-pipe ACLs, repository binding, recipe identity, and redaction are still required defense in depth.

## Recovery and reliability

@startup On receiver start, transactionally scan nonterminal attempts, reopen named Job Objects, validate root PID creation time and Job membership, reconcile live OS facts, restore output generations/cursors, and classify each attempt as adopted, exited, orphaned, conflicted, or unrecoverable according to explicit policy.
@atomicity Attempt creation must not publish a runnable target without a recoverable journal identity. Define and test the ordering among journal reservation, Job creation, suspended process creation, assignment, stdio attachment, environment materialization, resume, and committed running state.
@crash Define outcomes for receiver failure at every launch boundary. Receiver death must neither silently release an unbounded target nor indiscriminately kill healthy long-lived targets. Recovery must not attach to an unrelated reused PID or Job name.
@cancel Cancellation performs cooperative shutdown where declared and supported, waits a bounded grace period, escalates with `TerminateJobObject`, waits for empty Job membership, records surviving-process evidence if any, releases secret leases, and finalizes output before committing terminal state.
@storage Bound journal history, event count, log bytes, crash artifacts, and retained terminal attempts. Cleanup is typed, auditable, repository-aware, and never deletes an active or unreconciled attempt merely because it is old.

## Receiver algebra and conformance

@algebra Implement the existing `ProcessReceiver` operations and typed failures without altering recipe syntax for this backend. Capability negotiation explicitly reports Windows Job support, durable reattachment, structured events, output cursors, probes, restart, graceful stop, hard tree termination, resource accounting, and secret-delivery modes.
@fixtures Run the same backend-neutral recipe fixtures against PM2 and Python: one-shot success/failure/timeout, long-lived readiness, permitted quiet service, stalled service, output cursor continuation/truncation, cooperative progress, restart/flapping bounds, cancellation escalation, orphan/stale identity, grant expiry, secret-free diagnostics, and parallel attempts.
@windows Add receiver-specific integration tests for suspended-launch race safety, assignment failure, descendant containment, breakaway attempts, named-Job reopen, receiver crash at every launch boundary, PID reuse, output pipe backpressure, target handle inheritance, cancellation proof, concurrent Jobs, receiver upgrade, reboot recovery policy, ACL rejection, and absence of secret material in process metadata and storage.
@benchmark Compare PM2 and Python receiver startup latency, idle receiver memory, per-attempt incremental memory/handles, status and output-read latency, parallel-attempt behavior, sustained log throughput, cancellation latency, crash recovery, and cleanup. Never compare the shared receiver against the rejected per-target `tides` wrapper as though they were equivalent topologies.

## Promotion gate and sequence

@sequence First freeze backend-neutral receiver contracts and conformance fixtures in the active V1 work. Second extract and harden the `tides` Win32 boundary in an isolated experiment. Third implement receiver identity, SQLite journal, output files/cursors, and one-shot inspect/cancel. Fourth add the shared named-pipe receiver, observation snapshots, probes, stall evaluation, and secret-safe materialization. Fifth add recovery and restart policy. Sixth run conformance, security, lifecycle, and overhead comparisons against PM2.
@promote Promote this card from proposed/deferred only when Windows tests prove all mandatory receiver capabilities and the Python backend can replace PM2 without changing recipes, broker authority, agent-facing operations, or secret semantics.
@reject Reject or retain as research if it requires a resident process per target, needs PM2 alongside it, exposes plaintext through IPC or persistence, cannot recover identity safely, cannot prove whole-tree cancellation, weakens objective observability, or expands recipe authority.
@non_goal This target does not replace the Bun credential broker, rewrite recipes in Python, make CAR Python-owned, create a localhost service, introduce a general workflow engine, or broaden V1 platform claims.
