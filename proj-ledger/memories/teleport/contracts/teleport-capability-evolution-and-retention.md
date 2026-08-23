---
id: teleport-capability-evolution-and-retention
kind: contract
status: active
created: 2026-08-22
updated: 2026-08-22
roadmap: car-teleport
refs:
  - roadmaps/car-teleport.md#define-evolution-dependencies-and-opaque-retention
hook: "read before changing capability versions, migrations, dependency graphs, unknown-capability handling, or re-export behavior"
---

# Capability Evolution And Opaque Retention

@contract Every historical schema has an explicit pure migration path or is unsupported. Decoders never infer compatibility from structural similarity and never partially hydrate an unsupported version.
@contract Migration chains terminate in the current canonical in-memory type; historical values are decode-only and cannot be emitted by new exports.
@contract Each migration declares lossy changes and returns typed diagnostics. Authority, identity, security classification, or required dependencies cannot be fabricated to hide missing legacy information.
@contract Unknown optional capabilities retain exact descriptor fields, block bytes, CID, dependency declarations, encryption references, and instance identity through unrelated workspace operations and re-export.
@contract Unknown required capabilities prevent commit but remain inspectable as bounded metadata and are not deleted.
@contract Dependencies are typed as hard-decode, restore-order, optional-enhancement, or application-availability edges. Hard and restore-order cycles are invalid unless represented by one aggregate capability with an internal schema.
@constraint Capability removal, replacement, or lossy migration is an explicit application operation with diagnostics; codec absence never implies deletion.
