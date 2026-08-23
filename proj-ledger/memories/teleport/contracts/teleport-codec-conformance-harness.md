---
id: teleport-codec-conformance-harness
kind: contract
status: active
created: 2026-08-22
updated: 2026-08-22
roadmap: car-teleport
refs:
  - roadmaps/car-teleport.md#codec-conformance-and-adversarial-matrix
hook: "read before accepting a codec into the shared registry, changing canonical fixtures, or claiming cross-runtime Teleport compatibility"
---

# Codec Conformance Harness

@contract Every registry codec runs the same conformance suite in each supported runtime before it can be used by a production cartridge.
@proof The suite requires exact canonical bytes and CID, encode/decode round trip, strict schema rejection, input immutability, bounded depth/width/bytes, typed failures, complete migration paths, dependency correctness, restore-plan projection, and zero effects during decode/migration.
@proof Golden fixtures are checked into the owning codec package without credentials, private URLs, live provider payloads, or nondeterministic timestamps.
@proof Adversarial fixtures cover malformed/truncated DAG-CBOR, invalid UTF-8, duplicate or unsupported fields, invalid numeric values, excessive nesting and collections, CID mismatch, version confusion, migration gaps, dependency cycles, unknown optional retention, unknown required rejection, and marker-based secret leakage.
@proof Composition fixtures include multiple instances of the same capability id and prove instance identity, dependency resolution, pane placement, diagnostics, and restore receipts remain isolated.
@constraint A codec-specific unit suite supplements but never replaces shared conformance. A browser-only or Node-only structured codec is rejected unless the runtime difference is confined to an application effect adapter or opaque raw payload.
