---
id: broker-host-owned-pm2-prerequisite
kind: decision
status: proposed
created: 2026-08-23
updated: 2026-08-23
roadmap: broker
refs:
  - roadmaps/broker.md#adopt-and-harden-pk-ipc-and-lifecycle-semantics
  - roadmaps/broker.md#implement-os-backed-vault-and-local-broker
  - roadmaps/broker.md#security-and-lifecycle-conformance
hook: "read before adding PM2 dependencies, starting or stopping the PM2 daemon, changing PM2_HOME, implementing receiver preflight, or defining host prerequisites"
supersedes: broker-pm2-mise-runtime-contract
---

# Host-Owned PM2 Prerequisite

@decision Windows V1 assumes a compatible PM2 daemon is already running on the host. PM2 is external receiver infrastructure, not a process Nebular installs or owns.
@dependency Do not add PM2, its programmatic client, or Node solely for PM2 to Nebular's package graph. Do not invoke npm, pnpm, bunx, or an installer to acquire PM2.
@daemon Nebular never starts, daemonizes, stops, restarts, kills, upgrades, saves, resurrects, configures startup for, or repairs PM2. It does not claim ownership of `PM2_HOME`, sockets/pipes, daemon PID, or global process inventory.
@allowed The receiver may probe reachability/capabilities and perform bounded exact-name list/describe/start/stop/delete/log operations for Nebular-owned application entries under its reserved prefix.
@preflight Before materialization, return typed `pm2-unavailable`, `pm2-unreachable`, `pm2-incompatible`, or namespace-conflict failures with safe observations and host-owned remediation guidance.
@version V1 records the observed PM2/runtime/protocol facts for diagnostics and conformance but does not pin or mutate the host installation. Compatibility is capability-tested at the adapter boundary.
@control Access PM2 through the narrowest available host control surface selected by proof. Configuration supplies or discovers that surface without turning an ambient global CLI into a package dependency.
@isolation Never adopt, mutate, stop, delete, or inspect secret details of unrelated PM2 entries. Every mutation revalidates the exact reserved name, repository/recipe metadata, and attempt id.
@startup No `pm2-daemon-ensure`, auto-start fallback, hidden daemonization, or direct-spawn remediation exists in the public execution path.
@testing Pure/fake receiver tests run without PM2. Live conformance is an explicit host-prerequisite suite that skips or fails with a typed prerequisite outcome when the daemon is unavailable.
@security Host ownership does not relax secret rules: PM2 args, env, names, metadata, saved state, and logs remain nonsecret, and cooperative bootstrap obtains credentials only after managed start.
@future A later self-contained distribution may revisit dependency and daemon ownership only through a new accepted decision with measured value, lifecycle isolation, upgrade policy, and cleanup proof.
