---
id: teleport-layer-2-codec-kernel
kind: contract
status: active
created: 2026-08-22
updated: 2026-08-22
roadmap: car-teleport
refs:
  - roadmaps/car-teleport.md#seven-layer-teleport-architecture
  - roadmaps/car-teleport.md#define-the-capability-codec-kernel-and-registry
  - roadmaps/car-teleport.md#specify-canonical-capability-encoding
hook: "read before implementing codec interfaces, registry dispatch, canonical encoding, migrations, decode budgets, or conformance fixtures"
---

# Layer 2: Codec Kernel And Registry

@contract The shared kernel converts current semantic values to canonical capability bytes and bounded untrusted bytes to typed current values. It owns protocol projection, validation, normalization, canonical DAG-CBOR, raw opaque-block handling, CID calculation, exact-version dispatch, pure migration, and typed diagnostics.
@contract `TeleportCapabilityCodec<TCurrent>` declares capability id, current version, historical read set, schema and byte limits, dependency projection, security classification, canonical encode, strict decode, pure migrations, and restore-plan projection without importing application runtime modules.
@contract Rich runtime values such as Date, Map, Set, class instances, framework stores, cycles, and shared aliases are never coerced implicitly. An owning codec must deliberately project them into closed protocol values or reject them; the kernel rejects unprojected values before DAG-CBOR encoding.
@contract Registry lookup is exact on capability id and encoded schema version. It never selects a structural lookalike, nearest version, default codec, or empty fallback; duplicate ownership and ambiguous migration edges fail registration.
@contract Structured values encode once into canonical DAG-CBOR. Raw encoding is reserved for assets, authenticated-encryption envelopes, and foreign/native bytes whose exact representation must survive. JSON, base64, or a nested CAR is not introduced unless its owning capability contract requires it.
@contract Equivalent semantic values produce identical plaintext bytes and CIDs across Node, Bun, and supported browsers. Nondeterministic encryption happens only after canonical capability encoding and therefore never changes plaintext codec conformance.
@contract Decode and migration are pure and bounded. Their context provides immutable descriptor metadata, limits, and referenced-block reads only; it exposes no ambient network, filesystem, browser storage, clock, credential, DOM, or application-store access.
@proof Every codec passes a common conformance suite for exact bytes/CIDs, round trip, input immutability, strict rejection, migration completeness, dependency correctness, bounded adversarial input, opaque retention, and absence of effects.
@constraint Application adapters may consume decoded values and declarative restore plans but never participate in canonical encoding or registry compatibility decisions.
@evidence 2026-08-22 the neutral package implements canonical DAG-CBOR and raw encoding, cross-realm byte normalization, exact registry ownership, explicit pure migration chains with gap rejection, and `runTeleportCodecConformance`; the harness now runs against workspace, HUD intent, HUD exact replay, provider settings, and Fireproof codecs.
@evidence 2026-08-22 `src/golden.ts` locks capability CID, manifest root, whole-CAR SHA-256, and byte length; the neutral Vitest suite and `supa-svelte`'s real Edge conformance page independently recompute and match vector v1.
@proof_gap Expand the locked vector set when a second supported browser/runtime or a retained historical schema is admitted; broader practical parser fuzzing remains a hardening target rather than an unimplemented codec seam.
