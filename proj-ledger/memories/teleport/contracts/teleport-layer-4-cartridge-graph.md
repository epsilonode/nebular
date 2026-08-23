---
id: teleport-layer-4-cartridge-graph
kind: contract
status: active
created: 2026-08-22
updated: 2026-08-22
roadmap: car-teleport
refs:
  - roadmaps/car-teleport.md#seven-layer-teleport-architecture
  - roadmaps/car-teleport.md#generic-capability-addressed-car-container
hook: "read before changing cartridge manifests, capability descriptors, CAR assembly, block verification, instance references, or opaque relay"
---

# Layer 4: Teleport Cartridge Graph

@contract A cartridge is a versioned content-addressed graph rooted at one canonical `wx-teleport-cartridge` manifest. It inventories capability instances and their blocks or protection envelopes without embedding application-specific payload fields.
@contract Each descriptor records capability id, instance id, schema version, codec, required flag, security classification, payload or envelope CID, dependencies, restore-mode hints, and bounded policy-safe metadata.
@contract Assembly accepts already canonical capability blocks from the codec layer and optional protected envelopes from the security layer. It verifies allowed codecs, SHA-256 CIDs, references, duplicate and missing blocks, unreferenced blocks, graph limits, and deterministic descriptor ordering.
@contract Assembly and verification reject invalid capability or instance identities, duplicate dependency declarations, missing or capability-mismatched required targets, and cycles across hard-decode or restore-order edges. Optional absent targets remain retainable without weakening required graph integrity.
@contract Creation verifies every supplied capability, key-envelope, and signature block against its declared codec, SHA-256 CID, and bytes before writing. Canonical code-unit ordering covers capability instances, dependency declarations, envelopes, signatures, and physical CAR block emission so semantically equivalent input order cannot change the root or archive bytes.
@contract Unknown optional capabilities retain exact descriptors, envelope metadata, blocks, CIDs, instance identities, and dependency declarations through inspection, unrelated workspace edits, relay, and re-export. Unknown required capabilities remain retained but prevent commit.
@contract A portable cartridge is emitted as a genuine CAR v1 with exactly one root. The inner cartridge graph is independent from whether a transport stores it as one CAR byte stream or as separate immutable blocks.
@contract Container versioning governs manifest structure only. Capability versions govern semantic values; protection-envelope versions govern cryptography; native adapter versions govern foreign store recovery; transport versions govern packing and retrieval.
@constraint The cartridge graph never imports Svelte, React, Fireproof, MapLibre, Nanostores, application stores, S3 clients, browser download APIs, or restore effect implementations.
@evidence 2026-08-22 real CAR v1 assembly and verification enforce one root, SHA-256 block integrity, codec agreement, missing/duplicate/unreferenced rejection, deterministic instance ordering, protected envelopes, optional signatures, unknown optional retention, unknown required blocking, and byte-exact re-export.
@evidence 2026-08-22 the same graph now supports linked split Fireproof native blocks, encrypted private inventory, Ed25519 self-contained signatures, streamed CAR emission, cloud block publication, and a locked whole-archive Edge/Node golden vector without changing manifest semantics.
