# wx-teleport-cartridge Agent Entry

Start with `workspace-map.yaml`, then `proj-ledger/control.yaml`. This workspace owns the framework-neutral Teleport protocol and its canonical roadmap; application codecs and runtime effects remain in their owning workspaces.

Use tiered routing. Grep roadmap headings and memory hooks first, then read only the selected open roadmap item and its linked memories. Do not read the full roadmap or memory tree for routine orientation.

`proj-ledger/triggers.yaml` is also the repository-local skill router. Select every matching trigger; matches are cumulative, not alternatives. Read each listed `path` when present and load every `skills` entry from `local-skills/`. Load skill bodies only after a trigger match or an explicit request matching the skill description; never use them as generic always-on guidance, copy them into an auto-discovered skill directory, or register `local-skills/` globally.
