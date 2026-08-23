---
id: teleport-capability-contract
kind: contract
status: active
created: 2026-08-22
updated: 2026-08-22
roadmap: car-teleport
refs:
  - roadmaps/car-teleport.md#semantic-teleport-and-exact-replay-separation
  - roadmaps/car-teleport.md#define-the-capability-codec-kernel-and-registry
  - roadmaps/car-teleport.md#specify-canonical-capability-encoding
  - roadmaps/car-teleport.md#define-evolution-dependencies-and-opaque-retention
  - ../../../../../jtwc/proj-ledger/memories/tropical/contracts/hud-cartridge-rebase-contract-v2.md
hook: "read before defining a Teleport capability codec, serializing application state, or combining latest-rebase intent with exact replay"
---

# Teleport Capability Contract

@contract Each capability owns a stable id, current schema version, strict validator, canonical encoder, decoder, pure one-way migrations, and restore-plan projection.
@contract Decode and migration accept unknown bytes or values and return typed results; they never manufacture empty defaults, mutate application state, fetch data, or invoke rendering effects.
@contract Newly emitted capabilities always use the current canonical version. Legacy versions are decode-only and migrate at most once into the current in-memory representation.
@contract Semantic teleport carries durable user intent and authority hints needed to obtain fresh data. Exact replay carries captured provider/runtime/render observations for debugging and is separately identified, labeled stale-capable, and never used as current authority.
@contract JTWC owns `wx.hud.intent@2` and `wx.hud.exact-replay`; the existing `CartridgeDocument` v2 remains the semantic source contract until its fields move behind the shared capability codec.
@constraint DOM nodes, framework component instances, live stores, AbortSignals, functions, MapLibre objects, and derived read models are never serializable capability values.
