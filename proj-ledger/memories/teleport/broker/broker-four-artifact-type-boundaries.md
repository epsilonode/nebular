---
id: broker-four-artifact-type-boundaries
kind: contract
status: proposed
created: 2026-08-23
updated: 2026-08-23
roadmap: broker
refs:
  - roadmaps/broker.md#four-typescript-upstream-entrypoints
  - roadmaps/broker.md#establish-four-entrypoint-public-upstream-and-builds
  - roadmaps/broker.md#four-artifact-distribution-conformance
hook: "read before changing entrypoints, tsconfig projects, package exports, Bun builds, declarations, runtime targets, recipe execution, or portable/privileged import boundaries"
---

# Four-Artifact Type And Compiler Boundaries

@contract Maintain layered TypeScript source and expose exactly four stable public entrypoints from `epsilonode/nebular`: portable `teleport.ts`, unprivileged `broker-client.ts`, unprivileged `recipe-runner.ts`, and Bun-only privileged `broker.ts`; reproducible standalone `.js` bundles remain supported build artifacts.
@contract Use separate compiler projects for portable Teleport, broker client, recipe runner, privileged broker, and tests, all extending one strict base configuration. Do not give every source file combined DOM, Node, Bun, and test ambient types.
@contract The portable compiler environment admits only the platform contracts deliberately supported by `teleport.js`; the client and runner environments admit only their narrow unprivileged facilities; the broker environment admits Bun and privileged process APIs; tests own test-only globals.
@contract Type-only imports and package direction enforce `teleport <- credential contracts/transfer codec <- broker client <- recipe runner` and `broker client/contracts <- broker domain/runtime`. Portable or unprivileged code never imports back toward broker authority.
@contract `recipe-runner.js` owns agentic CLI/API argument parsing, recipe location, nonauthoritative early validation, IPC request construction, output/status streaming, cursor polling, and actionable outcome rendering. It never reads `Bun.secrets`, accepts plaintext credentials, persists grants, or computes an authoritative repository/recipe identity.
@contract `broker.js` resolves the canonical Git worktree and recipe path, reads and normalizes the recipe itself, evaluates the repository-scoped recipe grant, acquires the secret, and invokes the receiver-specific leaf lifecycle. The runner's parsed repository and recipe values are hints only.
@contract Bun bundles each TypeScript entrypoint independently to JavaScript with code splitting disabled. No shared runtime chunk may become an undeclared fifth artifact.
@contract GitHub/esm.sh paths use one immutable `epsilonode/nebular` ref across all four entrypoints; package exports under `@epsilonode/nebular` map `.`, `./broker-client`, `./recipe-runner`, and `./broker` to corresponding JavaScript and declaration entrypoints.
@contract Do not emit or distribute a native executable. `recipe-runner.js` and `broker.js` run under the Mise-pinned Bun runtime; package bins or Mise tasks resolve those JavaScript entrypoints.
@contract Generate accurate declarations separately; declaration files do not expand runtime authority or expose privileged internals through portable, client, or runner exports.
@proof Build conformance checks exact artifact count, import graphs, ambient type isolation, browser and Bun loading, declaration resolution from isolated fixtures, absence of source fallbacks, runner nonauthority, and absence of secrets or unexpected absolute paths.
