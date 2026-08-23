---
id: teleport-layer-1-capability-contracts
kind: contract
status: active
created: 2026-08-22
updated: 2026-08-22
roadmap: car-teleport
refs:
  - roadmaps/car-teleport.md#seven-layer-teleport-architecture
  - roadmaps/car-teleport.md#define-the-capability-codec-kernel-and-registry
hook: "read before defining a new Teleport capability identity, schema, instance model, dependency, security class, or ownership boundary"
---

# Layer 1: Capability Contracts

@contract A capability is the smallest independently versioned, secured, retained, migrated, and restored unit of Teleport state. It represents durable semantic state or an explicitly labeled exact-replay/native-recovery payload, never a framework object or transport package.
@contract Every capability owns a stable lowercase protocol id, a current writable schema version, accepted historical read versions, a strict closed schema, canonical codec identity, security class, decode budgets, dependency declarations, restore modes, and one source-project owner.
@contract Capability instance identity is independent from capability id and block CID. A cartridge may contain multiple instances of the same capability id, and workspace references resolve the intended instance without state crossover.
@contract Security classes distinguish public, private, secret-bearing, and opaque-native content. Requirement distinguishes required from optional restoration; neither property is inferred from application availability or encryption presence.
@contract Dependencies identify hard-decode, restore-order, optional-enhancement, and application-availability edges. Capability schemas reference other instances by stable identity rather than embedding or importing another application's state model.
@contract Semantic capabilities carry durable intent and authority hints. Exact replay, captured runtime state, provider observations, native database checkpoints, and debugging evidence use distinct capability ids and disclose their stale or format-bound nature.
@contract Capability removal, replacement, merge, or lossy migration is an explicit application operation with typed diagnostics. Missing codecs never imply deletion or empty-default substitution.
@constraint DOM nodes, Svelte or React components, stores, functions, live connections, AbortSignals, MapLibre objects, credentials outside declared secret fields, and derived read models are not capability values.
@evidence 2026-08-22 `R:/Code/web/wx-teleport-cartridge/src/types.ts` now defines stable capability/instance identity, four dependency kinds, security classes, restore modes, protection descriptors, signatures, limits, and application-neutral restore steps; duplicate instance identity is rejected by CAR assembly and verification.
@evidence 2026-08-22 the contract is exercised by multiple same-id HUD instances, linked Fireproof descriptor/chunk/keybag instances, raw asset plus metadata pairs, optional opaque retention, and required dependency rejection across JTWC, wx-ui-melt, and Supa suites.
