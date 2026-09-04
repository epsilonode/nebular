---
id: broker-epsilonode-nebular-esm-distribution
kind: contract
status: proposed
created: 2026-08-23
updated: 2026-09-05
roadmap: broker
refs:
  - roadmaps/broker.md#four-typescript-upstream-entrypoints
  - roadmaps/broker.md#establish-four-entrypoint-public-upstream-and-builds
  - roadmaps/broker.md#four-artifact-distribution-conformance
  - roadmaps/broker.md#add-browser-broker-client-and-authenticated-bridge
hook: "read before creating the public repository, naming package/upstream coordinates, exposing TypeScript through esm.sh, publishing entrypoints, or writing remote import maps"
---

# Epsilonode Nebular GitHub And esm.sh Distribution

@identity The planned public source repository is `https://github.com/epsilonode/nebular`; the stable owner/repository prefix is `epsilonode/nebular`, and any package-style coordinate is `@epsilonode/nebular`.
@entrypoints The current release surface has exactly four stable root entrypoints: `teleport.ts`, `broker-client.ts`, `recipe-runner.ts`, and `broker.ts`. They are thin public composition surfaces over layered local TypeScript, not four hand-maintained copies of the implementation. A future browser client is a separately named, deliberately admitted fifth surface; it must never reinterpret the Bun/inherited-IPC `broker-client` or appear through an undocumented source path.
@urls GitHub source/evidence paths are `https://esm.sh/gh/epsilonode/nebular@<immutable-ref>/teleport.ts`, `/broker-client.ts`, `/recipe-runner.ts`, and `/broker.ts`. They are useful for immutable source inspection and development, but production browser consumers do not compile these TypeScript sources in each application.
@browser A browser-client URL is documented only after its browser-only entrypoint, export, declaration, artifact, trust contract, real-browser proof, and immutable release are admitted. esm.sh delivery does not itself satisfy any of those gates.
@browser_delivery Production browser consumers use the portable root package export through a pinned CDN import-map URL such as `https://esm.sh/@epsilonode/nebular@<published-version>`. Their bundlers externalize the bare `@epsilonode/nebular` specifier; they may install the identical immutable package only to resolve declarations, never as a link/file/workspace source fallback or an application-bundled copy.
@publish The release process builds the bounded JavaScript artifacts, proves the packed artifact from an isolated installed consumer, publishes the immutable package version, and only then verifies the package-version CDN URL and a real browser import map. esm.sh is a delivery/transform cache over the published package; it neither publishes it nor turns a GitHub TypeScript source URL into a supported compiled release artifact.
@pin Production browser import maps and lockfiles use one published immutable package version for the portable package export. Source inspection/evidence and installed Bun workflow inputs use one release tag or full commit as applicable. Floating default branches are development convenience only and never an authority-bearing deployment input.
@coherence A release manifest records repository, Git ref/commit, published package version, entrypoint paths, schema/version, dependency pins, and expected content/module-graph digests so mixed-ref, mixed-version, or stale-cache assembly fails closed.
@esm esm.sh is a delivery/transform cache, not the source of authority. Immutable Git source, the release manifest, and the corresponding published package artifact are canonical; consumers verify or lock resolved content according to runtime capability.
@boundaries `teleport.ts` is browser/portable; `broker-client.ts` is unprivileged; `recipe-runner.ts` is agent-facing and unprivileged; `broker.ts` is Bun-only privileged. Remote delivery does not relax compiler, import, effect, or secret boundaries.
@dependencies Public entrypoints use relative repository imports or explicitly pinned allowed external dependencies. No local aliases, workspace paths, Bake paths, `link:` dependencies, environment-selected URLs, or cross-ref dynamic imports may escape into the public graph.
@build Bun generates standalone JavaScript bundles for package/bin use. Those generated files are reproducible release artifacts; committed TypeScript entrypoints remain public source/evidence deliverables, while production browser consumers load the released compiled portable package export.
@installed-proof Pack the built package without lifecycle scripts, install that tarball into a fresh operating-system temporary directory outside the repository, and verify the installed package directory is a real directory whose resolved path remains inside that isolated consumer. From that consumer, independently typecheck and runtime-import `.`, `./broker-client`, `./recipe-runner`, and `./broker`; require every `import.meta.resolve` result to terminate at the corresponding installed `dist/*.js` file. This proof must never use a workspace link, source path, path alias, or repository-relative fallback, and it always removes the temporary consumer afterward.
@security Privileged `broker.ts` must not execute from an unpinned network URL in an authority-bearing workflow. Fetch/cache/update is explicit, verifies the selected immutable release, and runs through Mise/Bun policy.
@migration This source package now identifies as `@epsilonode/nebular`; adjacent consumers still using `@wx/teleport-cartridge` migrate atomically with dependency/import/lock updates rather than relying on an undeclared alias.
@namespace `wx.recipe/v1`, `wx.hud.intent`, and other protocol/application identifiers are separate wire namespaces and are not automatically renamed by the upstream move.
@proof Verify immutable GitHub source URLs for evidence, the published package-version CDN URL and same-version graph closure for browser delivery, browser/Bun compatibility by entrypoint, import-map locking, cache/ref update behavior, reproducible JS bundles, isolated installed-tarball runtime and declaration resolution, forbidden-path scans, and removal of the old public `@wx` identity.
