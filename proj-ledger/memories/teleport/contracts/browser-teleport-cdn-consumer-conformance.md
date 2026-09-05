---
id: browser-teleport-cdn-consumer-conformance
kind: strategy
status: proposed
created: 2026-09-05
updated: 2026-09-05
roadmap: car-teleport
refs:
  - roadmaps/car-teleport.md#teleportjs-browser-client-and-portable-cartridge-delivery
  - roadmaps/car-teleport.md#cross-project-round-trip-and-compatibility-matrix
  - memories/teleport/contracts/browser-teleport-import-export-contract.md
  - memories/teleport/broker/broker-epsilonode-nebular-esm-distribution.md
hook: "read before committing a portable release artifact, externalizing a consumer build, adding an import map, migrating a browser consumer, or testing CDN delivery"
---

# Browser Teleport CDN Consumer Conformance

@artifact Browser delivery is exactly committed `dist/teleport.js` plus `dist/types/teleport.d.ts`, compiled from the portable root with the browser target. Prove its import graph contains no Bun/Node/broker/recipe/process/keychain/application-runtime edge. The same immutable Git release commit may retain independently shippable compiled Bun artifacts and their declarations for Bake and other Bun consumers. The portable-root Git-release/CDN gate is separate from, and cannot be blocked by, their runtime/E2E release gates.
@publish Build and verify the portable artifact and declarations, commit them with the matching source revision, and pin that immutable Git commit. Then verify `https://esm.sh/gh/epsilonode/nebular@<immutable-commit>/dist/teleport.js` resolves the committed portable JavaScript, retains the selected commit through its module graph, and imports in a current evergreen Microsoft Edge browser. esm.sh is the accepted production delivery/cache infrastructure; GitHub's immutable commit containing the compiled artifact is the release authority. npm/registry publication is optional and cannot gate browser release.
@consumer A browser application keeps `@epsilonode/nebular` as a bare specifier in source, marks that specifier external in its bundler, and emits an import map resolving it to the pinned compiled GitHub/esm.sh artifact URL. It resolves declarations from that same committed release tree without compiling source. Production output must contain neither a local package copy nor a workspace/GitHub TypeScript fallback.
@matrix Record one consumer row each for JTWC, wx-ui-melt, and supa-svelte: Git commit, import-map URL, bundler externalization, declaration-resolution proof, emitted-output scan, and its source-profile -> destination-profile CAR acceptance. Use the Supa-owned Researcher route as the first compact Edge interaction/proof reference; `wx-ui-melt` is the primary merge target and the first expanded workspace-capability acceptance. A consumer advances only after its own browser build and adapter proof are green.
@release The release manifest binds Git commit, portable artifact digest, CDN URL, browser target matrix, declaration digest, and consumer fixture outcomes. Commit/URL mismatch, cache drift, missing import-map entry, local resolution, or bundled package bytes fail release conformance. Package version and tarball digest are optional additional fields only when a later registry package is released.
@proof Verify offline/clean browser cache behavior as supported by the selected CDN policy, plain/protected cross-profile CAR transfer, browser-only import without Node/Bun polyfills, same-commit module closure, browser bundle/source-map scans, and GitHub/CDN failure diagnostics. An HTTP 200 alone is not delivery proof.
@done Browser delivery is complete only after one immutable Git commit containing the portable compiled artifact resolves externally in all admitted browser consumers, their production builds retain the import map rather than local package code, and their clean-profile import/export flows pass without Bun or workspace source availability.
