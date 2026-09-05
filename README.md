# Nebular

Nebular is a browser-first portable TypeScript toolkit for moving browser application capabilities
between browser profiles through safe, reviewable Teleport Cartridge import and export.

The public source and release artifacts live at `epsilonode/nebular`. Browser applications consume
the committed compiled portable artifact through a pinned immutable GitHub/esm.sh import map; they do
not link this workspace or compile its TypeScript source:

```text
@epsilonode/nebular -> https://esm.sh/gh/epsilonode/nebular@<immutable-commit>/dist/teleport.js
```

Configure the browser bundler to leave the bare package specifier external, and resolve declarations
from the same release commit without compiling source. GitHub/esm.sh TypeScript URLs remain development
and source-inspection paths; production browser dependencies name only the committed JavaScript
artifact. The same release commit may include separately constrained compiled Bun artifacts for Bake
and other Bun consumers, but browser applications never load or depend on them.

## `teleport.ts`

The portable, browser-compatible Teleport Cartridge entrypoint. Its complete target includes:

- framework-neutral capability contracts, typed codec registries, canonical encoding, migrations,
  decode budgets, and unknown-capability retention;
- content-addressed CAR graphs, CID and signature verification, public or protected inventories,
  assets, streaming, files, and object-storage transport profiles;
- unencrypted export, encrypted export, recipient protection, selective disclosure, key rotation,
  and tamper detection;
- pure restore planning with staging, authorization, commit, verification, rollback, recovery, and
  application-owned effect adapters;
- conformance support for JTWC, wx-ui-melt, Supa/Fireproof, and other independent applications.

This entrypoint must not contain keychain access, consent UI, credential acquisition, provider
refresh, or process-launching authority.

## Development status

The capabilities above describe the intended public surface once implemented. This README is
intentionally an advertisement, not a progress ledger. Current state, accepted decisions,
implementation order, blockers, and proof are maintained only in:

- [`proj-ledger/roadmaps/car-teleport.md`](proj-ledger/roadmaps/car-teleport.md)

The retained broker roadmap is paused pending Bake work. Its Bun artifacts remain separately shippable
but are not part of the browser runtime.

## Development

Use the pinned toolchains only:

```sh
mise run install
mise run check
mise run test
mise run verify
```
