---
id: teleport-workspace-composition
kind: contract
status: active
created: 2026-08-22
updated: 2026-08-22
roadmap: car-teleport
refs:
  - roadmaps/car-teleport.md#composable-wx-ui-melt-workspace-cartridges
hook: "read before changing wx-ui-melt workspace export/import, pane content identity, split serialization, or nested HUD placement"
---

# Teleport Workspace Composition

@contract `wx.workspace.layout` owns split topology, stable pane and split ids, active pane, canonical camera state, ordering, and pane content references by capability id plus instance id.
@contract Workspace layout never embeds application-specific pane payloads. Capability instances remain sibling CAR blocks so multiple panes may reference distinct JTWC HUD intents or future tools without coupling workspace schema evolution to those tools.
@contract Import first restores the pure layout model, resolves supported pane capabilities through the registry, and leaves an explicit unresolved placeholder for retained optional capabilities that are unavailable locally.
@contract Exported counters and sequences are accepted only when consistent with the validated topology or are deterministically recomputed by the current workspace migration.
@contract The current JSON `workspace.car` is legacy input only after a migration is defined. New `.car` downloads must be genuine CAR bytes with the Teleport root; JSON exports use an explicit JSON extension and MIME type.
@constraint Invalid input produces typed issues and never becomes an empty settings document or default workspace silently.
