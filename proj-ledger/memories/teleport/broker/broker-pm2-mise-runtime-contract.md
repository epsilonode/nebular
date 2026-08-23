---
id: broker-pm2-mise-runtime-contract
kind: contract
status: proposed
created: 2026-08-23
updated: 2026-08-23
roadmap: broker
refs:
  - roadmaps/broker.md#adopt-and-harden-pk-ipc-and-lifecycle-semantics
  - roadmaps/broker.md#implement-os-backed-vault-and-local-broker
  - memories/teleport/broker/broker-direct-receiver-materialization.md
  - memories/teleport/broker/broker-process-receiver-algebra.md
hook: "read before installing or invoking PM2, deciding whether PM2 runs under Node or Bun, changing Mise Node/Bun pins, using bunx or global PM2, or implementing the PM2 receiver adapter"
---

# PM2 Mise Runtime Contract

@decision PM2 is an exact local dependency and the Windows V1 receiver daemon is owned by the workspace's Mise-pinned Node runtime. Broker/client/runner implementation remains Bun-targeted. Node exists as receiver infrastructure, not an ambient developer PATH dependency or supported broker runtime.
@current The workspace currently pins Node `22.23.2` and Bun `1.3.14` in `mise.toml`. Treat those as the initial proof matrix, not permission to float either version. Bake's ranged PM2 dependency and `bunx pm2` recipe are evidence to audit, not the final reproducible installation contract.

## Installation and invocation

@dependency Add PM2 to the local locked dependency graph at one exact version selected by the compatibility spike. Do not install global PM2, use global npm/pnpm, depend on a pre-existing user installation, or accept a semver range for the security/lifecycle proof baseline.
@mise Every PM2 CLI, daemon, doctor, integration test, and upgrade command runs through a declared Mise task or `mise exec` with the exact Node/Bun tools. A clean shell without global Node/PM2 must pass.
@runtime Start and identify the PM2 daemon under the Mise-pinned Node executable. Do not assume `bunx pm2` proves the daemon runtime. Record daemon PID, Node executable/version, PM2 version, PM2 home/domain, protocol capabilities, and startup ownership in `doctor` output.
@home Use one explicit per-user PM2 domain/home for this receiver, resolved through a receiver configuration port. Do not silently adopt unrelated global PM2 state. Names and operations are scoped to the configured domain and exact broker-owned prefixes.

## Adapter selection proof

@spike Compare two bounded control paths: PM2's programmatic API imported from Bun and the local PM2 CLI launched with Mise-pinned Node. Select the smallest path that passes Windows connect/disconnect, daemon persistence, exact-name lifecycle, JSON status/log access, cancellation, errors, and no-hanging-handle proof.
@preference Prefer direct programmatic control from short-lived `broker.js` if Bun compatibility and clean disconnect are proven. Otherwise use bounded local CLI operations under Mise Node without adding a custom resident Node bridge or fifth shipped runtime artifact.
@timeout Every control call has start, response, and disconnect deadlines plus forced cleanup of the short-lived control process. A hung PM2 client cannot block an agent indefinitely.
@secrets PM2 config, environment, names, metadata, dumps, saved process lists, logs, and CLI arguments contain only nonsecret plan/reference data. Cooperative targets acquire credentials after start through the separate bootstrap contract.

## Upgrade and coexistence

@pin Upgrade Node, Bun, or PM2 one dimension at a time through the full receiver and secret-canary conformance matrix. Record the passing tuple; never run `latest` in supported workflows.
@coexist Detect another PM2 domain or incompatible daemon without killing, upgrading, adopting, or mutating it. Broker operations address only the configured domain and exact identities.
@startup V1 may ensure the PM2 daemon on demand through a bounded receiver operation. System-start persistence is optional and separately admitted; recipe execution must report whether daemon/process resurrection is configured rather than assuming it.

## Proof

@proof From a clean shell prove Mise owns Node/Bun, local install owns PM2, daemon runtime identity is exact, no global executable is used, connect/disconnect leaves no short-lived client, concurrent operations remain isolated, incompatible daemon state fails typed, restart/resurrection facts are accurate, and removing global Node/npm/PM2 does not affect supported tasks.
@gate Run this spike before expanding the PM2 adapter or declaring the four-artifact runtime proof complete. If PM2 requires an uncontrolled global runtime, persistent custom bridge, or per-target wrapper, reject that integration path.
