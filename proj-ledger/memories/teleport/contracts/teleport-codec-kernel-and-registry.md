---
id: teleport-codec-kernel-and-registry
kind: contract
status: active
created: 2026-08-22
updated: 2026-08-22
roadmap: car-teleport
refs:
  - roadmaps/car-teleport.md#define-the-capability-codec-kernel-and-registry
  - roadmaps/car-teleport.md#land-reference-codecs-in-dependency-order
hook: "read before implementing the shared codec interface, capability registry, dispatch, dependency declarations, or codec execution context"
---

# Capability Codec Kernel And Registry

@contract The codec kernel is the universal semantic extension point. A codec owns one stable capability id, one current writable schema version, an explicit historical read set, a security class, decode budgets, dependency projection, canonical encode, strict decode, pure migrations, and restore-plan projection.
@contract Capability ids are lowercase reverse-domain-style protocol names such as `wx.hud.intent`; application labels, source paths, npm package names, and UI names are not capability identities.
@contract Registry dispatch is exact on capability id and encoded schema version. It never chooses a nearby version, structural lookalike, default codec, or empty fallback.
@contract Registration fails on duplicate ownership, missing current encoder/decoder, ambiguous migration edges, invalid identifiers, or cyclic hard dependencies.
@contract Codecs receive immutable bounded input and an explicit context containing only protocol-safe limits, referenced-block access, and capability metadata. Ambient I/O, network, storage, UI, credentials, and mutable application state are unavailable.
@contract The kernel returns typed outcomes and declarative plans. Application adapters alone execute effects.
@constraint The shared registry can load codec descriptors lazily but import-time registration cannot perform effects or make codec availability depend on current user data.
