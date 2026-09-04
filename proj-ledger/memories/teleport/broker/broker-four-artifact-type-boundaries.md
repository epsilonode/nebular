---
id: broker-four-artifact-type-boundaries
kind: contract
status: proposed
created: 2026-08-23
updated: 2026-09-05
roadmap: broker
refs:
  - roadmaps/broker.md#four-typescript-upstream-entrypoints
  - roadmaps/broker.md#establish-four-entrypoint-public-upstream-and-builds
  - roadmaps/broker.md#four-artifact-distribution-conformance
hook: "read before changing entrypoints, tsconfig projects, package exports, Bun builds, declarations, runtime targets, recipe execution, or portable/privileged import boundaries"
---

# Four-Artifact Type And Compiler Boundaries

@historical The previous four-artifact package boundary covered portable `teleport.ts`, `broker-client.ts`, `recipe-runner.ts`, and `broker.ts`. It is retained only as a deferred source-level record for optional Bun experiments, not as the public browser package contract.
@browser The existing portable `teleport.ts` is the browser import/export surface and the sole published package export. Browser delivery neither adds nor reinterprets a broker client, and is qualified only by the portable artifact's browser graph, declaration, published-package/CDN, and cross-profile application proof. The remaining Bun entrypoints are not published or released with it.
@contract Use separate compiler projects for portable Teleport, broker client, recipe runner, privileged broker, and tests, all extending one strict base configuration. Do not give every source file combined DOM, Node, Bun, and test ambient types.
@contract The portable compiler environment admits only the platform contracts deliberately supported by `teleport.js`; the client and runner environments admit only their narrow unprivileged facilities; the broker environment admits Bun and privileged process APIs; tests own test-only globals.
@contract Type-only imports and package direction enforce `teleport <- credential contracts/transfer codec <- broker client <- recipe runner` and `broker client/contracts <- broker domain/runtime`. Portable or unprivileged code never imports back toward broker authority.
@contract `recipe-runner.js` owns agentic CLI/API argument parsing, recipe location, nonauthoritative early validation, IPC request construction, output/status streaming, cursor polling, and actionable outcome rendering. It never reads `Bun.secrets`, accepts plaintext credentials, persists grants, or computes an authoritative repository/recipe identity.
@contract `broker.js` resolves the canonical Git worktree and recipe path, reads and normalizes the recipe itself, evaluates the repository-scoped recipe grant, acquires the secret, and invokes the receiver-specific leaf lifecycle. The runner's parsed repository and recipe values are hints only.
@contract Bun bundles each TypeScript entrypoint independently to JavaScript with code splitting disabled. No shared runtime chunk may become an undeclared fifth artifact.
@contract GitHub/esm.sh paths use one immutable `epsilonode/nebular` ref across all four entrypoints; package exports under `@epsilonode/nebular` map `.`, `./broker-client`, `./recipe-runner`, and `./broker` to corresponding JavaScript and declaration entrypoints.
@contract Do not emit or distribute a native executable. `recipe-runner.js` and `broker.js` run under the Mise-pinned Bun runtime; package bins or Mise tasks resolve those JavaScript entrypoints.
@contract Generate accurate declarations separately; declaration files do not expand runtime authority or expose privileged internals through portable, client, or runner exports.
@contract Installed-package conformance packs the already-built repository, installs the tarball into a fresh consumer outside the workspace, rejects links or resolved package paths outside that consumer, then independently typechecks and runtime-imports all four exported subpaths. Runtime resolution must end at the four installed `dist/*.js` entrypoints; repository source, workspace aliases, and package-manager links are forbidden fallbacks.
@proof Build conformance checks exact artifact count, import graphs, ambient type isolation, browser and Bun loading, declaration resolution from isolated fixtures and the installed tarball, absence of source fallbacks, runner nonauthority, and absence of secrets or unexpected absolute paths.
