---
id: browser-teleport-import-export-contract
kind: contract
status: proposed
created: 2026-09-05
updated: 2026-09-05
roadmap: car-teleport
refs:
  - roadmaps/car-teleport.md#teleportjs-browser-client-and-portable-cartridge-delivery
  - memories/teleport/contracts/teleport-layer-6-application-adapters.md
  - memories/teleport/contracts/teleport-layer-5-restore-orchestration.md
  - memories/teleport/contracts/portable-car-security.md
hook: "read before adding browser import/export UI, adapting NanoStore or Fireproof documents to a cartridge, changing browser package imports, or adding browser runtime dependencies"
---

# Browser Teleport Import And Export Contract

@consumer Browser applications are the ultimate consumers of Teleport cartridges. The portable root `teleport.ts`/compiled `teleport.js` is their only shared runtime surface; Bun, Node, the credential broker, recipe execution, keychain access, PM2, and process APIs are outside this flow.
@ownership Each application browser profile owns its own NanoStore, Fireproof, and framework state. It projects selected documents through its application capability codecs and owns picker/download, user confirmation, progress UI, store mutation, and restore effects. The neutral package owns no Svelte, React, NanoStore, Fireproof, DOM component, or application-store implementation.
@export The application collects selected current browser documents, encodes its declared capability instances, assembles and optionally protects a bounded CAR, then offers browser-native download or application-selected handoff. Export reads state but does not mutate it and never serializes framework stores, functions, DOM objects, ambient browser state, or undeclared application data.
@import The application receives a user-selected CAR, calls parse/verify/unlock and inert restore-plan projection, presents its own review/confirmation UI, then executes the authorized application restore adapter with verification, rollback, and recovery. Decode/plan creation never mutates the browser store; unknown optional capabilities remain opaque for retention/re-export and unknown required capabilities block restoration.
@transfer A source clean browser profile transfers only declared cartridge capabilities to a distinct clean destination browser profile. NanoStore and Fireproof documents are source material, not a shared runtime database; the destination reconstructs only its application-owned supported state through the Teleport contract.
@runtime Portable browser code uses only explicitly admitted web-platform APIs and pinned portable dependencies. It cannot name Bun, Node, `process`, filesystem, child-process, keychain, broker, recipe-runner, PM2, inherited IPC, or application framework/store modules. No browser bridge, localhost service, or privileged helper participates.
@protection Protection, key-entry, browser device keys, and encrypted Fireproof raw capability handling follow the existing portable protection contracts. Plaintext, credentials, key material, and sensitive documents never enter URL, console, unbounded diagnostics, source maps, unrelated browser storage, or exported public metadata.
@baseline Support current evergreen Microsoft Edge releases, using only standard browser ESM, WebCrypto, Streams, IndexedDB, Blob, and file-picker/download APIs. Browser support never relies on Bun/Node polyfills, a local service, or a privileged bridge.
@sequence The Supa-owned Researcher route at `wx-shells` `/agent/researcher` is the compact initial proof and interaction reference: browser file selection, optional passphrase protection, cancellation/status, and profile download/import against Fireproof documents. `wx-ui-melt` is the primary merge target and follows with the expanded selected multi-pane workspace-capability transfer. The sample does not move application adapter ownership into the neutral package.
@proof Prove export in one clean browser profile and import in another using representative NanoStore and Fireproof adapters. Exercise the compact Researcher interaction first, then prove wx-ui-melt's expanded workspace transfer. Cover plain and protected CARs, wrong key, malformed/tampered/oversized input, unknown optional/required capability behavior, cancellation, interrupted restore/recovery, rollback, and marker-based non-disclosure.
@forbid Do not reintroduce a browser broker client, a Bun shim/polyfill, a process bridge, a shared application adapter, a linked workspace source import, or a framework-specific UI into the portable package to make browser transfer convenient.
