---
id: broker-explicit-effect-environment
kind: contract
status: proposed
created: 2026-08-23
updated: 2026-08-23
roadmap: broker
refs:
  - roadmaps/broker.md#strengthen-typing-and-functional-boundaries
  - roadmaps/broker.md#implement-os-backed-vault-and-local-broker
hook: "read before adding ambient time, randomness, cryptography, keychain, consent, audit, filesystem, IPC, process, or provider effects"
---

# Explicit Effect Environment

@contract Pure domain and planning functions receive immutable values only. Effectful interpreters receive an explicit narrow environment containing exactly the capabilities they use.
@contract Define small ports for clock, entropy/id generation, cryptography, secret storage, consent, audit, authenticated IPC, canonical project resolution, child launch, provider operations, and recovery-journal persistence.
@contract Supply time through `Clock`, randomness through `Entropy`, and cryptographic operations through an auditable crypto port or explicitly selected WebCrypto adapter. Tests never depend on ambient wall time or nondeterministic ids.
@contract `Bun.secrets`, process launch, filesystem paths, console or GUI windows, and local IPC exist only in Bun broker leaf adapters. Portable capability code and the unprivileged client cannot import those adapters.
@contract Portable Teleport and broker-client code use plain immutable environment records and ordinary function parameters. The privileged broker may use typed Effect `Context` services and `Layer` composition internally for scoped server, lease, journal, and child-process resources.
@contract Effect services mirror domain-owned narrow ports; they do not become a service locator or permit arbitrary ambient access. Layer construction occurs only at the `broker.js` composition root, and Effect types do not cross public client, IPC, codec, or CAR boundaries.
@contract Each adapter translates foreign exceptions, cancellation, unavailable services, and platform limits into its closed issue family while keeping sensitive causes out of public diagnostics.
@contract Planning a credential request, consent display, grant, transfer, restore operation, or audit entry remains separate from interpreting the corresponding effects.
@proof Deterministic tests substitute clocks, entropy, stores, consent decisions, provider behavior, IPC peers, and failures; import-graph tests prove pure and portable modules cannot reach privileged adapters.
