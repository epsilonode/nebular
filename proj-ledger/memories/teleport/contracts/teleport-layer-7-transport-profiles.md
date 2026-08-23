---
id: teleport-layer-7-transport-profiles
kind: contract
status: active
created: 2026-08-22
updated: 2026-08-23
roadmap: car-teleport
refs:
  - roadmaps/car-teleport.md#seven-layer-teleport-architecture
  - roadmaps/car-teleport.md#cloud-stream-and-file-transport-profiles
hook: "read before implementing file download, upload, streaming, S3/object-store layout, content-addressed cloud blocks, mutable heads, range reads, or transport checksums"
---

# Layer 7: Transport Profiles

@contract Transport moves the same canonical cartridge graph without interpreting capability semantics, executing codecs, selecting restore policy, or changing protection profiles.
@contract The portable-file profile emits one self-contained CAR v1 suitable for download, handoff, offline backup, and whole-artifact verification. Small artifacts use bounded whole-object reads and writes; streaming readers and writers may replace buffering without changing bytes or semantics.
@contract The cloud-block profile stores immutable manifest, envelope, capability, and asset blocks by transport-safe CID and publishes a root object or small mutable workspace head only after all referenced children are durable.
@contract Portable CAR and cloud-block storage are packing profiles, not two data models. A service may assemble a portable CAR from cloud blocks or ingest a CAR into blocks while preserving every canonical block byte and CID.
@contract Mutable heads use conditional writes and versioning; immutable blocks reject overwrite. Transport records an explicit whole-object checksum where exact packed CAR bytes matter and never treats an object-store ETag as a CID or universal digest.
@contract CAR v1 remains the portable baseline. Selective reads use a transport index or individually stored blocks; draft CAR v2 indexing is optional and cannot change the universal cartridge or codec contract.
@contract Client-side protection remains authoritative for secret capabilities. Private buckets, scoped short-lived upload/download grants, server-side encryption, tenant isolation, lifecycle policy, and audit are defense-in-depth transport controls.
@contract Cloud garbage collection begins from an authoritative retained-root catalog, preserves all reachable blocks, and sweeps unreferenced uploads only after a grace period. Cross-tenant deduplication is forbidden unless equality leakage and existence probing are explicitly contained.
@constraint S3 keys, tags, custom metadata, presigned URLs, logs, checksums, and cache identifiers contain no plaintext secrets, key material, user-sensitive capability metadata, or original native-store identifiers classified as protected.
@evidence 2026-08-22 the neutral transport exposes portable CAR, bounded chunked ingestion, immutable child/signature/root publication, explicit SHA-256 checksums, tenant-scoped S3 keys, conditional heads, multipart delegation, and retained-root reachability planning. wx-shells release assembly passes an executable route-provenance verifier and collision-safe asset staging.
@evidence 2026-08-23 `writeTeleportCartridge` streams CAR chunks into an async backpressure sink without an archive-sized output buffer and returns typed sink/budget failures. `createTeleportS3Source` maps validated CID/range reads into tenant paths; bounded collection rejects invalid ranges, length lies, and budget overruns. Immutable conditional puts preserve adapter-reported `created` versus idempotent `exists` outcomes. The neutral suite passes 27 tests and wx-shells rebuilds/verifies all four hosted route modules.
@proof_gap A selected real S3-compatible deployment should additionally inject conditional-head races, multipart interruption/resume, checksum faults, tenant authorization failures, lifecycle grace-period sweeping, and retained-root recovery. These are deployment conformance gates over the implemented transport port, not missing generic Layer 7 behavior.
