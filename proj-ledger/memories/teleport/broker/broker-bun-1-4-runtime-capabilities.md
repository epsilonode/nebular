---
id: broker-bun-1-4-runtime-capabilities
kind: decision
status: accepted
created: 2026-08-23
updated: 2026-08-23
roadmap: broker
refs:
  - roadmaps/broker.md#implement-os-backed-vault-and-local-broker
  - roadmaps/broker.md#verification-and-rollout
hook: "read before changing the pinned Bun version or introducing Bun-native runtime capabilities into broker code"
---

# Bun 1.4 Runtime Capabilities

@decision Pin Bun 1.4.0 in `mise.toml`. It is the latest stable release verified on 2026-08-23 and the first Bun release written in Rust; Bun 1.3.14 was the final Zig release.
@decision Do not pin a canary for the broker or release path. Canary builds track every main-branch commit, are explicitly untested by Bun, and are suitable only for isolated compatibility investigations.
@verification Record `bun --version` and `bun --revision` in broker conformance evidence whenever the pin changes.
@capability Use `Bun.secrets` only through the broker-owned `SecretStore` adapter for OS-backed secrets, and use `bun:sqlite` only through the nonsecret journal port.
@capability Bun process, inherited IPC, filesystem, streams, and `Bun.Archive` may be used only by narrow Bun broker/receiver adapters when a broker requirement needs them.
@boundary Do not use `Bun.CryptoHasher`, `Bun.Archive`, Bun filesystem APIs, SQLite, process APIs, or `bun:test` in the portable Teleport export. It remains browser-compatible and retains WebCrypto, Web Streams, CAR, CID, DAG-CBOR, and multiformats as protocol dependencies.
@decision Keep Vitest for this workspace test suite. Its ordered multi-project isolation, JUnit/JSON reporting, and V8 coverage are established verification requirements; Bun Test compatibility alone is not sufficient justification to replace it.
