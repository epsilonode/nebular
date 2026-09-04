---
id: browser-teleport-cdn-consumer-conformance
kind: strategy
status: proposed
created: 2026-09-05
updated: 2026-09-05
roadmap: car-teleport
refs:
  - roadmaps/car-teleport.md#browser-first-portable-cartridge-delivery
  - roadmaps/car-teleport.md#cross-project-round-trip-and-compatibility-matrix
  - memories/teleport/contracts/browser-teleport-import-export-contract.md
  - memories/teleport/broker/broker-epsilonode-nebular-esm-distribution.md
hook: "read before publishing the portable package, externalizing a consumer build, adding an import map, migrating a browser consumer, or testing CDN delivery"
---

# Browser Teleport CDN Consumer Conformance

@artifact Browser delivery is the compiled portable root package export only. Build it with the browser target, emit its declaration, and prove its import graph contains no Bun/Node/broker/recipe/process/keychain/application-runtime edge. The published browser tarball permits only the portable artifact, its declarations, package metadata, and ordinary documentation/license files; it rejects `src`, root TypeScript entrypoints, Bun artifacts, and nonportable package exports. Optional Bun experiments are separate source-only/deferred work and cannot gate this portable release.
@publish Build, verify, pack, and install the package into an isolated temporary consumer before publishing one immutable package version. Then verify `https://esm.sh/@epsilonode/nebular@<published-version>` resolves the published portable export, retains the chosen version through its module graph, and imports in a real supported browser. esm.sh is delivery/cache infrastructure, not the publisher or source of authority.
@consumer A browser application keeps `@epsilonode/nebular` as a bare specifier in source, marks that specifier external in its bundler, and emits an import map resolving it to the same pinned CDN version. It may install exactly that immutable package for declaration/type resolution, but production output must contain neither a local package copy nor a workspace/GitHub TypeScript fallback.
@matrix Record one consumer row each for JTWC, wx-ui-melt, and supa-svelte: package/version, import-map URL, bundler externalization, declaration-resolution proof, emitted-output scan, and its source-profile -> destination-profile CAR acceptance. A consumer advances only after its own browser build and adapter proof are green.
@release The release manifest binds Git commit, package version, tarball digest, portable artifact digest, CDN URL, browser target matrix, declaration digest, and consumer fixture outcomes. Version/tag mismatch, cache drift, missing import-map entry, local resolution, or bundled package bytes fail release conformance.
@proof Verify offline/clean browser cache behavior as supported by the selected CDN policy, plain/protected cross-profile CAR transfer, browser-only import without Node/Bun polyfills, same-version dependency closure, browser bundle/source-map scans, and package/registry/CDN failure diagnostics. An HTTP 200 alone is not delivery proof.
@done Browser delivery is complete only after one published immutable portable package version resolves externally in all admitted browser consumers, their production builds retain the import map rather than local package code, and their clean-profile import/export flows pass without Bun or workspace source availability.
