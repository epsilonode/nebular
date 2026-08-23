---
id: broker-codec-witness-algebra
kind: contract
status: proposed
created: 2026-08-23
updated: 2026-08-23
roadmap: broker
refs:
  - roadmaps/broker.md#expand-domain-algebras-and-lawful-composition
  - roadmaps/broker.md#integrate-optional-teleport-credential-requirements
hook: "read before adding codec witnesses, typed encoded blocks, schema-version ownership, migration witnesses, registry erasure, or credential capability codecs"
---

# Codec Witness Algebra

@contract A codec witness carries typed capability id, current semantic type, wire representation, current schema version, security class, budget, encoder, decoder, and version-support witness. Structured and raw codecs are distinct variants.
@contract `EncodedBy<Codec>` ties capability id, schema version, representation, bytes, CID, dependencies, and optional decoded current value back to the witness that produced them.
@contract Current-only and migrating codecs are separate variants. A migration witness names source/target schemas, pure decoder, lossy fields, warnings, and total chain to current; registration rejects gaps, overlaps, ambiguity, and cycles.
@contract Keep dependency projection, restore planning, and effect interpretation as separate algebras keyed by the codec/capability witness. A codec can verify, relay, and re-export without an installed restore adapter.
@contract Dynamic CAR inventory requires existential erasure. One registry module owns that cast, returns a closed supported/unsupported/invalid decoded entry, and never exports an unvalidated generic assertion.
@contract Credential requirement and secret-transfer codecs use this witness model without adding provider effects, keychain access, consent, or local grant authority to canonical encoding.
@proof Compile-negative fixtures reject wrong capability values, representation mismatch, historical emit, and unowned versions. Runtime conformance proves canonical bytes/CIDs, migration completeness, exact dispatch, bounded decode, and opaque retention.

