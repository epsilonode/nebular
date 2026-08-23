---
id: broker-recipe-parity-provenance-and-cutover
kind: proof
status: proposed
created: 2026-08-23
updated: 2026-08-23
roadmap: broker
refs:
  - roadmaps/broker.md#extract-and-localize-the-bake-recipe-kernel
  - roadmaps/broker.md#security-and-lifecycle-conformance
  - memories/teleport/broker/broker-bake-recipe-kernel-extraction.md
  - memories/teleport/broker/broker-local-recipe-integration-and-bundling.md
  - memories/teleport/broker/broker-pk-recipe-runner-adoption.md
hook: "read before declaring Bake recipe extraction complete, changing copied fixtures, evaluating recipe parity, removing Bake references, synchronizing later fixes, or assigning post-cutover ownership"
---

# Recipe Parity, Provenance, And Ownership Cutover

@goal Prove that the wx-owned recipe kernel preserves deliberately admitted Bake semantics while rejecting unproved or out-of-scope behavior, then end Bake's role as an upstream dependency. Parity is scoped semantic evidence, not a promise to clone every Bake feature indefinitely.

## Provenance record

@record Capture the Bake repository revision, extraction date, admitted source inventory, source-to-local module map, relevant dependency versions, copied fixture inventory, Bake proof test names, adaptations, exclusions, known gaps, and the local commit that completed the transplant.
@privacy Never copy `.env.local`, logs, generated reports, machine paths, tokens, secret recipes, user profile state, `node_modules`, or unreviewed operational artifacts. Sanitize only by selecting safe source fixtures; do not invent replacement secret data that obscures provenance.
@license Confirm source ownership/license constraints before code is distributed outside the shared private development context. Record the result with extraction provenance.

## Differential fixture contract

@corpus Use a small, reviewed corpus covering entrypoint/base and admitted receiver kinds, parameters/defaults/overrides, argv atom preservation, cwd/tool/env, port claims, probes, lifecycle/stop policy, completion/timeouts, deprecation/status, malformed XML, unknown fields, invalid enums, duplicate/conflicting declarations, and boundary-size cases.
@normalize Compare normalized semantic values and typed diagnostics, not incidental object key order, exception stacks, internal class names, absolute fixture paths, or renderer wording unless those are explicitly public contracts.
@positive Prove both implementations accept admitted recipes and produce equivalent recipe identity, source facts, resolved parameters, argv, nonsecret environment plan, ports/probes, lifecycle policy, receiver selection, completion policy, and redacted representation.
@negative Prove malformed, unavailable, ambiguous, shell-string, authority-expanding, unsupported receiver, invalid credential-slot, and unadmitted Bake-only fields fail with intentional typed outcomes. A difference is acceptable only when listed in the admission matrix with rationale and a local test.
@events Where Bake has implemented lifecycle fixtures, compare event/state reduction and output cursor behavior separately from backend effects. Do not manufacture parity for roadmap-only heartbeat or composition behavior.

## Local extension proof

@authority Prove the runner's early parse cannot authorize execution and the broker independently resolves Git/worktree, reads the recipe, validates revision/grant/credential slots, and builds the receiver plan.
@credentials Prove credential-slot metadata round-trips through the local schema while secret values never enter recipe XML, normalized diagnostic projections, fixtures, output, bundle metafiles, or persisted provenance.
@receivers Prove the same normalized recipe plan can be interpreted by the PM2 V1 receiver and by receiver conformance fakes. Future Python/uv proof consumes the same fixtures without adding backend-specific recipe syntax unless capability negotiation explicitly requires it.
@artifacts Prove both `recipe-runner.js` and `broker.js` decode the same corpus from the same source schema version while preserving their distinct authority boundaries.

## Dependency severance

@search Search source, tests, package metadata, lockfiles, tsconfigs, lint config, Mise tasks, build scripts, declarations, bundle metafiles, runtime artifacts, and documentation routes for `R:/Code/pk`, `R:\\Code\\pk`, `@bake/`, Bake-only aliases, and source-relative escapes. Only historical provenance in the linked memory is permitted after cutover.
@offline Rename, move, or otherwise make the Bake workspace unavailable in a controlled proof and run local install/check/test/bundle/consumer verification through Mise. No supported operation may attempt to resolve Bake.
@runtime Load each artifact from an isolated consumer fixture with no monorepo source aliases. Exercise recipe decode and redacted diagnostics without Bake files or dependencies present.

## Ownership after cutover

@owner wx-teleport-cartridge becomes authoritative for its recipe kernel, credential extensions, receiver algebra, broker integration, strict FP rules, security properties, build artifacts, and release compatibility. Bake remains authoritative for Bake product behavior and may evolve independently.
@exchange Exchange later generic fixes through an explicit issue/fixture/patch with provenance. Review the semantic change in both owners; do not introduce automatic mirroring, generated copying, Git submodules, workspace links, or an assumed upstream/downstream release cadence.
@drift Divergence is allowed when product contracts differ and is recorded as an intentional fixture/admission difference. Unexplained divergence in an admitted shared semantic is a defect to resolve, not a reason to restore dependency coupling.
@compat Do not promise that future arbitrary Bake recipes run in the broker. The broker supports its versioned admitted recipe contract; compatibility changes follow local schema/version and migration policy.

## Cutover gate

@gate Cut over only after the admission matrix is reviewed, all admitted modules and fixtures are local, differential positive/negative proofs pass, local authority extensions pass, dependency searches are clean, isolated artifact/consumer tests pass, and the offline-Bake build proof passes.
@evidence Record commands, fixture counts, Bake revision, local revision, intentional differences, build metafile results, and consumer proof. Only then mark the roadmap extraction work done with adjacent evidence.
@rollback Before cutover, rollback means removing the incomplete local transplant and continuing from the recorded Bake baseline. After cutover, rollback is a local source revision; never fall back at runtime to Bake or its compiled output.
