---
id: broker-bake-recipe-kernel-extraction
kind: strategy
status: proposed
created: 2026-08-23
updated: 2026-08-23
roadmap: broker
refs:
  - roadmaps/broker.md#adopt-and-harden-pk-ipc-and-lifecycle-semantics
  - roadmaps/broker.md#extract-and-localize-the-bake-recipe-kernel
  - memories/teleport/broker/broker-pk-recipe-runner-adoption.md
  - memories/teleport/broker/broker-process-receiver-algebra.md
  - memories/teleport/broker/broker-agent-objective-observability.md
hook: "read before continuing recipe work in Bake, extracting @bake/recipe, copying recipe source or fixtures, deciding which Bake behavior is admitted, or adding a Bake dependency"
---

# Bake Recipe Kernel Extraction

@decision Use `R:/Code/pk` (Bake) as the current implementation and proof ground for generic recipe behavior, then transplant only an explicitly admitted TypeScript kernel into wx-teleport-cartridge. Bake is provenance and temporary development origin, not a runtime, build-time, package, Git-submodule, link, or filesystem dependency of this workspace.
@current `R:/Code/pk/packages/recipe` is a private temporary façade whose entrypoint re-exports root `src/recipes/**`. Its README records unresolved coupling to Bake XML parsing, Zod schemas, built-in duration/registry behavior, evaluator logic, and temporal behavior. Do not mistake the façade for an extracted package boundary.
@why Continue generic work in Bake only while its existing tests, recipes, PM2 lifecycle implementation, and operational environment are the fastest place to prove behavior. Stop adding behavior there when it is broker-specific or when maintaining two implementations would create semantic drift.

## Admission boundary

@admit Admit only source behavior proved by focused Bake tests and required by the broker contract: versioned XML decoding, normalized typed recipe data, recipe id/kind/status/source where proven, parameter resolution, argv atoms, nonsecret environment planning, cwd/tool identity, port claims, probes, lifecycle and stop policy, completion/timeout fields, receiver selection, structured status/events, bounded output facts, and exact lifecycle operations.
@extend Define the credential-slot extension locally. It names required credentials and delivery modes without containing values. Git repository binding, grant identity, consent, lease, CAR, keychain, provider renewal, secret delivery, and privileged authority remain wx-owned broker concerns even if Bake later gains superficially similar features.
@exclude Exclude Bake Hono routes, UI/facade code, temporary workspace aliases, secret-direct hashing/vault behavior, resource/fixture/corpus/artifact composition, recipe-index lookup, `BAKE_RECIPE_ID` harness coupling, asset resolution, built-in snack registry entries not independently admitted, provider logic, and roadmap-only claims.
@backend Extract receiver-neutral contracts and pure state/status logic. PM2 commands, Bun process calls, clocks, filesystem, Git, probes, logs, journals, prompts, and secrets remain adapters behind ports. Do not copy a general mutable supervisor object into the domain.
@argv Preserve executable and argument atoms through parsing and resolution. Never regress to shell command strings merely because Bake accepts or renders them in a particular CLI path.

## Extraction inventory

@matrix Before copying, create a reviewed admission matrix with one row per candidate module or behavior: Bake source path, public symbols, dependency closure, proof tests/fixtures, broker requirement, disposition (`admit`, `adapt`, `reimplement`, `exclude`, or `defer`), local target module, and known semantic differences.
@closure Trace each admitted module through its actual imports. A source file is not portable merely because its primary exports look generic. Split coupled schemas, built-ins, effectful loading, and runtime adapters before or during transplant rather than importing Bake root modules to satisfy the closure.
@fixtures Select representative real Bake XML recipes and minimal focused boundary fixtures. Copy only fixtures whose provenance and expected interpretation are explicit; do not copy secrets, local paths, machine-specific state, generated reports, logs, or unreviewed recipes.
@baseline Record the Bake revision used for the transplant, admitted file hashes or inventory, relevant test names, package/runtime versions, and intentionally excluded behavior. This is provenance, not ongoing version authority.

## Development rule while still in Bake

@generic A change may bake in place when it is independently useful to Bake, receiver-neutral or Bake-owned, covered by Bake tests, and inside the planned admitted kernel. Prefer small pure seams that later transplant without importing Bake infrastructure.
@local A change begins directly in wx-teleport-cartridge when it concerns credential requirements, Git-scoped broker authority, grants, consent, OS keychain access, secret leases, encrypted CAR transfer, broker IPC, receiver secret delivery, or strict package/authority boundaries unique to this project.
@dual Avoid implementing the same unfinished feature concurrently in both workspaces. Complete and prove the generic Bake behavior, freeze its fixture, transplant once, and then apply local adaptations. If a local need changes the generic contract before cutover, update the admission matrix rather than silently editing both copies.
@bugs A generic defect discovered after transplant may be fixed in either owner first, but exchange the minimal failing fixture and semantic patch deliberately. Never restore a hidden runtime dependency or automatic source synchronization merely to reduce duplicate maintenance.

## Transplant mechanics

@source Copy/adapt TypeScript source modules, public types, and focused fixtures. Do not compile Bake into a single file for import, copy Bake `dist`, consume `@bake/recipe`, point TypeScript paths at `R:/Code/pk`, use `link:` to Bake, or require Bake's lockfile/build before local verification.
@history Preserve source provenance in the extraction memory or commit narrative, not in runtime metadata. After extraction, local modules use wx naming, imports, domain primitives, errors, ports, lint rules, and package ownership.
@types Replace broad Bake structural strings with the broker roadmap's branded primitives and ADTs at the boundary. Parse unknown XML into validated domain data; do not cast Bake values into authority-bearing local types.
@fp Rework exception, nullable, mutation, ambient-effect, and mixed Promise behavior at the transplant boundary according to the hard FP roadmap. Preserve known semantics with fixtures before refactoring so improved composition does not accidentally change recipe interpretation.
@done Extraction is complete only when admitted behavior is locally implemented and tested, all Bake imports and path references are absent from source/build/declarations, and Bake can be unavailable without affecting install, check, test, bundle, or runtime behavior.

## Sequence

@sequence First freeze local broker recipe/domain requirements. Second audit Bake source and tests into the admission matrix. Third harden or isolate only the generic seams still best proved in Bake. Fourth capture fixtures and baseline provenance. Fifth transplant the smallest pure dependency closure. Sixth apply local branded types, Result/effect ports, credential slots, and receiver algebra. Seventh prove parity and sever all Bake dependencies. Eighth continue independent local development.
@reject Reject the extraction approach if it requires copying most of Bake, retaining root aliases, importing compiled output, carrying Hono/UI/provider code, accepting unproved roadmap features, or weakening broker authority to match a convenient Bake API.
