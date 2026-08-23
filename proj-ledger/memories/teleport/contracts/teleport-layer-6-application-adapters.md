---
id: teleport-layer-6-application-adapters
kind: contract
status: active
created: 2026-08-22
updated: 2026-08-23
roadmap: car-teleport
refs:
  - roadmaps/car-teleport.md#seven-layer-teleport-architecture
  - roadmaps/car-teleport.md#land-reference-codecs-in-dependency-order
  - roadmaps/car-teleport.md#composable-wx-ui-melt-workspace-cartridges
hook: "read before implementing JTWC, wx-ui-melt, provider, Fireproof, asset, exact-replay, or application effect adapters"
---

# Layer 6: Application Codecs And Effect Adapters

@contract Applications own their semantic capability codecs and effect adapters while depending only on neutral kernel, cartridge, security, and restore-plan contracts. Codec ownership and effect ownership may share a package but remain separate modules and test seams.
@contract JTWC owns `wx.hud.intent@2` for durable HUD intent rebased against fresh authoritative scene data and `wx.hud.exact-replay` for explicitly stale-capable runtime/debug playback. Exact replay never substitutes for current semantic intent.
@contract wx-ui-melt owns `wx.workspace.layout` for split topology, pane and split identity, active pane, canonical camera/layout state, and references to capability instance ids. It composes multiple JTWC or other pane instances without embedding their payload schemas.
@contract wx-ui-melt import preview and effect adapters expose unsupported retained capabilities, required blockers, confirmation boundaries, staged results, commit receipts, rollback outcomes, and pane-instance targeting without silently producing an empty workspace.
@contract Supa Svelte owns semantic provider/settings codecs and an optional exact-pinned Fireproof native-snapshot adapter. Semantic settings use a canonical capability; Fireproof history is included only when native recovery, history, or replication evidence is explicitly requested.
@contract Native adapters declare their foreign storage-format compatibility independently from npm package versions, select an exact tested implementation, and are accepted only through golden export/restore/reopen fixtures.
@proof Full acceptance restores a clean-profile multi-pane wx-ui-melt workspace with multiple isolated JTWC intent instances, performs fresh authoritative rebase, retains an unavailable optional pane capability, and rolls back a forced required-step failure without state loss.
@constraint Distribution shells deliver applications and codec packages but never own capability schemas, migrations, security policy, or application restore behavior.
@evidence 2026-08-22 JTWC owns intent and exact-replay codecs, wx-ui-melt owns true-CAR workspace layout and transactional local import, Supa owns provider-settings and exact-pinned Fireproof snapshot codecs, and the neutral package owns paired raw-blob/metadata asset capabilities. Cross-project tests preserve two isolated HUD instances in one workspace CAR.
@evidence 2026-08-23 JTWC's full gate passes 508 tests and both UI builds; wx-ui-melt passes 70 tests, Svelte check, and production build; Supa passes 137 tests and Astro check. Persistent exact-pinned Fireproof replace/merge and two-instance workspace isolation are covered at their actual application seams.
@evidence 2026-08-22 `mise run browser-conformance` in wx-ui-melt passes after extraction of the restore adapter: it launches the production build in a fresh Edge profile, uses the actual View Engine file input, imports a genuine CAR, verifies two restored panes plus the intended active pane, and visibly labels an unsupported optional capability as retained rather than discarding it.
@evidence 2026-08-22 wx-ui-melt's extracted restore adapter proves complete-topology commit and exact prior-topology rollback after a forced post-commit host verification failure at the application seam.
@evidence 2026-08-22 the production workspace surface now verifies its rendered pane identities and active pane after Svelte settles. Clean-profile Edge forces that renderer predicate to fail, observes the visible error and exact prior rendered topology, then imports the same CAR successfully.
@evidence 2026-08-22 wx-ui-melt's application adapter now owns a validated prior-topology journal. Clean-profile Edge interrupts after render/commit with a page reload and proves startup recovery and journal consumption before continuing the acceptance matrix.
@evidence 2026-08-22 the persistent Fireproof adapter now brackets exact-store activation with durable prepare/finalize/cancel hooks. A real terminated child process and fresh restart prove prior native-store recovery and interrupted staging cleanup; Supa passes 137 tests and Astro check with zero findings.
@proof_gap Add one combined clean-profile browser acceptance that renders multiple actual JTWC HUD intent instances and invokes the injected or public `tropicals.wxunlimited.com` scene-provider boundary. Direct Navy-provider reachability and DNS-adapter behavior belong to tropical capture transport, not this application-adapter proof.
