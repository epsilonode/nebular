---
id: broker-local-recipe-integration-and-bundling
kind: contract
status: proposed
created: 2026-08-23
updated: 2026-08-23
roadmap: broker
refs:
  - roadmaps/broker.md#extract-and-localize-the-bake-recipe-kernel
  - roadmaps/broker.md#four-typescript-upstream-entrypoints
  - roadmaps/broker.md#establish-four-entrypoint-public-upstream-and-builds
  - memories/teleport/broker/broker-four-artifact-type-boundaries.md
  - memories/teleport/broker/broker-import-and-authority-boundary-enforcement.md
  - memories/teleport/broker/broker-typescript-project-and-compiler-matrix.md
hook: "read before compiling recipe code, creating recipe-runner.js, deciding whether to import a Bake bundle, sharing parser code between runner and broker, enabling code splitting, or changing recipe entrypoints"
---

# Local Recipe Integration And Bundling

@decision Maintain layered TypeScript source locally, commit four thin root TypeScript deliverables to `epsilonode/nebular`, and produce standalone JavaScript runtime artifacts locally when required. Do not treat a compiled Bake file as the recipe library.
@language TypeScript is the authored, reviewed, and GitHub/esm.sh-served source. Bun may bundle each root entrypoint to JavaScript for offline/package/bin use; no native executable is produced.
@ownership After transplant, recipe modules live under the future `epsilonode/nebular` boundaries and are versioned, linted, tested, bundled, and released from that repository. Bake is neither imported nor required to reproduce the build.

## Source layering

@contract Put XML boundary decoding, normalized recipe ADTs, parameter/port resolution, lifecycle policy, receiver algebra, events/status, output cursors, redacted projections, and conformance helpers in narrow local modules with explicit public surfaces.
@pure Parsing after raw XML conversion, normalization, resolution, validation accumulation, plan construction, state reduction, observation synthesis, cursor math, error mapping, and redacted rendering remain pure.
@effects File reads, Git identity, clock, process/PM2, probes, journal, stdout/stderr, IPC, consent, keychain, secret handoff, and cancellation live behind capability-specific ports. The composition root supplies adapters; domain modules never import them directly.
@imports Enforce the direction `portable protocol <- credential/recipe contracts <- broker client <- recipe runner`, with broker domain/runtime consuming public contracts through its privileged composition root. Deep imports and reverse authority edges fail lint, compiler, and bundle-metafile verification.

## Runner and broker responsibilities

@runner `recipe-runner.js` locates the requested repository/recipe for user diagnostics, performs nonauthoritative parsing, accepts parameter input, constructs versioned client requests, streams status and bounded output, advances cursors, renders redacted outcomes, and exposes agent actions. It cannot grant authority, retrieve credentials, construct a secret environment, or launch a secret-bearing target independently.
@broker `broker.js` independently canonicalizes the Git worktree and recipe path, reads and parses the recipe from trusted local inputs, validates the exact recipe revision and grant, plans credential delivery, invokes the selected receiver, and records redacted lifecycle facts. Runner claims are hints and never authority.
@duplicate Both entrypoints therefore need parts of the recipe decoder/contracts. With code splitting disabled, Bun may duplicate those pure modules into `recipe-runner.js` and `broker.js`. This is accepted bounded byte duplication, not duplicated source ownership or a second semantic implementation.
@consistency Both bundles are generated from the same local source modules in one build graph. Tests prove identical normalization and schema versions; never hand-maintain separate runner and broker parser copies.

## Artifact rules

@artifacts The public source distribution exposes `teleport.ts`, `broker-client.ts`, `recipe-runner.ts`, and `broker.ts`; the optional generated runtime distribution mirrors them as four `.js` files. Recipe integration creates no fifth public entrypoint, shared chunk, Bake compatibility file, Node helper, or native executable.
@splitting Build every entrypoint independently with Bun code splitting disabled. Fail verification if a dynamic or shared chunk becomes required, if one artifact loads another through an undeclared relative path, or if a source path escapes the package.
@exports Public package exports expose only the four declared runtime/declaration entries. Internal recipe modules remain internal even when both runner and broker bundle them.
@declarations Emit declarations from local source. No declaration may reference `@bake/*`, `R:/Code/pk`, local source aliases unavailable to consumers, Bake types, privileged internal modules, or combined Bun/DOM/test ambient environments.
@metafile Inspect bundle metafiles for Bake paths, forbidden authority edges, unexpected Node/Bun dependencies in portable artifacts, source fallbacks, absolute paths, shared chunks, and secret-related literals outside the privileged artifact.

## Build and development workflow

@tooling All install, typecheck, test, bundle, and verification commands use workspace Mise tasks and the pinned Bun runtime. No build step enters Bake, invokes Bake recipes implicitly, reads Bake `node_modules`, or assumes a linked Bake workspace.
@dev During transplant only, a comparison test may read explicitly copied fixtures or invoke a separately declared Bake comparison command outside the production build. Remove that dependency from normal local verification at cutover.
@increment Build the local modules and tests before freezing entrypoint bundling. Avoid beginning with an opaque single-file port because it hides import authority, ambient effects, FP violations, and extraction debt.
@proof Verify isolated loading of each artifact, exact artifact count, declaration resolution, no undeclared source files, browser safety of portable output, runner nonauthority, broker-only privileged imports, and identical recipe normalization between runner and broker bundles.

## Failure modes

@avoid Do not import Bake's private temporary façade, vendor its compiled distribution, publish it merely to satisfy this workspace, or keep it connected with `link:`. Those choices convert temporary development provenance into ongoing operational coupling.
@avoid Do not compile all broker behavior into `recipe-runner.js`. The runner is intentionally unprivileged; collapsing runner and broker erases the consent, authority, keychain, and process-materialization boundary.
@avoid Do not create a shared persistent parser service to avoid bundle duplication. A few duplicated pure modules are cheaper and safer than another runtime, endpoint, discovery mechanism, or failure domain.
@done Local integration is done when layered source passes strict compiler/lint tests, both runner and broker use the same local recipe kernel, four independent artifacts build through Mise, declarations are consumer-clean, and removing or renaming `R:/Code/pk` cannot affect any supported workflow.
