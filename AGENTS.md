# wx-teleport-cartridge Agent Entry

Start with `workspace-map.yaml`, then `proj-ledger/control.yaml`. This workspace owns the framework-neutral Teleport protocol and its canonical roadmap; application codecs and runtime effects remain in their owning workspaces.

Use tiered routing. Grep roadmap headings and memory hooks first, then read only the selected open roadmap item and its linked memories. Do not read the full roadmap or memory tree for routine orientation.

## Toolchain Authorization

Use runtime and package tooling only through `mise run ...`, `mise exec ...`, or `uv ...`. Do not invoke `node`, `npm`, `npx`, `pnpm`, `bun`, `deno`, `python`, `pip`, or other globally resolved runtime/package commands directly. If a required command cannot be run through Mise or uv, stop and ask the user for permission before invoking it.

Use the declared Mise tasks: `mise run install`, `mise run link`, `mise run check`, `mise run test`, and `mise run verify`. Run `mise run link` before installing an adjacent Bun consumer that declares `link:@epsilonode/nebular`.
