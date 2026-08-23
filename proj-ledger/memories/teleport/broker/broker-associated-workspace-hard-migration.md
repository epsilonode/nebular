---
id: broker-associated-workspace-hard-migration
kind: strategy
status: proposed
created: 2026-08-23
updated: 2026-08-23
roadmap: broker
refs:
  - roadmaps/broker.md#hard-fp-tooling-and-fast-migration
  - roadmaps/broker.md#cross-workspace-developer-workflow
hook: "read before migrating lint, TypeScript strictness, FP packages, Result handling, or architecture enforcement in any associated consumer or distribution workspace"
---

# Associated Workspace Hard Migration

@constraint This card is self-contained. Other projects may be mentioned as consumers or prior evidence, but implementation must not import their lint configs, copy undocumented rules by reference, or depend on their source remaining available.
@common Every workspace pins its own compatible lint dependencies, uses Mise as the command entry, enables type-aware parser services, exposes lint/typecheck/test/verify tasks, and implements the complete profiles defined by this roadmap rather than pointing to an external repository as authority.
@teleport Apply strict pure rules to protocol, codec, canonicalization, graph, policy, restore planning, and state machines. Classify crypto, CAR streaming, browser key storage, S3 streaming, broker adapters, tests, and build scripts under named boundary profiles. Split ambient compiler types by artifact before adding broker code.
@jtwc Keep neverthrow, ts-pattern, and Zod at exact compatible versions; add Remeda only where transformation pipelines justify it. Add type-aware ESLint to tropical domain/core, UI TypeScript, and shared contracts; keep Deno native format/lint/check/test for the API. Add exact optional, unchecked index, unknown catch, implicit return, switch fallthrough, and declaration strictness. Ensure UI and Deno code are independently checked rather than relying on a core-only root tsconfig.
@jtwc Convert mutable result-partition helpers to readonly inputs and immutable outputs, enforce exhaustive weather/product/HUD state machines, and isolate fetch, capture filesystem, maps, timers, and Deno server effects behind adapters. Svelte runtime files receive only the UI exception profile.
@melt Repair type-aware ESLint before evaluating violations; replace deprecated readonly rules; upgrade to the pinned compatible functional/boundary toolchain and Zod 4. Add neverthrow for workspace restore, credential requests, and asynchronous import failures. Apply pure rules to models, selectors, planners, codecs, and restore policy; keep Svelte, MapLibre, Fireproof, workers, byte parsing, and browser-test mechanics in narrow adapters.
@supa_ui Repair type-aware ESLint and replace the minimal local Result with the pinned neverthrow façade in one bounded migration. Apply pure rules to provider policy, alert projection, CAR semantics, credential requirements, and restore plans. Limit exemptions to Svelte reactivity, React/vendor components, streaming agent sessions, Fireproof/browser storage, and development child-process adapters; each exception retains typed outcomes and immutable boundaries.
@supa_deno Retain Deno format/lint/check/test as mandatory gates and strengthen domain compiler settings. Use pure immutable domain functions and closed result unions; add neverthrow only if asynchronous service composition would otherwise duplicate branching. Keep Supabase client, webhook, filesystem/corpus, and Edge runtime effects in adapters. Do not pull browser or Bun broker dependencies into the Edge Function.
@shells Add base typed or checked-JavaScript lint, promise safety, exact route-manifest decoding, and ownership/import enforcement. Treat release assembly, filesystem copying, process spawning, DOM launcher generation, and Wrangler deployment as tooling adapters; do not impose no-loop/no-let/no-try there. Add no FP runtime dependency unless a real typed pipeline replaces duplicated validation or failure glue.
@render_upstream If the Researcher upstream is migrated, preserve strict type-aware FP and boundary rules, keep neverthrow as the ordinary result layer, and confine Effect to scheduler/resource-lifecycle modules. This roadmap describes the required policy fully; that workspace is not a configuration dependency.
@order Migrate Teleport/broker first, then direct CAR consumers, then Deno/application integrations, then distribution/upstream tooling. A consumer advances only after its own lint, typecheck, tests, build, and focused integration proof are green.
@proof Each workspace records zero-warning lint, strict compilation, no unclassified disables, exact dependency inventory, typed expected-failure paths, adapter exception inventory, and its existing domain-specific integration proof.

