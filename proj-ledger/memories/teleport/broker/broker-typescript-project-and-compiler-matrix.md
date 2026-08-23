---
id: broker-typescript-project-and-compiler-matrix
kind: contract
status: proposed
created: 2026-08-23
updated: 2026-08-23
roadmap: broker
refs:
  - roadmaps/broker.md#hard-fp-tooling-and-fast-migration
  - roadmaps/broker.md#establish-four-entrypoint-public-upstream-and-builds
hook: "read before changing tsconfig files, ambient types, project references, declaration emission, compiler strictness, or the portable/client/broker build matrix"
---

# TypeScript Project And Compiler Matrix

@config Create `tsconfig.base.json`, `tsconfig.teleport.json`, `tsconfig.broker-client.json`, `tsconfig.recipe-runner.json`, `tsconfig.broker.json`, `tsconfig.tests.json`, and a declaration-emission config. Root typecheck invokes every project explicitly or through project references.
@base The base enables strict, exact optional properties, unchecked indexed access, unknown catch variables, no implicit returns, no fallthrough switches, no implicit override, no property access from index signatures, casing consistency, isolated modules, verbatim module syntax, and bundler-compatible module resolution.
@base Use no-unused-locals and no-unused-parameters in library/runtime projects once test and generated boundaries are separated. Do not rely on `skipLibCheck` to hide errors in project-owned declarations; if retained for third-party compatibility, verify emitted public declarations in isolated fixtures.
@portable The Teleport project admits ES and explicitly supported Web APIs only. It excludes Bun, Node, Vitest, filesystem, process, keychain, IPC server, and UI framework ambient types. Browser-only adapters are isolated behind explicit modules and cannot infect generic contracts.
@client The broker-client project admits only the runtime facilities its authenticated IPC client actually requires. It cannot see Bun keychain APIs, child-process APIs, consent UI, provider refresh, or broker server internals.
@runner The recipe-runner project admits facilities required for recipe discovery plus agentic status/output streaming and lifecycle requests. It may use the public broker client but cannot see keychain APIs, credential acquisition, grant persistence, consent UI, or broker server internals.
@broker The broker project admits pinned Bun types and imports portable/client public surfaces plus broker-owned domain/runtime/adapters. It is the only production project that may type-check `Bun.secrets`, Bun IPC/process facilities, and trusted-console integration.
@test The test project admits Vitest, DOM or browser harness types only when needed, Bun test utilities, and controlled fixture helpers. Production projects never include test globals.
@declaration Emit one public declaration entry for `.`, `./broker-client`, `./recipe-runner`, and `./broker`; internal declarations may exist in a bounded type directory but must not create public package subpaths. Isolated consumer fixtures resolve declarations through package exports, not source aliases.
@boundary Separate `lib` and `types` arrays are compiler enforcement. Lint import rules are defense in depth, not a substitute for ambient isolation.
@proof Negative compile fixtures demonstrate that portable code cannot name Bun/process/keychain APIs, client and runner code cannot import broker authority, runner code cannot acquire a secret or approve its own repository/recipe claim, browser code cannot acquire privileged ports, and declarations do not expose internal Effect requirements.
