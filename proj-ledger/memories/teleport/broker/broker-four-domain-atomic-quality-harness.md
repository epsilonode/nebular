---
id: broker-four-domain-atomic-quality-harness
kind: contract
status: proposed
created: 2026-08-23
updated: 2026-08-23
roadmap: broker
refs:
  - roadmaps/broker.md#hard-fp-tooling-and-fast-migration
  - roadmaps/broker.md#fp-and-tooling-conformance
  - roadmaps/broker.md#four-artifact-distribution-conformance
hook: "read before changing lint, TypeScript, Vitest, check, or verify scripts; adding a domain project; classifying an atomic, seam, or live suite; or changing root quality-gate composition"
---

# Four-Domain Atomic Quality Harness

@decision Make `teleport`, `broker-client`, `recipe-runner`, and `broker` the atomic production quality units. Each receives independently executable lint, compiler, test, and composed check gates; root verification composes those gates and then proves cross-domain seams and emitted artifacts.

## Gate Matrix

| Domain | Lint | TypeScript | Vitest | Composite |
| --- | --- | --- | --- | --- |
| `teleport` | `lint:teleport` | `typecheck:teleport` | `test:teleport` | `check:teleport` |
| `broker-client` | `lint:broker-client` | `typecheck:broker-client` | `test:broker-client` | `check:broker-client` |
| `recipe-runner` | `lint:recipe-runner` | `typecheck:recipe-runner` | `test:recipe-runner` | `check:recipe-runner` |
| `broker` | `lint:broker` | `typecheck:broker` | `test:broker` | `check:broker` |

@atomic `check:<domain>` runs that domain's scoped lint, strict compiler project, and named Vitest project. A change within one domain receives a fast objective gate; completion and integration still require the root gate.
@root Root `lint`, `typecheck`, and `test` compose the four domain gates in dependency order plus their supporting configuration/tooling concerns. Root `verify` runs zero-warning lint, all compiler projects, all four non-live atomic projects, the seam project, builds, artifact-graph checks, declaration fixtures, and required conformance checks.
@dedupe Root lint composes each scoped domain lint exactly once plus tooling/configuration lint. Do not first lint all production source through a generic FP task and then lint the same files again through every domain task. Shared functional rules live in the common flat-config profile and apply during each scoped invocation.
@resource A single domain gate may partition its file inventory across multiple bounded ESLint processes when type-aware rule state causes nondeterministic memory exhaustion, provided every first-party file is still linted exactly once with the same domain profile and zero warnings. This is process isolation, not a fifth domain, weaker rules, or authorization for permanent per-file command sprawl; prefer one stable internal subdirectory boundary and retain the domain-level command as the only public gate.
@lint Each domain lint invocation applies the shared type-aware TypeScript and hard-FP baseline, the domain's default-disallow dependency policy, its ambient-effect restrictions, public-surface import rules, and any path-scoped adapter mechanics. A domain cannot obtain broader authority merely because its artifact eventually bundles with privileged code.
@compiler Each domain owns a strict compiler project with only its permitted ambient libraries and allowed public dependency surfaces. Compiler isolation and lint dependency rules must agree but remain independent defenses.
@collocation Ordinary owner-focused tests remain beside source as `*.test.ts` and execute only in their owning domain project. Every substantial module gains a colocated suite for constructors, decoders, laws, state transitions, error mapping, cancellation, cleanup, or adapter translation appropriate to that owner.
@seam Cross-domain behavior uses `*.seam.test.ts` and executes exactly once in the dedicated `seam` project after atomic projects. Seam suites import participating domains only through stable entrypoints or `public.ts`, inject effect ports, name the contract being crossed, and prove authority, data, diagnostics, cleanup, and failure behavior that no single owner can establish.
@seams Required upper-level seams include portable cartridge to broker encrypted transfer, broker client to privileged broker IPC, recipe runner to broker/receiver execution, grant to scoped secret delivery, receiver lifecycle to observation/cancellation, and all four entrypoints to their emitted artifact authority boundaries.
@live Host-, keychain-, PM2-, network-, provider-, or platform-dependent proof uses `*.live.test.ts`, executes only through an explicit `test:live`, declares prerequisites and cleanup, and never enters default root verification unless a later CI environment deliberately provisions it.
@support Keep `configuration` as a supporting project that proves Vitest selection, serialized execution, lint parser services, boundary policy fixtures, and build configuration. Configuration, seam, and live are harness classes rather than a fifth production domain.
@negative Add lint and compile-negative fixtures for every forbidden upper-level edge, including type-only imports, aliases, barrels, dynamic imports, portable ambient Bun/Node use, client keychain access, runner authorization/secret acquisition, broker-to-runner reversal, and production imports from test/tooling code.
@public Each entrypoint receives an atomic public-surface test proving intended exports and import-time behavior. Artifact conformance separately proves the portable/client/runner graphs exclude privileged modules and that the broker graph does not acquire runner dependencies.
@migration Current `kernel` and `restore` Vitest projects are transitional partitions of the future `teleport` domain. Preserve their tests and deterministic execution while source ownership is reorganized, then merge their selection into `test:teleport`; do not retain them as peer production domains or rename files mechanically before ownership is clear.
@migration Introduce the four domain directories and public surfaces before relying on directory-scoped lint. Avoid permanent package-script lists of individual flat source files. Apply the hard FP migration in dependency-ordered, zero-warning slices, enabling each completed domain gate as blocking rather than weakening the target configuration repository-wide.
@evolution Finer internal gates may be added later when a subdomain has a stable ownership seam, meaningful independent feedback, or distinct authority. Such a split nests beneath one of the four upper-level domains and does not change the four public artifacts by default.
@proof Configuration tests prove every source and test file is selected exactly once by its intended project; negative lint/compile fixtures prove enforcement is active; atomic suites prove owner behavior; seam suites prove composition; artifact checks prove emitted authority.
