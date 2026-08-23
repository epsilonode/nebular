---
id: broker-four-upper-level-domains
kind: contract
status: proposed
created: 2026-08-23
updated: 2026-08-23
roadmap: broker
refs:
  - roadmaps/broker.md#four-typescript-upstream-entrypoints
  - roadmaps/broker.md#hard-fp-tooling-and-fast-migration
  - roadmaps/broker.md#fp-and-tooling-conformance
hook: "read before creating or moving a production module, naming a domain, changing a public surface, adding a cross-domain import, splitting an internal package, or changing one of the four TypeScript entrypoints"
---

# Four Upper-Level Domains

@decision Treat the four shipped TypeScript modules as Nebular's four upper-level production domains for V1: `teleport`, `broker-client`, `recipe-runner`, and `broker`. Do not introduce finer top-level quality domains until implementation pressure demonstrates an independently useful ownership, authority, or verification boundary.

## Domain Matrix

| Domain | Stable entrypoint | Authority class | May consume |
| --- | --- | --- | --- |
| `teleport` | `teleport.ts` | portable and unprivileged | only its own public/internal modules and runtime-neutral external packages |
| `broker-client` | `broker-client.ts` | unprivileged client | the public `teleport` surface and its own modules |
| `recipe-runner` | `recipe-runner.ts` | unprivileged agentic runner | public `teleport` and `broker-client` surfaces and its own modules |
| `broker` | `broker.ts` | privileged Bun runtime | public `teleport` and `broker-client` surfaces plus broker-owned domain, runtime, and adapters |

@direction The production dependency graph is acyclic. `teleport` cannot import another upper-level domain. `broker-client` may depend on `teleport`. `recipe-runner` may depend on `teleport` and `broker-client`. `broker` may depend on `teleport` and `broker-client`, but never on `recipe-runner`; the runner is a caller, not broker authority or reusable broker implementation.
@surface Each domain owns one stable root entrypoint and one internal `public.ts` surface. Cross-domain imports use only those public surfaces. Deep sibling imports, reverse imports, adapter imports from portable/unprivileged code, and tooling imports from production source fail lint and compiler gates.
@ownership Portable capability contracts, codecs, canonical CAR graph handling, protection, signatures, restore planning, and transport ports begin inside `teleport`. Versioned IPC documents and unprivileged request/grant/lease client behavior begin inside `broker-client`. Recipe diagnostics, request construction, status/output observation, and result rendering begin inside `recipe-runner`. Policy, consent, keychain, journal, provider, receiver, secret delivery, and privileged interpretation begin inside `broker`.
@contracts A wire contract shared by client and broker is owned by the least-authoritative public domain that can define it safely, normally `broker-client`; the privileged broker implements that public contract. Neutral transfer or capability contracts reusable without the broker belong to `teleport`. Shared ownership is not represented by a fifth miscellaneous domain.
@internal Codec, protection, transport, restore, credential contracts, broker policy, state machines, receiver integration, and adapters may be internal folders with narrow lint profiles and colocated tests. They remain part of their owning upper-level domain until their public stability, authority separation, or independent verification cost warrants promotion.
@adapter Runtime adapters remain nested under the upper-level domain that owns their authority. A narrower adapter lint profile permits required mechanics but does not create another stable entrypoint, dependency direction, or package surface.
@support `configuration`, `seam`, `live`, test-kit, fixtures, and tooling are supporting verification classes, not production domains or public artifacts. Their code cannot become an indirect production dependency.
@evolution A later subdivision must preserve the four stable entrypoints and their authority graph, identify a concrete ownership seam, add a public surface only when required, migrate tests and gates atomically, and prove that no new runtime artifact or esm.sh path was accidentally created.
@proof Separate compiler projects, boundary lint, public-surface tests, seam suites, and bundle-graph inspection independently prove the same four-domain authority model. Passing only one mechanism is insufficient evidence.
