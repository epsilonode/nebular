---
id: broker-browser-client-public-surface-and-conformance
kind: strategy
status: proposed
created: 2026-09-05
updated: 2026-09-05
roadmap: broker
refs:
  - roadmaps/broker.md#add-browser-broker-client-and-authenticated-bridge
  - memories/teleport/broker/broker-browser-client-transport-and-trust.md
  - memories/teleport/broker/broker-four-artifact-type-boundaries.md
  - memories/teleport/broker/broker-epsilonode-nebular-esm-distribution.md
hook: "read before adding a browser entrypoint/export/build, changing the four-artifact contract, using esm.sh for browser delivery, or writing browser client conformance"
---

# Browser Client Public Surface And Conformance

@shape Add a separately named browser entrypoint and package subpath rather than changing `broker-client.ts` semantics. The existing `broker-client` remains Bun/inherited-IPC-compatible; browser code must not import or conditionally suppress its Bun bootstrap modules.
@release A browser entrypoint deliberately changes the current four-entrypoint/artifact contract. Before implementation, update the public-surface decision, package exports, declarations, build inventory, installed-consumer fixture, immutable release manifest, and semantic versioning/release notes together. No source file becomes public only because esm.sh can transform it.
@build Compile the browser entrypoint with the browser target in an independently auditable artifact. The browser compiler project and import graph reject Bun globals, `bun:` and `node:` modules, `process`, keychain, filesystem, child-process, receiver, recipe-runner, privileged broker, bootstrap-environment, and secret-delivery imports. Do not rely on dead-code elimination or runtime feature checks to hide an illegal edge.
@api Export only typed request/event codecs, browser transport interfaces, browser session state, and redacted outcome projection. Keep concrete bridge transport and browser-framework adapters behind narrow ports; do not force Svelte, React, Fireproof, or application-store ownership into this framework-neutral package.
@cdn esm.sh can transform and deliver a pinned public browser-safe entrypoint from an immutable Git ref or released package version. It does not publish the package, establish browser compatibility, bind an origin, authenticate a local broker, or replace an installed-package/browser proof. Production imports use one immutable released ref/version and never a floating branch.
@sequence First approve the transport-and-trust contract. Second add browser-only compiler/import gates and negative fixtures. Third define public intents/redacted events and fake transport state-machine tests. Fourth implement the selected broker bridge and pairing. Fifth build/package the new artifact and declarations. Sixth run real-browser security/lifecycle conformance plus isolated package and pinned-CDN tests. Seventh migrate a first consumer only after that complete boundary is green.
@proof Browser conformance proves artifact loading without Bun/Node/polyfills; no privileged graph edge; pairing/origin/replay/lifetime rejection; request correlation and bounded cancellation; redacted diagnostics; absence of secret canaries from browser-observable surfaces; installed package declaration/runtime resolution; and same-ref/version CDN closure. A passing TypeScript build, Node import, or esm.sh HTTP 200 is not browser bridge proof.
@done The browser client is ready only when its transport is approved and live-proved, the package exposes a deliberate browser subpath/artifact/declaration, a real browser completes an authorized nonsecret flow and rejects hostile cases, the broker retains sole authority and secret custody, and release/CDN consumption is immutable and reproducible.
