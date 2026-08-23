---
id: teleport-colocated-domain-seam-vitest
kind: contract
status: active
created: 2026-08-23
updated: 2026-08-23
roadmap: car-teleport
refs:
  - roadmaps/car-teleport.md#codec-conformance-and-adversarial-matrix
  - roadmaps/broker.md#hard-fp-tooling-and-fast-migration
  - roadmaps/broker.md#fp-and-tooling-conformance
hook: "read before adding, moving, naming, grouping, or running tests; defining a domain boundary; creating seam or live proof; or changing Vitest projects"
---

# Colocated Domain And Seam Vitest Contract

@origin Adopt the render-web-mcp topology: tests live beside their owning source, named Vitest projects are architectural gates, and dedicated seam suites prove cross-domain composition. Bake supplies the conservative serial execution helper.
@atomic Name ordinary owner-focused tests `*.test.ts` beside the implementation. They may use private owner modules when characterizing local laws but must not quietly exercise unrelated domains.
@seam Name cross-domain contracts `*.seam.test.ts`. A seam names at least two participating boundaries, composes through public surfaces, injects effect ports, and asserts authority/data/error/cleanup behavior that no owner can prove alone.
@live Name environment-dependent proof `*.live.test.ts`. Live tests are excluded from default verification and run only through the explicit `live` project with declared prerequisites and exact cleanup.
@projects Current default projects are `configuration`, `kernel`, `restore`, and `seam`; `live` is opt-in. `kernel` and `restore` are transitional partitions of the future `teleport` upper-level domain. The V1 production project target is `teleport`, `broker-client`, `recipe-runner`, and `broker`, with `configuration` and `seam` supporting them and `live` remaining explicit.
@execution Every project uses isolated fork workers, one worker, no file parallelism, one-test concurrency, ordered hooks/setup, and stable group ordering. Configuration tests prove this policy itself.
@selection Atomic projects include exact owned files and exclude seam/live suffixes by construction. The seam project is the only default owner of `*.seam.test.ts`; no test executes twice.
@reports Default verification writes human output plus ignored JUnit and JSON reports under `reports/`. Coverage uses V8, includes source, excludes tests, and is an explicit task rather than a substitute for seam design.
@current Existing tests moved from `tests/` to `src/cartridge.test.ts` and `src/restore-executor.test.ts`. Protected codec-to-restore and verified-cartridge-to-cloud-publication contracts now have dedicated seam suites.
@migration `src/cartridge.test.ts` remains a broad initial kernel suite. Split its describe blocks beside narrower module/domain owners as those source boundaries are introduced; do not preserve a permanent monolithic `core.test.ts` bucket.
@entrypoints Each public `teleport.ts`, `broker-client.ts`, `recipe-runner.ts`, and `broker.ts` target eventually needs an atomic public-surface test and at least one seam proving its authority boundary with the adjacent layer.
@quality The four-domain lint/typecheck/test/check composition and migration rules live in `broker-four-domain-atomic-quality-harness.md`; this card remains authoritative for file naming, collocation, conservative Vitest execution, and seam/live classification.
@broker Broker seams must cover client-to-broker IPC, recipe-to-receiver, grant-to-secret delivery, PM2 observation/reconciliation, encrypted CAR-to-keychain transaction, and cancellation/cleanup without using a live receiver unless explicitly suffixed `.live.test.ts`.
@proof Default `mise run verify` must enumerate named project results and remain deterministic. `mise run test:seam` proves only seams; `mise run test:live` is never part of the default gate.
