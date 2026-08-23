---
id: broker-codec-adt-and-registry-boundary
kind: contract
status: proposed
created: 2026-08-23
updated: 2026-08-23
roadmap: broker
refs:
  - roadmaps/broker.md#strengthen-typing-and-functional-boundaries
  - roadmaps/broker.md#integrate-optional-teleport-credential-requirements
  - roadmaps/broker.md#implement-encrypted-credential-car-export-and-import
hook: "read before refining codec types, protocol wire values, migration definitions, credential requirement codecs, secret-transfer codecs, or dynamic registry dispatch"
---

# Codec ADTs And Registry Type Erasure

@contract Replace an optional codec-mode flag and `unknown` encoder output with a discriminated union of structured and raw codecs. A structured codec encodes to a closed `ProtocolValue`; a raw codec encodes to `Uint8Array`.
@contract Represent current-only and migrating version support as distinct codec variants so declaring migrations necessarily supplies historical decoders and version ownership. Registry validation still proves complete nonambiguous chains.
@contract Credential-requirement and secret-transfer schemas use independent capability ids, schema versions, current semantic types, wire projections, strict decoders, limits, and conformance fixtures.
@contract Dynamic registry dispatch necessarily erases a codec's generic current type. Confine that erasure to one audited registry boundary and return a closed existential decoded-capability result rather than spreading casts and `unknown` across callers.
@contract Decode starts with `unknown`, validates exact object keys and discriminants, constructs domain types, applies pure migrations, and returns the current semantic value. Encode accepts only the current semantic type and produces its declared wire representation.
@contract Restore-plan projection is separable from canonical codec behavior. A codec remains usable for verification, relay, and re-export without importing an effect adapter.
@contract No codec or migration reads the keychain, clock, filesystem, environment, network, broker state, provider API, or consent UI. Any authority required after decode is represented as data for restore planning.
@proof Conformance covers canonical bytes and CIDs, strict unknown-field handling, raw/structured mode separation, migration completeness, generic erasure containment, round trip, bounded hostile input, and absence of privileged imports.

