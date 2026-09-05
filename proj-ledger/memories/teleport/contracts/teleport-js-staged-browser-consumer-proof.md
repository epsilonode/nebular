---
id: teleport-js-staged-browser-consumer-proof
kind: strategy
status: proposed
created: 2026-09-05
updated: 2026-09-05
roadmap: car-teleport
refs:
  - roadmaps/car-teleport.md#teleportjs-browser-client-and-portable-cartridge-delivery
  - roadmaps/car-teleport.md#cross-project-round-trip-and-compatibility-matrix
  - memories/teleport/contracts/browser-teleport-import-export-contract.md
  - memories/teleport/contracts/browser-teleport-cdn-consumer-conformance.md
hook: "read before selecting a first browser consumer, copying Researcher profile-transfer UX, or merging teleport.js into wx-ui-melt"
---

# Teleport.js Staged Browser Consumer Proof

@ownership `wx-shells` routes `/agent/researcher` to the Supa-owned `supa-svelte` Researcher module. It distributes that compiled route but does not own its source or its transfer adapter. `wx-ui-melt` owns its own workspace composition, capability projection, restore adapter, and browser acceptance.
@researcher The existing Researcher profile-transfer UI is the compact interaction reference: user-selected file input, optional AES-GCM passphrase, explicit import/export actions, cancellation, status/error feedback, and browser download against Fireproof-backed profile documents. It is currently a JSON `wx-user-profile` envelope implementation, not a `teleport.js` CAR consumer.
@stage_one Make Researcher the smallest admitted `teleport.js` browser-consumer proof only by replacing or wrapping its application-owned transfer adapter with the portable root's CAR export, parse/verify/unlock, inert plan, confirmation, and restore interfaces. Preserve its current browser UX affordances, but keep all Fireproof projection and mutation in Supa-owned code. Prove a clean Edge source profile to a distinct clean Edge destination profile for representative Researcher data, including plain/protected input, wrong key, cancellation, and redaction.
@stage_two `wx-ui-melt` is the primary merge target and expanded-capability proof. It migrates its legacy linked-source dependency to the published `@epsilonode/nebular` bare specifier plus pinned esm.sh import map, then proves selected multi-pane workspace export, plan review, explicit confirmation, restore, unsupported-optional retention, forced rollback/recovery, and cross-profile clean Edge transfer through its own application adapter.
@ordering Researcher validates the smallest user-facing import/export loop and CDN consumer mechanics. wx-ui-melt validates the valuable multi-capability composition path. Neither stage imports application UI or adapters into `teleport.js`, and success in Researcher does not waive wx-ui-melt's independent browser, package-externalization, or restore proof.
@later JTWC and Supa-svelte complete their own matrix rows after the staged proofs. Their codec/runtime ownership remains local; the neutral package owns only portable cartridge contracts and orchestration.
