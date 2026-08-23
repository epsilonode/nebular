---
id: teleport-cross-project-ownership
kind: contract
status: active
created: 2026-08-22
updated: 2026-08-23
roadmap: car-teleport
refs:
  - roadmaps/car-teleport.md#cross-project-round-trip-and-compatibility-matrix
hook: "read before moving Teleport code across repositories, defining shared package ownership, or assigning cross-project verification"
---

# Cross-Project Teleport Ownership

@contract The neutral public upstream `epsilonode/nebular`, with package-style identity `@epsilonode/nebular`, owns the outer manifest, CAR reader/writer, CID verification, decode budgets, capability registry interfaces, encryption envelopes, migration dispatch, restore-plan primitives, and shared typed diagnostics.
@contract `R:/Code/web/jtwc` owns HUD semantic-intent, latest-scene rebase, exact-replay codecs, and HUD-specific reconciliation diagnostics.
@contract `R:/Code/web/wx-ui-melt` owns workspace topology, pane composition, import preview, unresolved-capability UI, and application commit/rollback behavior.
@contract `R:/Code/web/supa-mail-hook/supa-svelte` owns provider-settings and Fireproof-store codecs, browser credential export boundaries, and isolated store verification adapters.
@contract During migration, coordinated Bun consumers may retain the existing `link:@wx/teleport-cartridge` development identity after `mise run link`. Public cutover atomically changes consumers and locks to `epsilonode/nebular` or `@epsilonode/nebular`; external imports use one immutable Git ref and never a floating or mixed-ref authority graph.
@contract Distribution shells may deliver participating applications but never become schema or codec owners.
@proof Required acceptance is a clean-profile browser round trip of a multi-pane workspace containing multiple JTWC HUD intents, fresh authoritative rebase, unresolved optional capability retention, encrypted sensitive-capability omission/inclusion, and failure rollback without state loss.
