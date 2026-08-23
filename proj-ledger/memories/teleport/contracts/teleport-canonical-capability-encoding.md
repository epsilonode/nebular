---
id: teleport-canonical-capability-encoding
kind: contract
status: active
created: 2026-08-22
updated: 2026-08-22
roadmap: car-teleport
refs:
  - roadmaps/car-teleport.md#specify-canonical-capability-encoding
hook: "read before choosing a capability codec, changing normalization, computing capability CIDs, or updating cross-runtime golden fixtures"
---

# Canonical Capability Encoding

@contract Structured capabilities use canonical DAG-CBOR. Raw blocks are limited to opaque assets, encrypted envelopes, or foreign store chunks that require byte preservation.
@contract Encoding is a pipeline of protocol projection, strict validation, normalization, canonical serialization, SHA-256 CID creation, and immediate decode-round-trip verification.
@contract Equivalent semantic values produce identical bytes and CIDs regardless of property insertion order, runtime, browser, or source application.
@contract Protocol schemas define optional omission versus explicit null, default elision, sorted-map behavior, ordered-array semantics, integer and bounded-float representation, timestamp normalization, Unicode policy, identifier grammar, and CID link representation.
@contract Non-finite numbers, `undefined`, functions, symbols, class instances, proxies, framework objects, mutable aliases, and unbounded recursive structures are rejected before serialization.
@contract Golden fixtures include canonical value, exact bytes, CID, schema version, and producing codec version and pass unchanged in Bun/Node and supported browsers.
@constraint Creation timestamps and provenance are outer-manifest concerns unless time is itself semantic capability state; nondeterministic metadata cannot contaminate a capability CID.
