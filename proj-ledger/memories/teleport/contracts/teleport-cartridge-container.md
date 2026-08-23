---
id: teleport-cartridge-container
kind: contract
status: active
created: 2026-08-22
updated: 2026-08-22
roadmap: car-teleport
refs:
  - roadmaps/car-teleport.md#generic-capability-addressed-car-container
  - roadmaps/car-teleport.md#seven-layer-teleport-architecture
hook: "read before changing the outer Teleport CAR manifest, block graph, capability inventory, decode limits, or shared package boundary"
---

# Generic Teleport Cartridge Container

@contract A Teleport cartridge is a content-addressed graph with exactly one canonical DAG-CBOR `wx-teleport-cartridge` manifest root and capability, envelope, asset, or store blocks. Its portable-file profile is a genuine self-contained CAR v1; cloud and stream profiles preserve the same canonical blocks and root without defining another semantic format.
@contract The root contains container version, creation time, optional provenance, and capability entries with stable id, schema version, block CID, codec, required flag, restore mode, and instance identity. It does not embed application-specific payload fields.
@contract Capability ids and versions describe semantic contracts; filenames and TypeScript module paths are never protocol identities.
@contract Every block uses an allowlisted codec and SHA-256 CID. Readers verify hashes, references, duplicate CIDs, missing blocks, unreferenced blocks, bounded DAG traversal, byte limits, and exact root shape before capability decode.
@contract Unknown optional capabilities remain opaque and retainable for relay or re-export. Unknown required capabilities block restore with a typed diagnostic.
@contract Integrity is content-addressed but does not establish authorship. Any future signature is a separate optional capability over the canonical manifest CID.
@constraint Shared transport code is runtime-neutral and cannot import Svelte, React, MapLibre, Nanostores, Fireproof runtime internals, or application stores.
