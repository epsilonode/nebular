---
id: teleport-js-portable-release-assurance
kind: contract
status: proposed
created: 2026-09-05
updated: 2026-09-05
roadmap: car-teleport
refs:
  - roadmaps/car-teleport.md#teleportjs-browser-client-and-portable-cartridge-delivery
  - roadmaps/broker.md#four-artifact-distribution-conformance
  - memories/teleport/broker/broker-four-artifact-type-boundaries.md
  - memories/teleport/contracts/browser-teleport-cdn-consumer-conformance.md
hook: "read before adding a teleport.js build, package, publish, CDN, browser import-map, or release-conformance check"
---

# Teleport.js Portable Release Assurance

@purpose Broker work provides the release-assurance pattern for the browser client, not browser runtime code. Apply only the portable subset to `teleport.js`; do not make browser delivery depend on the paused broker, recipe-runner, PM2, Windows Job, FFI, IPC, keychain, grant, or credential-transfer implementation.
@reuse Reuse the established evidence shapes: separate compiler/import boundary; exact runtime artifact inventory; forbidden-import and unexpected-path scans; declaration validation; immutable Git-ref coherence; browser golden-vector execution; and release-manifest digests. Packed isolated-consumer install remains useful for the separately shippable Bun artifacts and any later package release, but is not a browser-release prerequisite.
@portable_gate Build `dist/teleport.js` and `dist/types/teleport.d.ts` as an independently releasable portable root. Prove its complete runtime graph names no Bun, Node, process, filesystem, child-process, broker, recipe-runner, keychain, PM2, IPC, framework, store, workspace alias, or local TypeScript-source dependency. The package may also contain independently shippable compiled Bun artifacts, but their runtime/E2E gates are not inputs to this gate.
@git_release Commit the verified `dist/teleport.js` and `dist/types/teleport.d.ts` to the immutable public GitHub release ref with their matching source. The repository may retain TypeScript source for audit and development, but production browsers load only the committed compiled artifact. A later package tarball may exclude sources and reuse the isolated-consumer proof; it is not required for the GitHub artifact release.
@cdn Prove pinned `https://esm.sh/gh/epsilonode/nebular@<immutable-commit>/dist/teleport.js` delivery in a current evergreen Microsoft Edge browser using an import map. Verify same-commit module closure, emitted consumer output/source maps contain no local package bytes or source fallback, and cache/ref drift fails conformance.
@informative Existing canonical-codec, CAR integrity, protection, plan, rollback, redaction, and real Edge golden-vector proofs remain evidence for portable behavior. Broker authority, secret-transfer admission, lease, consent, Result/Effect, recipe, receiver, process-observation, containment, and native-FFI proofs may inform negative-test design but do not establish browser delivery and must not expand the portable graph.
@release Record the source commit, portable artifact/declaration digests, esm.sh URL, Edge baseline, module-graph result, and consumer fixture results. Package version and tarball digest apply only to a later optional registry release. A GitHub/CDN HTTP success alone is insufficient.
