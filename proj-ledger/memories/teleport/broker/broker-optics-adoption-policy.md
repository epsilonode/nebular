---
id: broker-optics-adoption-policy
kind: decision
status: proposed
created: 2026-08-23
updated: 2026-08-23
roadmap: broker
refs:
  - roadmaps/broker.md#expand-domain-algebras-and-lawful-composition
hook: "read before adding lenses, prisms, optics libraries, generic immutable update helpers, or deeply nested broker/UI state"
---

# Optics Adoption Policy

@decision Do not add an optics dependency initially. Broker domain state should remain shallow, normalized, and reducer-owned so ordinary immutable constructors and object spread remain readable.
@trigger Reconsider optics only after a measured inventory shows repeated deeply nested immutable reads/updates, duplicated path handling, or unsafe optional traversal across at least two durable domains.
@contract If adopted, begin with a minimal project façade supporting only required lens/prism/optional operations, preserve readonly inference, and prohibit optics from crossing public wire or domain contracts.
@contract Optics never replace state normalization, domain transitions, validation, or authority checks. An optic may focus data; only an owning reducer may decide whether an update is legal.
@constraint Do not encode secret paths, dynamic unvalidated property names, or cross-domain writes in generic optics. Do not use optics to mutate Fireproof, Svelte, keychain, or Effect Ref state outside their adapters/reducers.
@proof Adoption requires before/after complexity evidence, bundle impact, type inference proof, law tests for the selected optics, and deletion of equivalent bespoke update code. Otherwise retain explicit immutable updates.

