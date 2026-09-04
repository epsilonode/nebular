# CAR Teleport And Capability Cartridge Roadmap

@roadmap car-teleport
@updated 2026-09-05
@meta name=roadmap-format content="../format-guidance.md"
@meta name=memory-format content="../making-memories.md"
@meta name=roadmap-status content="active"
@meta name=memory-root content="../memories/teleport/"
@meta name=owner-project content="R:/Code/web/wx-teleport-cartridge"
@meta name=consumer-projects content="R:/Code/web/jtwc; R:/Code/web/wx-ui-melt; R:/Code/web/supa-mail-hook/supa-svelte"
@meta name=distribution-project content="R:/Code/web/wx-shells"
@note This roadmap is the canonical generic Teleport implementation target. Consumer roadmaps own only application codecs, effect adapters, deployment bindings, and integration proof.

## @tier9 active Teleport Cartridge development target

### @decision @accepted seven-layer Teleport architecture
@memory ../memories/teleport/contracts/teleport-layer-1-capability-contracts.md
@memory ../memories/teleport/contracts/teleport-layer-2-codec-kernel.md
@memory ../memories/teleport/contracts/teleport-layer-3-protection-profiles.md
@memory ../memories/teleport/contracts/teleport-layer-4-cartridge-graph.md
@memory ../memories/teleport/contracts/teleport-layer-5-restore-orchestration.md
@memory ../memories/teleport/contracts/teleport-layer-6-application-adapters.md
@memory ../memories/teleport/contracts/teleport-layer-7-transport-profiles.md
@memory ../../../jtwc/proj-ledger/memories/tropical/contracts/manual-dns-adapter-seam.md
@accept Layer 1 defines independently versioned capability contracts and instance identity; Layer 2 owns pure canonical codecs, migrations, registry dispatch, and conformance; Layer 3 projects plain, protected, selective, and future private-inventory protection profiles over those canonical bytes.
@accept Layer 4 assembles and verifies the generic cartridge graph; Layer 5 composes inert decoded values into authorized transactional restore plans; Layer 6 owns JTWC, wx-ui-melt, provider, Fireproof, asset, and exact-replay application adapters; Layer 7 transports the same graph as a portable CAR, cloud blocks, or streams.
@accept Encrypted and unencrypted export share one semantic capability system and one cartridge contract. File and S3 delivery share the same canonical blocks and differ only in packing, retrieval, and operational controls.
@accept The seven layers are ownership and verification seams, not seven serialization wrappers: semantic values are canonically encoded once, protection optionally replaces stored capability bytes, the graph references those blocks, and transports move the verified graph without interpreting or re-encoding it.
@accept Fireproof is an application-owned native snapshot/store adapter at Layer 6; its exact encrypted chunks may be retained as raw capabilities protected by Layer 3. Fireproof is not the universal codec, cartridge graph, or cloud transport. S3/object storage is a Layer 7 port over opaque verified blocks and mutable publication heads.
@accept The current provider CAR is retained as a bounded compatibility fixture and native-recovery proof; it does not define the universal schema, codec, security, restore, or transport seams.

### @work @done execute implementation in dependency order
@memory ../memories/teleport/contracts/teleport-layer-1-capability-contracts.md
@memory ../memories/teleport/contracts/teleport-layer-2-codec-kernel.md
@memory ../memories/teleport/contracts/teleport-layer-3-protection-profiles.md
@memory ../memories/teleport/contracts/teleport-layer-4-cartridge-graph.md
@memory ../memories/teleport/contracts/teleport-layer-5-restore-orchestration.md
@memory ../memories/teleport/contracts/teleport-layer-6-application-adapters.md
@memory ../memories/teleport/contracts/teleport-layer-7-transport-profiles.md
@accept Phase 1 defines shared capability types, instance identity, codec interfaces, closed diagnostics, and limit types without application dependencies.
@accept Phase 2 lands canonical DAG-CBOR encoding and the cross-runtime codec conformance harness together so every later capability begins with deterministic byte/CID proof.
@accept Phase 3 lands plain cartridge assembly, CAR parsing, root/block verification, and decode inventory before encryption, application effects, or cloud transport.
@accept Phase 4 proves unknown optional retention, unknown required blocking, dependency inventory, and byte-exact re-export.
@accept Phase 5 lands exact registry dispatch and pure historical-to-current migration chains with version-confusion and migration-gap fixtures.
@accept Phase 6 lands restore-plan projection, cross-capability composition, authorization boundaries, isolated staging, receipts, verification, rollback, and cleanup.
@accept Phase 7 adapts JTWC `CartridgeDocument` v2 into `wx.hud.intent@2` and proves latest-scene rebase without admitting exact runtime state.
@accept Phase 8 lands `wx.workspace.layout`, multiple capability-instance references, and a clean-profile wx-ui-melt workspace containing multiple isolated JTWC HUD instances.
@accept Phase 9 adds plain, protected, and selective capability profiles, authenticated associated-data binding, cartridge key envelopes, and wrong-key/redaction proof without changing canonical codec bytes.
@accept Phase 10 adds separately labeled JTWC exact replay, semantic provider settings, assets, and exact-pinned Fireproof native snapshot adapters only after semantic workspace restoration passes.
@accept Phase 11 adds bounded streaming, portable-file CAR, and cloud/S3 block transport with immutable child-first publication, conditional mutable heads, checksums, tenant isolation, and reachability-based retention.
@accept Phase 12 adds optional signatures, recipient encryption, device/account key providers, private inventory, and advanced key rotation after the base protected round trip is stable.
@closed 2026-09-04 evidence="`mise run verify` passes the complete neutral package gate: 814 tests in 96 files, strict lint/type/policy checks, the four artifact build, declaration validation, artifact inventory, and an isolated installed-tarball consumer."
@evidence 2026-08-22 phases 1-5 have landed in `R:/Code/web/wx-teleport-cartridge`: closed capability types, canonical DAG-CBOR/raw codecs, exact registry dispatch, explicit migration-chain validation, reusable conformance, real CAR graph verification, and opaque required/optional behavior pass the neutral suite.
@evidence 2026-08-22 phase 6 neutral planning/execution now covers authorization, all-step staging, commit receipts, verification, reverse rollback, and cleanup; wx-ui-melt uses it for safe workspace import rather than replacing state immediately after decode.
@evidence 2026-08-22 phases 7-10 reference codecs now exist for JTWC intent, JTWC exact replay, wx workspace layout, semantic provider settings, exact-pinned Fireproof snapshots, and raw asset blobs with linked metadata; focused cross-project suites and static checks pass.
@evidence 2026-08-22 phases 9/12 protection now includes passphrase, selective, recipient, multi-recipient rotation, provider-key ports, Ed25519 graph signatures, and encrypted private inventory with wrong-key proof.
@evidence 2026-08-22 phase 11 transport now includes bounded stream ingestion, child-first immutable cloud publication, tenant-scoped conditional S3 mapping, multipart delegation, explicit checksums, and retained-root reachability planning. `R:/Code/web/wx-shells` also completes its four-route release build and verifies executable route provenance and staged assets.
@evidence 2026-08-22 the locked v1 golden vector now recomputes the same capability CID, cartridge root, full-CAR SHA-256, and byte length in Vitest and real headless Edge. JTWC executes latest-rebase and exact-replay through the neutral transaction port; persistent Fireproof replace and merge reopen real native ciphertext in isolated storage, verify, commit, and roll back.
@evidence 2026-08-22 `wx.fireproof.store@2` now protects only its sensitive linked descriptor while native ciphertext chunks and the already-wrapped keybag remain independent byte-identical raw capabilities. Incremental CAR sinks honor backpressure and typed failures; tenant-scoped S3 reads validate CIDs/ranges and enforce declared/bounded stream lengths.
@evidence 2026-08-22 wx-ui-melt's production build passes an actual View Engine file-input import in a fresh Edge profile after extraction of the application restore adapter; a genuine CAR restores two panes, activates the intended pane through the neutral executor, and visibly retains an unsupported optional pane capability.
@evidence 2026-08-22 wx-ui-melt now owns an explicit application restore adapter that stages the complete workspace topology, commits an exact clone, verifies topology plus an optional host predicate, and restores the prior complete workspace when post-commit host verification is forced to fail. Its focused gate passes 70 tests and Svelte check with zero findings.
@evidence 2026-08-22 clean-profile Edge acceptance now forces the production renderer to reject the committed imported topology, observes the visible typed failure, proves the exact prior pane and active-pane topology is restored, removes the external interference, and imports the same CAR successfully.
@evidence 2026-08-22 wx-ui-melt persists a bounded prior-topology recovery journal before application commit, consumes it on every normal terminal path, and restores then removes it on startup. Clean-profile Edge reloads the page immediately after imported panes render but before host verification and proves restart recovery plus journal consumption before exercising forced rollback and successful import.
@evidence 2026-08-23 the neutral package includes an optional browser device recipient adapter using non-extractable RSA-OAEP keys persisted by IndexedDB structured clone. Real Edge generates, reopens, and uses the device key to unlock a protected cartridge, asserts the private key remains non-extractable, then deletes the conformance key.
@evidence 2026-08-23 account, KMS, and hardware authorities have an operation-mediated unwrap provider that receives only provider-local key id plus wrapped data-key bytes and never returns or requires private-key material. Neutral conformance proves a protected cartridge unlocks through this seam; selecting and binding a particular external authority is deployment integration, not a missing codec capability.
@evidence 2026-08-23 persistent Fireproof replacement uses an application-owned prepare/activate/verify/finalize journal. A Mise-managed subprocess acceptance terminates a separate Bun runtime after journal and incoming active-pointer flush, then proves a fresh runtime reopens the prior encrypted native store, excludes the unverified incoming document, consumes the journal, and removes the interrupted staging directory.
@evidence 2026-08-23 JTWC latest-rebase is proven at the application-owned injected scene-provider boundary. Public Briefer/HUD/Teleport consumers use `https://tropicals.wxunlimited.com/api/v1`; direct `.mil` provider reachability, Tailscale DNS behavior, and the dated opt-in live-upstream test belong to tropical capture transport and are not Teleport acceptance gates.
@evidence 2026-08-23 neutral graph integrity now rejects malformed capability/instance identities, duplicate dependencies, missing or mismatched required dependency targets, and hard-decode/restore-order cycles during assembly and verification. Creation verifies caller-supplied capability, envelope, and signature bytes against codec/hash/CID before emitting a CAR. Canonical code-unit ordering covers capabilities, dependencies, envelopes, signatures, roots, and full CAR bytes. Codec validation rejects unprojected Date/Map/Set/class objects, cycles, and aliases instead of silently changing their meaning. `mise run verify` passes 38 tests plus strict typecheck.
@evidence 2026-08-23 Bun consumers now resolve the neutral worktree through the Mise-registered `link:@wx/teleport-cartridge` package instead of copying `.git` and stale sources through `file:`. JTWC strict typecheck plus 6 focused Teleport tests pass; wx-ui-melt Svelte check plus 7 workspace CAR/restore tests pass; Supa Astro check plus 12 provider/Fireproof/restore tests pass. The legacy Fireproof v1 adapter now explicitly clones cross-realm byte fields rather than relying on jsdom-sensitive `structuredClone` behavior.
@proof_gap The generic seven-layer implementation and reference adapters are landed. Product integration still needs the durable Fireproof target bound in each production Supa host that enables native replacement, plus one combined clean-profile browser run rendering multiple actual JTWC HUD intent instances through an injected or public tropicals scene provider. A selected real account/KMS authority and real S3/R2 race, interruption, authorization, lifecycle, and recovery matrices are optional deployment conformance gates, not prerequisites for the generic cartridge implementation.

### @decision @accepted generic capability-addressed CAR container
@memory ../memories/teleport/contracts/teleport-cartridge-container.md
@memory ../memories/teleport/contracts/teleport-layer-4-cartridge-graph.md
@accept Replace application-specific root manifests with one `wx-teleport-cartridge` manifest whose entries identify versioned capability blocks by CID, codec, requirement, and restore mode.
@accept Keep container integrity, decode budgets, encryption envelopes, migration dispatch, typed diagnostics, and restore-plan primitives independent of Svelte, React, Fireproof, MapLibre, Nanostores, and application runtime code.
@accept Preserve unknown optional capability blocks for relay and re-export; reject restoration when an unknown required capability is present.

### @decision @accepted semantic teleport and exact replay separation
@memory ../memories/teleport/contracts/teleport-capability-contract.md
@memory ../memories/teleport/contracts/teleport-layer-1-capability-contracts.md
@memory ../memories/teleport/contracts/teleport-layer-6-application-adapters.md
@memory ../../../jtwc/proj-ledger/memories/tropical/contracts/hud-cartridge-rebase-contract-v2.md
@accept JTWC owns `wx.hud.intent@2` for canonical latest-scene rebase and a separately labeled `wx.hud.exact-replay` capability for captured runtime/debug state.
@accept Portable intent excludes stale provider projections, render frames, DOM/map state, request history, transactions, and derived read models.
@accept Capability codecs are runtime-neutral, exact-versioned, pure at decode/migration boundaries, and newly emitted documents always use the current canonical schema.

### @work @done define the capability codec kernel and registry
@memory ../memories/teleport/contracts/teleport-capability-contract.md
@memory ../memories/teleport/contracts/teleport-codec-kernel-and-registry.md
@memory ../memories/teleport/contracts/teleport-layer-2-codec-kernel.md
@accept Define a minimal `TeleportCapabilityCodec<TCurrent>` contract with stable capability id, current schema version, accepted legacy versions, security class, dependency declaration, decode budgets, canonical encode, strict decode, pure migration, and restore-plan projection.
@accept Registry lookup uses exact capability id plus schema version and returns typed `supported`, `unsupported-optional`, `unsupported-required`, `dependency-missing`, or `policy-rejected` outcomes without importing application runtime modules.
@accept Registration rejects duplicate codec ownership, overlapping migration ownership, invalid capability ids, and incomplete migration paths. Cartridge assembly and verification reject invalid dependency identities, missing or mismatched required targets, duplicate dependency declarations, and hard-decode/restore-order cycles because dependencies are value-derived per capability instance.
@accept Codec execution receives bounded bytes and an immutable capability context only; it has no ambient fetch, filesystem, browser storage, DOM, application store, credential, or arbitrary clock access.
@accept The neutral kernel exposes opaque capability retention and restore planning but never executes application effects.
@evidence 2026-09-04 The passing cartridge and codec suites exercise exact registry dispatch, migration-chain validation, bounded decode, opaque retention, dependency validation, and inert decode/restore planning.

### @work @done specify canonical capability encoding
@memory ../memories/teleport/contracts/teleport-canonical-capability-encoding.md
@memory ../memories/teleport/contracts/teleport-layer-2-codec-kernel.md
@accept Use canonical DAG-CBOR for structured capability blocks and raw codec only for byte assets, encrypted envelopes, or foreign store chunks whose internal bytes must remain exact.
@accept Define normalization for map-key ordering, optional-field omission, defaults, integer versus floating-point values, non-finite number rejection, Unicode strings, timestamps, sets, arrays, identifiers, and CID links so equivalent semantic values produce identical bytes and CIDs.
@accept Capability payloads contain no `undefined`, functions, symbols, class instances, framework stores, mutable aliases, or implicit host objects; encoders project these into closed protocol types before canonicalization.
@accept Encode performs validate, normalize, canonicalize, hash, and decode-round-trip verification before a capability block may enter the outer CAR.
@accept Golden fixtures prove byte-for-byte and CID stability across Node/Bun and supported browsers.
@evidence 2026-09-04 The passing codec, cartridge, and golden-vector suites prove canonical DAG-CBOR/raw encoding, CID stability, strict value projection, and byte/CID verification before CAR emission.

### @work @done define evolution, dependencies, and opaque retention
@memory ../memories/teleport/contracts/teleport-capability-evolution-and-retention.md
@memory ../memories/teleport/contracts/teleport-layer-1-capability-contracts.md
@memory ../memories/teleport/contracts/teleport-layer-4-cartridge-graph.md
@accept Migration is a pure directed chain from a declared historical version to the current in-memory representation; new exports never emit historical schemas.
@accept Each migration records source version, target version, lossy fields, emitted diagnostics, and fixture coverage. No migration fetches data, opens stores, unwraps credentials, or guesses absent authority.
@accept Unknown optional capabilities retain their original descriptor and exact bytes through import, workspace edits unrelated to them, and re-export. Unknown required capabilities block commit without being discarded.
@accept Capability dependencies distinguish hard decode dependencies, restore-order dependencies, optional enhancement dependencies, and application availability; cycles are rejected unless an explicit aggregate capability owns the cycle.
@accept Removal of a capability instance is an explicit workspace operation and never an incidental consequence of an unavailable codec.
@evidence 2026-09-04 The passing cartridge suite rejects migration gaps and invalid dependency graphs while retaining unknown optional blocks and rejecting unknown required capability restoration.

### @work @done define composable restore-plan algebra
@memory ../memories/teleport/contracts/teleport-restore-plan-composition.md
@memory ../memories/teleport/contracts/teleport-restore-and-migration.md
@memory ../memories/teleport/contracts/teleport-layer-5-restore-orchestration.md
@accept Each codec projects decoded current state into declarative restore steps with stable step identity, effect class, dependencies, required resources, confirmation policy, rollback description, verification predicate, and redacted diagnostics.
@accept The shared planner topologically composes steps across workspace layout, HUD latest-rebase, encrypted key envelopes, Fireproof stores, and optional assets while detecting conflicts before any effect runs.
@accept Decode success does not imply restore authorization. Network, secret-bearing, destructive replace/merge, and stale exact-replay steps remain pending until application policy and any required user approval are satisfied.
@accept Execution records typed receipts and rolls back committed reversible steps in reverse dependency order when a required later step fails; irreversible steps cannot be scheduled without an explicit boundary.
@evidence 2026-09-04 The restore executor atomic and seam suites prove inert planning, authorization-gated execution, staged commit verification, rollback, receipts, and cleanup.

### @work @done land reference codecs in dependency order
@memory ../memories/teleport/contracts/teleport-cross-project-ownership.md
@memory ../memories/teleport/contracts/teleport-codec-kernel-and-registry.md
@memory ../memories/teleport/contracts/teleport-layer-6-application-adapters.md
@accept First land a fixture-only reference codec proving the shared kernel, deterministic encoding, registry dispatch, opaque retention, migrations, and restore planning without application dependencies.
@accept Second adapt JTWC `CartridgeDocument` v2 as `wx.hud.intent@2`, preserving latest-scene rebase and keeping `HudTeleportSnapshot` behind a distinct exact-replay capability.
@accept Third implement `wx.workspace.layout` with pane capability-instance references and compose multiple HUD instances without importing JTWC runtime code into the workspace codec.
@accept Fourth generalize the Researcher archive as provider-settings and Fireproof-store capabilities with capability-scoped encryption after the semantic and workspace contracts pass cross-runtime proof.
@evidence 2026-09-04 The neutral package retains verified asset codecs and the shared codec/protection/restore seams; the application-owned HUD, workspace, provider, and Fireproof codecs remain established in their consumer workspaces.

### @proof @done codec conformance and adversarial matrix
@memory ../memories/teleport/contracts/teleport-codec-conformance-harness.md
@memory ../memories/teleport/contracts/teleport-colocated-domain-seam-vitest.md
@memory ../memories/teleport/contracts/teleport-layer-2-codec-kernel.md
@accept A reusable conformance harness runs against every registered codec and proves canonical byte/CID stability, strict unknown-field behavior, round-trip equality, input immutability, budget enforcement, migration completeness, typed failures, dependency projection, and absence of effects during decode.
@accept Cross-runtime fixtures execute in Node/Bun and supported browsers; browser-only or Node-only behavior is a codec-boundary failure unless the capability explicitly contains raw foreign bytes handled by an application adapter.
@accept Adversarial cases include malformed DAG-CBOR, duplicate semantic keys, invalid UTF-8, non-finite numbers, oversized nesting/collections/strings, hash mismatch, version confusion, migration gaps, dependency cycles, opaque optional relay, required-unknown rejection, and secret-marker leakage.
@accept JTWC and wx-ui-melt acceptance additionally proves multiple same-id capability instances remain isolated by instance identity and restore into the intended panes without state crossover.
@evidence 2026-08-23 Local tests now follow named conservative Vitest projects: colocated kernel and restore atomic suites, configuration-policy proof, and dedicated protected-restore plus cartridge-cloud seam suites. `mise run verify` passes 5 files and 41 tests with JUnit/JSON reports ignored under `reports/`.
@evidence 2026-09-04 `mise run verify` passes the expanded conformance, adversarial, protection, transport, restore, and seam suites: 830 tests in 102 files with current JUnit/JSON reports.
@evidence 2026-09-04 Bounded fast-check canonical-codec laws now generate valid public fixture values with opposite source-object insertion order and prove identical DAG-CBOR bytes/CIDs plus decode-to-reencode byte/CID idempotence. `mise exec -- bun run check:teleport` passes 60 tests in 7 files.
@note The former `tests/core.test.ts` is now colocated as `src/cartridge.test.ts`; its broad describe groups remain explicit split inventory as narrower source domains are introduced, not precedent for a permanent core-test bucket.

### @work @deferred composable wx-ui-melt workspace cartridges
@memory ../memories/teleport/contracts/teleport-workspace-composition.md
@memory ../memories/teleport/contracts/teleport-layer-6-application-adapters.md
@accept Replace the JSON document downloaded as `workspace.car` with a genuine CAR whose workspace layout capability references pane content by capability and instance identity.
@accept `wx.workspace.layout` owns split topology, pane identity, active pane, canonical cameras, and content references; it does not serialize Svelte components, MapLibre objects, DOM state, or derived view models.
@accept A workspace may place multiple JTWC HUD intent instances in panes and retain unsupported optional pane capabilities without silently replacing them with empty state.
@accept Invalid or unsupported input returns typed errors; it never falls back to an empty settings or workspace document.
@note Paused in this neutral package. wx-ui-melt owns its workspace codec, UI restore adapter, package migration, and clean-profile browser proof.

### @work @done capability-scoped encryption and portable stores
@memory ../memories/teleport/contracts/teleport-security-and-store-portability.md
@memory ../memories/teleport/contracts/teleport-layer-3-protection-profiles.md
@accept Encrypt each sensitive capability with its own random data key and wrap those keys through the cartridge key envelope so nonsensitive workspace and HUD intent can remain independently shareable.
@accept Generalize the provider-specific Fireproof archive into a versioned `wx.fireproof.store` capability with logical database identity, writer-format metadata, encrypted blocks, metadata heads, key-envelope reference, and explicit isolated/replace/merge restore policy.
@accept Plain export and protected export are first-class profiles over the same canonical capabilities. Applications accurately classify and explicitly authorize plain secret-bearing output; protected passphrase wrapping remains the unattended-backup default.
@accept Already encrypted Fireproof native chunks remain opaque ciphertext and are not encrypted a second time; their sensitive descriptor, original CID mapping, metadata heads, and usable store key remain protected by the capability descriptor and cartridge key envelope.
@evidence 2026-09-04 The passing protection and cartridge suites prove passphrase, selective, recipient, multi-recipient, provider-unwrapped, signature, and encrypted-private-inventory profiles without re-encoding protected capability bytes.

### @work @done transactional import, migration, and restore planning
@memory ../memories/teleport/contracts/teleport-restore-and-migration.md
@memory ../memories/teleport/contracts/teleport-layer-5-restore-orchestration.md
@accept Import follows parse, CID/DAG verification, capability inventory, in-memory migration, restore planning, dependency validation, isolated staging, commit, reopen verification, and cleanup.
@accept Parsing, validation, and migration never mutate application state or fetch network data.
@accept Restore plans classify safe, network-rebase, secret-bearing, destructive, unsupported, and stale-replay effects before execution; replace or merge operations require an explicit application-owned decision.
@evidence 2026-09-04 The passing cartridge and restore-executor suites prove parse/graph verification, migration before effects, transactional staging, authorization classification, rollback, and cleanup through neutral ports.

### @work @done cloud, stream, and file transport profiles
@memory ../memories/teleport/contracts/teleport-layer-7-transport-profiles.md
@memory ../memories/teleport/contracts/teleport-cartridge-container.md
@accept Portable download and handoff use one self-contained CAR v1; cloud transport stores the same canonical graph as immutable CID-addressed blocks plus a separately published root and optional conditional workspace head.
@accept Cloud transport publishes children before roots, uses explicit checksums instead of ETag-as-CID assumptions, preserves client-side capability protection, and keeps S3 credentials, object metadata, lifecycle, multipart, caching, and garbage collection outside capability codecs.
@accept Streaming and selective reads may replace bounded whole-object buffering without changing capability bytes, CIDs, protection envelopes, manifests, or restore behavior; CAR v2 indexing remains optional while its specification is draft.
@evidence 2026-09-04 The passing transport and cartridge seam suites prove bounded stream ingestion, CAR graph preservation, immutable child-first publication, conditional heads, checksums, and tenant-scoped object-store policy.

### @work @open browser-first portable cartridge delivery
@memory ../memories/teleport/contracts/browser-teleport-import-export-contract.md
@memory ../memories/teleport/contracts/browser-teleport-cdn-consumer-conformance.md
@memory ../memories/teleport/contracts/teleport-layer-6-application-adapters.md
@memory ../memories/teleport/contracts/portable-car-security.md
@decision @accepted The browser is the ultimate Teleport Cartridge consumer. The existing portable root `teleport.ts`/`teleport.js` is the sole browser-facing package surface; Bun is build tooling only and the optional broker, recipe runner, keychain, PM2, and process features are neither loaded nor required for browser import/export.
@accept Browser consumers use the portable root only. The package may independently ship the four Bun artifacts for Bake and other Bun consumers, but their exports, runtime constraints, and release gates remain separate and cannot impose runtime, build, verification, or release dependencies on browser consumers.
@blocker The browser-ready package is not published: on 2026-09-05 `https://esm.sh/@epsilonode/nebular@0.1.0` returned HTTP 404. Consumers therefore still resolve linked workspace source instead of one immutable compiled portable artifact.
@blocker The current manifest/build includes source entrypoints in the package inventory. Publish only compiled `dist` artifacts and declarations plus ordinary package metadata; retain the independently shippable Bun artifacts, but add a portable-root-only package/CDN gate before browser release rather than treating the four-artifact gate as a browser prerequisite.
@accept Each application browser profile owns its NanoStore and Fireproof documents as the source of truth. Its adapter projects selected state to its capability codecs, calls the neutral export/import and restore-plan interfaces, and owns all framework/store mutation, file-picker/download, confirmation, and visible progress UI.
@accept The generic browser flow is deliberately small: choose export -> assemble/optionally protect/download a CAR; choose import -> parse/verify/unlock -> inspect the restore plan -> application-confirmed execute/rollback. No Bun/Node API, broker bridge, browser-local privileged service, secret delivery, recipe execution, or application-store import may enter the portable graph.
@accept Browser applications externalize the bare portable `@epsilonode/nebular` import and resolve it through one pinned published-package CDN import-map URL. They may install that exact version only for declarations/type checking; they never use `link:`, `file:`, GitHub TypeScript source URLs, workspace paths, or an application-bundled copy in production output.
@accept Prove a clean source browser profile exports representative NanoStore and Fireproof-backed documents, and a separate clean browser profile imports the CAR through the application restore adapter. Verify canonical CAR integrity, intended state restoration, unknown optional retention, user cancellation, wrong protection key, rollback/recovery, no Bun/Node/polyfill edge, no browser-source fallback, and no credential/plaintext leakage into UI, storage, URL, console, bundle, or source map.
@accept Release browser support through the browser-only gate: browser-target build, declaration/package proof, published immutable package version, CDN/import-map resolution, and the cross-profile browser fixture. Optional Bun artifact/E2E work is tracked separately and cannot delay this browser release.

### @proof @deferred cross-project round-trip and compatibility matrix
@memory ../memories/teleport/contracts/teleport-cross-project-ownership.md
@memory ../memories/teleport/contracts/teleport-layer-6-application-adapters.md
@accept A clean-profile browser exports a multi-pane wx-ui-melt workspace containing JTWC HUD intent, imports it in another clean profile, rebuilds layout, rebases each HUD against a fresh authoritative scene, and reports unresolved capabilities without data loss.
@accept Retain focused proof for canonical DAG-CBOR determinism, CID corruption, missing/extra blocks, unknown required/optional capabilities, migration chains, wrong passphrase, capability redaction, interruption cleanup, and transactional rollback.
@accept Supa Svelte owns provider/Fireproof codecs, JTWC owns HUD codecs, wx-ui-melt owns workspace composition, and a neutral shared package owns the outer transport and orchestration contracts.
@note Paused pending consumer-owned migration and proof. JTWC, wx-ui-melt, and supa-svelte currently import `@wx/teleport-cartridge`, whereas browser delivery requires a published `@epsilonode/nebular` package and one pinned external import-map version; their owners must remove link/file/source fallback, update dependencies/import maps/lockfiles, and run clean-profile browser acceptance in their own workspaces.

## @tier0 completion and handoff

### @proof @done real credential gateway proof
@closed 2026-08-16 evidence="A real downloaded unprotected CAR restored successfully and produced model HTTP 200 plus streamed completion HTTP 200 through the corrected Cloudflare custom-Kilo route."
@memory ../memories/teleport/contracts/gateway-testing-harness-goal.md
@memory ../../../supa-mail-hook/proj-ledger/memories/ai-relay/evidence/cloudflare-gateway-setup.md
@memory ../memories/teleport/contracts/portable-car-security.md
@evidence `scripts/verify-downloaded-agent-gateway.ts` now locates exactly one `.fireproof.car` in Downloads and launches verify or diagnose mode with inherited terminal input; it never prints the CAR path or accepts a passphrase argument/environment shortcut.
@evidence The restore metadata-head mismatch was corrected by treating `carLog[0]` as the newest canonical head; regression coverage retains reversed-history proof.
@evidence The final non-interactive verifier returned `gatewayVerification: "passed"`, 380 models, completion HTTP 200, and normal stream completion while emitting only redacted identifiers and timings.
@evidence Cloudflare analytics correlated the bounded model/completion traffic to gateway `researcher`; payload collection and caching remained disabled.
@evidence Browser failure was separately proven to be CORS-only after Node/Bun success; that production boundary is owned by `ai-relay.md`, not CAR export.

### @risk @accepted sensitive local execution boundary
@memory ../memories/teleport/contracts/portable-car-security.md
@risk The CAR and passphrase together unlock both a personal Kilo key and account-scoped AI Gateway Run capability.
@accept Run only on a trusted local workstation and trusted checkout. Do not upload the CAR to CI, issue trackers, chat, cloud storage, or remote test runners.
@accept Do not pipe verifier stdout/stderr through general telemetry or transcript capture until the redaction boundary is independently reviewed for that sink.
@accept On interruption, require process termination, no surviving `researcher-provider-*` directory, and no retained credential broker or child browser process.
@closed 2026-08-16 evidence="The security boundary is implemented and tested; the remaining inherent risk is explicitly accepted for trusted local protected or unprotected CAR workflows."

## @tier8 credential portability and gateway proof

### @decision @accepted cross-project ownership and artifact flow
@memory ../memories/teleport/contracts/project-build-pipeline.md
@accept `supa-svelte` owns Researcher source, provider persistence, CAR export, verifier code, tests, and the single-file shell build.
@accept `wx-shells` owns only the public Worker route allowlist and copied static artifacts; it does not build or own Researcher application source.
@accept A source change is not public until the canonical built Researcher artifact is copied to `wx-shells` and a successful Worker deployment activates it.
@accept CAR verifier scripts run from `supa-svelte` and are not served or executed by the `wx-shells` Worker.

### @decision @accepted browser-owned credential boundary
@memory ../memories/teleport/contracts/portable-car-security.md
@accept Personal Kilo and Cloudflare AI Gateway Run credentials remain browser-owned in Fireproof until the user explicitly exports them.
@accept Source, build output, command arguments, environment variables, URLs, terminal history, and reports never carry plaintext credentials or the export passphrase.
@accept A downloaded CAR remains sensitive even though its Fireproof chunks and wrapped keybag are encrypted.
@accept The export contains only `dataminr-agent-provider-settings` document state and never conversations, prompts, completions, MCP data, collections, or alerts.

### @decision @accepted explicit unprotected local-testing export
@accept The operator may leave both export passphrase fields blank to create an `unprotected-v1` local-testing CAR so the bounded harness can run without further credential interaction.
@accept `unprotected-v1` is an explicit manifest mode, not a hidden or repository-stored passphrase; protected `passphrase-wrapped-v1` archives remain supported and continue to prompt locally.
@accept The harness still owns credential-bearing requests and emits only the existing redacted reports; no credential is added to source, command arguments, environment variables, or reports.
@risk Any process or agent with read access to an unprotected CAR can derive its Fireproof key material. This mode provides no meaningful at-rest credential protection and is accepted only for the user's trusted local-development workflow.
@accept Delete the unprotected CAR after testing and never upload, commit, sync, or retain it as a credential backup.
@evidence Blank GUI passphrase fields now export `unprotected-v1`; the verifier detects that mode and skips passphrase input. Non-empty matching fields retain the original protected flow.
@evidence `verify-downloaded-agent-gateway.ts [verify|diagnose] --non-interactive` also skips the already-confirmed logging-policy prompt, but the verifier rejects that flag for passphrase-protected archives.

### @work @done provider persistence independent of connectivity
@closed 2026-08-16 evidence="Provider settings save to Fireproof without requiring a default model or successful model catalog request."
@memory ../memories/teleport/evidence/implemented-verification-path.md
@evidence `src/lib/agent/provider-settings.ts` accepts an empty normalized `defaultModel`, owns the named database/document constants, and persists all four provider values.
@evidence `src/lib/agent/stores.ts` now clears stale model state after persistence but does not turn a failed follow-up catalog refresh into a failed save.
@evidence `src/components/agent/AgentApp.tsx` reports persistence separately, labels the default model optional, and tests the current draft independently.
- [x] @accept A user can save valid Cloudflare/Kilo credentials while the gateway is unavailable or misconfigured.
- [x] @accept A provider change clears stale selected and pinned models.
- [x] @accept Model refresh remains a non-blocking follow-up.

### @work @done encrypted browser CAR export
@closed 2026-08-16 evidence="The file:// Researcher shell exports a self-verified passphrase-wrapped Fireproof CAR without plaintext credential markers."
@memory ../memories/teleport/contracts/portable-car-security.md
@memory ../memories/teleport/evidence/implemented-verification-path.md
@evidence `src/lib/agent/provider-car.ts` implements the versioned DAG-CBOR manifest, normal CAR v1 writer/reader, strict schema checks, duplicate/missing/unreferenced-block rejection, and SHA-256 CID validation.
@evidence `src/lib/agent/provider-car-crypto.ts` wraps the exact Fireproof V2 storage key item with PBKDF2-SHA-256 at 310,000 iterations and AES-256-GCM using random salt and IV values.
@evidence `src/lib/agent/provider-export.ts` exports active encrypted Fireproof CAR chunks, `currentMeta`, `carLog`, and only the required data-store keybag record.
@evidence Fireproof ciphertext receives a separate raw outer `bytesBlockCid`; its original Fireproof CID is retained for restore because Fireproof hashes decrypted CAR bytes rather than ciphertext bytes.
@evidence The browser self-verifies the completed outer CAR and searches its bytes for both saved credential markers before allowing download.
- [x] @accept Inline masked passphrase and confirmation fields are transient and cleared in `finally`.
- [x] @accept Export succeeds only for a saved base URL, provider key, and Cloudflare token.
- [x] @accept Download uses `researcher-provider-verification.fireproof.car` and `application/vnd.ipld.car`.
- [x] @accept `*.fireproof.car` is ignored by Git.

### @work @done isolated Fireproof restore
@closed 2026-08-16 evidence="Bun restores exported browser ciphertext through Fireproof 0.24.19, reopens the document normally, and removes all temporary files."
@memory ../memories/teleport/contracts/portable-car-security.md
@memory ../memories/teleport/evidence/implemented-verification-path.md
@evidence `scripts/lib/restore-provider-fireproof.ts` validates wrapped key names, creates a UUID database in a fresh `test-artifacts/researcher-provider-*` directory, and seeds key material before `database.ready()`.
@evidence The adapter saves ciphertext under original Fireproof CIDs, reconstructs current metadata, closes, reopens, and reads `agent-provider-settings` through `database.get()`.
@evidence The restored file store is removed recursively in `finally`; no `researcher-provider-*` directories remain after successful proof runs.
@note The temporary keybag is necessarily unwrapped while the restored database is open. The directory is sensitive during that bounded interval and is never retained as an artifact.
@note Fireproof 0.24.19 mishandles absolute Windows `file:///C:/...` store URLs, so the isolated adapter uses Fireproof's proven project-relative path form inside ignored `test-artifacts/`.
- [x] @accept Wrong passphrase fails before temporary-store creation.
- [x] @accept Restore never falls back to plaintext JSON replay.
- [x] @accept Only provider settings are returned to process memory.

### @work @done one-shot Cloudflare verification harness
@closed 2026-08-16 evidence="The CLI validates archive integrity, restores credentials, proves Cloudflare model and streaming completion routes, and emits one redacted result."
@memory ../memories/teleport/evidence/implemented-verification-path.md
@memory ../memories/teleport/contracts/cloudflare-repair-boundary.md
@memory ../memories/teleport/contracts/gateway-testing-harness-goal.md
@memory ../../../supa-mail-hook/proj-ledger/memories/ai-relay/evidence/cloudflare-gateway-setup.md
@evidence `scripts/verify-agent-gateway.ts` accepts only a CAR path, reads the passphrase from stdin with terminal echo disabled where supported, and does not accept passphrase arguments or environment variables.
@evidence The verifier requires HTTPS `gateway.ai.cloudflare.com`, account `7eaf32570ed54321d9e518504f786d68`, a named gateway, and `/custom-kilo/api/gateway` before sending credentials.
@evidence The harness calls `GET /models` with a 30-second timeout and `POST /chat/completions` with a 60-second timeout, a fixed prompt, streaming enabled, and a 256 KiB response ceiling.
@evidence The user must explicitly confirm that Cloudflare payload logging is disabled or minimized because an AI Gateway Run token cannot inspect or change that setting.
@evidence Output retains only schema/manifest versions, verified block count, HTTP statuses, model count, hashed selected model ID, stream completion, timings, and pass/fail stage.
@evidence Output omits the base URL, gateway ID, Kilo key, Cloudflare token, authorization headers, passphrase, prompt, completion text, raw model catalog/ID, response bodies, Fireproof key material, and temporary paths.
- [x] @accept A successful result ends with `gatewayVerification: "passed"`.
- [x] @accept A failed result uses a bounded stage and optional HTTP status rather than raw library/network exceptions.
- [x] @accept Fireproof console output is suppressed during CLI restore so it cannot corrupt the one-object stdout contract.

### @proof @done automated security and portability evidence
@closed 2026-08-16 evidence="All focused tests, source checks, artifact build, browser file-origin smoke, and dependency audit completed successfully."
@memory ../memories/teleport/evidence/implemented-verification-path.md
@memory ../memories/teleport/contracts/project-build-pipeline.md
@memory ../memories/teleport/contracts/gateway-testing-harness-goal.md
@evidence Vitest: 22 files and 73 tests passed, including CAR corruption/missing-block/version checks, wrong-passphrase rejection, real encrypted Fireproof reopen, gateway path/header seams, and output redaction.
@evidence Astro check completed with zero errors, warnings, or hints; focused ESLint and strict script TypeScript checks passed.
@evidence The Edge CDP `file://` smoke saved fixture credentials through React/IndexedDB, downloaded a 3,500-byte archive, found no plaintext credential markers, and restored exact settings in Bun.
@evidence Dependency scan covered 30 direct packages with low project risk, no critical/high vulnerabilities, no hallucinated packages, and no deprecated packages.
@evidence `mise exec bun -- bun run build:shells` produced the single-file Researcher artifact and copied it to `C:/proj/wx-shells/dist/bundles/agent-researcher.html`.
@evidence Source and handoff Researcher artifacts matched SHA-256 `AAA3A381C0E7A2637764A33EAAED59D6AF0849A34745CA6109F7B864B364F18C`.
@evidence The optional-passphrase update passes 25 Vitest files and 113 tests, Astro check with zero findings, and the file-origin browser CAR smoke; the rebuilt source and handoff artifacts match SHA-256 `557B2FE2271C1E9B5847A471F3D4F09930465577FF16CF7799272F049868CA50`.
@evidence The final gateway-routing update passes 25 Vitest files and 114 tests, Astro check with zero findings, and the browser CAR smoke; source and handoff artifacts match SHA-256 `BAEA6B589FF27AC2B2664A4BACC9C326A0A65A9D24133C4DF566B97EBDC7C54C`.
@evidence The real downloaded unprotected CAR produced `gatewayVerification: "passed"` with gateway model HTTP 200, completion HTTP 200, 380 models, and normal stream completion.
@proof_gap Full repository lint is independently blocked by the pre-existing readonly-type finding at `src/shells/dataminr.ts:6:43`; changed CAR/provider/harness files lint cleanly.
@note No production `wx-shells` deployment was performed as part of implementation.
@harness scope=atomic status=active target=src/lib/agent/provider-car.test.ts seam=outer-car-contract disposition=retain:atomic-suite reason="proves strict archive structure and CID validation"
@harness scope=atomic status=active target=src/lib/agent/provider-car-crypto.test.ts seam=keybag-wrap disposition=retain:atomic-suite reason="proves key wrapping and wrong-passphrase failure"
@harness scope=seam status=active target=scripts/lib/restore-provider-fireproof.test.ts seam=encrypted-fireproof-reopen disposition=retain:seam-suite reason="proves actual Fireproof ciphertext and keybag portability"
@harness scope=seam status=active target=scripts/verify-agent-gateway.test.ts seam=cloudflare-request-redaction disposition=retain:seam-suite reason="proves paths, header names, SSE completion, and redacted output"
@harness scope=proof status=active target=scripts/provider-car-browser-smoke.ts seam=file-origin-browser-export disposition=retain:browser-proof reason="proves file-origin browser persistence, download encryption, and Bun restore"

## @tier7 autonomous gateway diagnostician

### @gap @done one-shot verifier does not continue as an agent
@memory ../memories/teleport/proposals/agentic-gateway-diagnostician.md
@memory ../memories/teleport/contracts/gateway-testing-harness-goal.md
@evidence The current CLI exits after one deterministic `/models` request and one streamed completion request.
@note Unlocking the CAR currently proves credential portability and route behavior but does not create a credential-bound autonomous diagnosis session.
@accept Preserve the existing one-shot verifier as a fast deterministic proof even after an agentic mode lands.
@closed 2026-08-16 evidence="Explicit diagnose mode now runs the bounded credential-bound state machine while preserving one-shot verify mode."

### @decision @accepted deterministic control plane before model reasoning
@memory ../memories/teleport/proposals/agentic-gateway-diagnostician.md
@accept Gateway diagnosis cannot depend on the same gateway being healthy enough to host its controlling agent.
@accept Implement the autonomous diagnostician as a local deterministic state machine with bounded tools; optional model reasoning may summarize evidence only after transport success.
@accept One passphrase unlocks one process-local session. Credentials remain in closure-owned memory and are never returned by a tool or projected into diagnostics.

### @work @done credential-bound diagnostic session
@closed 2026-08-16 evidence="A closeable private GatewayPort, finite diagnosis policy, identity-guarded lifecycle, budgets, redacted reporting, and non-interactive unprotected-CAR workflow landed and passed live valid-route proof."
@memory ../memories/teleport/proposals/agentic-gateway-diagnostician.md
@memory ../memories/teleport/contracts/cloudflare-repair-boundary.md
@memory ../memories/teleport/contracts/gateway-testing-harness-goal.md
@memory ../../../supa-mail-hook/proj-ledger/memories/ai-relay/evidence/cloudflare-gateway-setup.md
@accept Add `diagnose` mode that unlocks once, deletes restored disk state, then keeps only a private in-memory credential capability until process exit.
@accept Model the session as `locked -> validating -> restoring -> ready -> diagnosing -> resolved|failed -> closed` with identity-guarded transitions and guaranteed cleanup.
@accept Bound autonomous execution by elapsed time, request count, completion count, response bytes, retries, and cancellation signal.
@accept Expose only scoped internal tools: validate URL shape, discover models, probe authenticated model access, probe bounded streaming, classify HTTP/network/SSE failures, and rerun an eligible probe.
@accept Never expose a generic credential-bearing fetch tool, arbitrary URL input, shell execution, environment access, file reads, or raw response output to the diagnostic policy.
@accept Permit automatic retry only for bounded transient failures. Do not retry authentication, route, malformed-response, or billable completion failures blindly.
@accept Produce a redacted evidence ledger showing observations, decisions, attempted safe actions, final diagnosis, and operator remediation steps.
@accept Diagnose at least Cloudflare authentication failure, Kilo authentication failure, wrong account/gateway/provider path, duplicated/omitted Kilo prefix, timeout, malformed catalog, empty catalog, missing stream, truncated stream, and absent `[DONE]`.
@accept Distinguish Node gateway success from browser `file://` CORS success; invoke the browser proof when CORS is the remaining hypothesis.
@evidence `scripts/lib/gateway-transport.ts` now creates a closeable session-local `GatewayPort`; credentials, base URL, fixed prompt, headers, fetch, and raw bodies remain closure-owned and are unavailable to the policy.
@evidence `scripts/lib/gateway-diagnosis/policy.ts` runs a finite local policy with a two-minute limit, six-request ceiling, three-completion ceiling, two retries per stage, 256 KiB response ceiling, cancellation, fallback selection, and trailing-slash normalization.
@note Automatic browser launch remains intentionally outside the credential-bound CLI; the browser CORS boundary was proven independently and transferred to `ai-relay.md`.

### @work @done diagnostic domain and command surface
@closed 2026-08-16 evidence="Explicit diagnose mode, closed lifecycle/domain types, deterministic policy, private transport, and schema-versioned redacted reports landed without changing one-argument verify behavior."
@memory ../memories/teleport/proposals/agentic-gateway-diagnostician.md
@memory ../memories/teleport/contracts/gateway-testing-harness-goal.md
@accept Preserve the current invocation as the deterministic `verify` path and add an explicit `diagnose` mode rather than silently changing one-shot behavior.
@accept Keep CAR parsing/key unwrap, Fireproof restore, gateway transport, diagnosis policy, lifecycle state, redaction, and CLI projection as separate narrow modules.
@accept Define closed diagnostic outcomes for archive, credential, Cloudflare auth, Kilo auth, route, rate-limit, transient upstream, catalog, completion stream, browser CORS, budget, cancellation, and management-permission-required conditions.
@accept Every observation identifies stage, attempt, elapsed time, HTTP class when safe, and evidence source; it never carries URL, headers, body, model ID, prompt, completion, or secret-bearing exception text.
@accept The final report states `passed`, `diagnosed`, `inconclusive`, `cancelled`, or `budget_exhausted`, includes confidence and ordered safe next actions, and remains schema-versioned JSON.
@accept Exit code 0 means the requested mode reached its accepted terminal goal; diagnosed but unrepaired gateway failure remains nonzero even when classification succeeded.
@evidence `scripts/verify-agent-gateway.ts diagnose <archive>` is explicit; the original `scripts/verify-agent-gateway.ts <archive>` invocation and deterministic result contract remain available.
@evidence The lifecycle reducer covers archive validation, key unwrap, Fireproof restore, ready, diagnosis, every terminal outcome, and closed; session, request, and event identities reject stale or duplicate completions.
@evidence Reports contain only closed codes, ordered observations/actions, safe next steps, bounded counts/timing, and CAR/Fireproof/harness versions. Classified operational failure remains exit code 1.

### @work @done bounded remediation catalog
@closed 2026-08-16 evidence="The deterministic allowlist supports only session URL normalization, valid catalog fallback, bounded eligible retry, browser-CORS guidance, and management-permission escalation."
@memory ../../../supa-mail-hook/proj-ledger/memories/ai-relay/evidence/cloudflare-gateway-setup.md
@memory ../memories/teleport/contracts/cloudflare-repair-boundary.md
@accept Map each accepted diagnosis to an allowlisted action class: automatic session repair, user-approved browser setting change, Cloudflare dashboard action, management-token escalation, or no-safe-repair.
@accept Automatic session repair may normalize a trailing slash, choose a valid catalog fallback, or retry an eligible transient operation; it may not change account state or persisted browser credentials.
@accept Recommend exact route corrections for wrong account/gateway/provider suffix and duplicated/omitted `/api/gateway`, but require user approval before browser persistence changes.
@accept Attribute Cloudflare-versus-Kilo failures only from sanitized provenance, controlled probes, or dashboard correlation; a bare 401/404 is insufficient.
@accept Stop after a repair verifies the affected seam or after the bounded attempt budget is exhausted. Never enter an open-ended repair loop.
@evidence Bare 401/403/404 responses stay `inconclusive_layer_attribution`; Cloudflare-versus-Kilo classification requires sanitized provenance and is never inferred from a status alone.
@evidence Route validation diagnoses wrong account, wrong custom-provider slug, duplicated `/api/gateway`, omitted `/api/gateway`, and invalid/non-Cloudflare destinations before any credential-bearing request.

### @proof @deferred live autonomous diagnosis matrix
@memory ../memories/teleport/proposals/agentic-gateway-diagnostician.md
@accept Use fake ports to prove every state transition, retry decision, budget stop, cancellation path, and redaction invariant without live credentials.
@accept Add opt-in live cases for valid route, invalid Cloudflare token, invalid Kilo key, wrong gateway ID, wrong custom-provider suffix, timeout, and browser-only CORS failure.
@accept Confirm every case deletes temporary stores, emits no secret marker, and leaves no process-local credential broker after termination.
@accept Require the valid live case to correlate both `/models` and `/chat/completions` with the intended Kilo custom provider in Cloudflare observability.
@evidence Fake-port and transport suites cover pass, fallback, trailing-slash repair, transient ceilings, cancellation, budget exhaustion, unattributed authentication/route failures, malformed catalogs/SSE, missing body/`[DONE]`, oversized/truncated streams, concurrent credential isolation, and Node-success/browser-CORS separation.
@evidence The unprotected downloaded CAR now restores non-interactively and passes the live valid-route proof: the public Kilo catalog returned 361 models and the Cloudflare completion returned HTTP 200 with a complete SSE stream. Cloudflare analytics correlated the preceding bounded requests and errors to the researcher gateway.
@proof_gap Deliberate invalid live credential cases were not required for CAR completion; retain fake-port coverage and treat any future opt-in live fault injection as separate harness maintenance.
@note Paused. This is a consumer-owned gateway harness, not a neutral Teleport package acceptance gate.

### @proof @deferred adversarial containment matrix
@memory ../memories/teleport/contracts/portable-car-security.md
@memory ../memories/teleport/proposals/agentic-gateway-diagnostician.md
@accept Reject unsupported manifest/package versions, extra or missing blocks, mismatched metadata CIDs, oversized archives, excessive KDF work factors, malformed keybags, and non-Cloudflare credential destinations before mutation or network access.
@accept Inject secret markers into network exceptions, headers, bodies, model IDs, Cloudflare diagnostics, Fireproof logs, and cancellation paths; prove none reaches reports or console output.
@accept Prove Ctrl+C, timeout, fetch abort, Fireproof reopen failure, browser crash, and report serialization failure all close resources and remove temporary state.
@accept Prove concurrent or repeated sessions cannot reuse another session's credentials, identity, temporary database, retry budget, or result events.
@accept Fuzz bounded CAR and SSE parsers within practical limits and retain every discovered regression as a minimal non-secret fixture.
@evidence The suite rejects unsupported manifest/package versions, excessive KDF work factors, oversized archives/keybags, excessive key rotation, malformed/truncated/oversized SSE, stale/duplicate lifecycle events, and secret markers in model/error/cancellation paths.
@evidence Restore failure cleanup and concurrent session credential separation are covered; the full test gate passes 25 files and 114 tests.
@proof_gap Practical CAR/SSE fuzzing, forced report-serialization failure, browser crash cleanup, and opt-in invalid live credential cases remain open.
@note Paused. Fuzzing and browser/process containment for the credential gateway are maintained by its owning consumer workspace.

## @tier5 harness compatibility and operations

### @work @done CAR schema and Fireproof compatibility policy
@closed 2026-08-16 evidence="CAR v1 and Fireproof 0.24.19 compatibility are bounded, version-pinned, exercised by real browser export/Bun restore, and protected by regression tests."
@memory ../memories/teleport/contracts/portable-car-security.md
@accept Treat manifest version 1 and `@fireproof/core@0.24.19` as an exact restore contract; reject a package-version mismatch before key unwrap or temporary mutation.
@accept Any Fireproof upgrade requires export and restore adapter review, same-browser export proof, cross-runtime reopen proof, wrong-passphrase proof, and an explicit manifest compatibility decision.
@accept Add a migration only when a real retained v1 backup must remain readable; do not add speculative backward compatibility.
@accept Bound accepted archive bytes, block count, block size, key count, key rotations, metadata groups, and JSON/SSE decode size before autonomous mode consumes untrusted CAR input.
@evidence CAR v1 now enforces the exact Fireproof 0.24.19 package contract, exact 310,000-iteration KDF, 8 MiB archive, 64 blocks, 4 MiB blocks, 32 Fireproof references, bounded metadata groups, 64 KiB keybag, four key items, and eight rotations per item before restore.
@evidence Real-CAR restore reached settings-read and exposed a Fireproof metadata-head mismatch: asynchronous loader.currentMeta may contain flattened history, while carLog[0] is the newest canonical head. Restore and future export now select carLog[0]; regression coverage passes with deliberately reversed flattened currentMeta.
@evidence The real downloaded unprotected CAR passes manifest verification, Fireproof settings restore, public catalog validation, and the authenticated Cloudflare completion probe without interactive input.

### @work @done report and evidence retention policy
@closed 2026-08-16 evidence="CLI output remains bounded machine-readable JSON; no autonomous trace files are written, and retained roadmap evidence is sanitized."
@memory ../memories/teleport/contracts/gateway-testing-harness-goal.md
@accept Keep stdout machine-readable and bounded; route interactive prompts and short operator guidance to stderr without secret-derived text.
@accept Define which sanitized reports may be retained, their expiry, and whether Cloudflare request IDs are safe to include before adding report-file output.
@accept Do not persist autonomous traces by default. If traces become necessary, project only closed diagnostic events through the same marker-based redaction tests.
@accept Include harness source version, CAR manifest version, Fireproof package version, report schema version, and selected mode so evidence remains reproducible without exposing configuration.

### @proof @done browser CORS proof and successor handoff
@closed 2026-08-16 evidence="Direct browser failure was isolated to missing CORS headers after successful Node/Bun gateway proof and transferred to the AI relay roadmap."
@memory ../memories/teleport/contracts/gateway-testing-harness-goal.md
@memory ../../../supa-mail-hook/proj-ledger/memories/ai-relay/evidence/browser-cors-boundary.md
@accept Convert the existing Edge CDP fixture smoke into a callable diagnosis seam that can distinguish browser startup, IndexedDB persistence, export, preflight, model response, and stream completion failures.
@accept Keep real credentials inside the browser profile and credential-bound harness process; CDP results return sanitized stage evidence only.
@accept Add no CORS facade until deterministic Node proof passes and the real `file://` browser request fails specifically at CORS/preflight.
@accept If a facade is required, scope it to the exact Cloudflare gateway origin/method/header set, preserve authenticated-gateway enforcement, and add a separate accepted deployment/security contract.
@evidence Manual `file://` browser proof now reproduces `Failed to fetch` with no corresponding Cloudflare request count, while dashboard configuration matches the accepted authentication, logging, caching, and custom-provider route contract.
@evidence Real-CAR diagnosis now passes archive validation, passphrase unwrap, and Fireproof restore, then classifies the saved Researcher route as wrong_custom_provider_slug with high confidence.
@evidence Cloudflare custom-provider path joining requires Kilo's upstream base to end in `/api/gateway/` while the SDK-facing gateway completion base ends at `/custom-kilo`; the runtime and verifier now project the saved CAR route accordingly, and the Node/Bun live verifier passes.
@evidence At the operator's direction, authentication was disabled on the researcher gateway. Browser-equivalent `OPTIONS` requests then returned 204 instead of 401, but neither preflight nor successful catalog responses included `Access-Control-Allow-Origin`.
@note Direct browser access remains blocked by upstream CORS even with gateway authentication disabled; implementation and production acceptance continue in `ai-relay.md`.

## @tier3 bounded repair with the Run token

### @work @deferred safe local repair actions
@memory ../memories/teleport/contracts/cloudflare-repair-boundary.md
@accept With only the exported Run token, repair means correcting session-local URL normalization, model fallback, retry timing, or browser guidance; it does not mean changing Cloudflare account configuration.
@accept Every proposed local repair is derived from observed evidence, recorded in redacted form, and verified by rerunning only the affected bounded probe.
@accept Do not rewrite the encrypted source CAR or browser Fireproof settings automatically; return an explicit recommended browser setting change for user approval.

## @tier2 future Cloudflare configuration repair

### @decision @accepted separate management credential
@memory ../memories/teleport/contracts/cloudflare-repair-boundary.md
@accept Cloudflare configuration inspection or mutation requires a separate Account AI Gateway Edit token and never upgrades or repurposes the browser-exported Run token.
@accept The management token is entered through a distinct channel, scoped to one repair session, excluded from CAR format v1, and never forwarded to Kilo.

### @work @deferred inspect-plan-apply-verify repair agent
@memory ../memories/teleport/contracts/cloudflare-repair-boundary.md
@memory ../memories/teleport/proposals/agentic-gateway-diagnostician.md
@accept Add read-only discovery first: gateway existence/settings, authenticated-gateway state, custom provider slug/base URL, logging policy, and applicable limits.
@accept Convert observations into a typed repair plan with before/after values, required permission, risk, verification probes, and rollback instructions.
@accept Default to dry-run. Require explicit approval immediately before each Cloudflare mutation; autonomous diagnosis must not imply autonomous account modification.
@accept Permit only an allowlisted mutation surface for the selected gateway and `kilo` custom provider. Reject arbitrary Cloudflare API operations.
@accept Capture sanitized change receipts and verify repaired behavior through both deterministic Node probes and the `file://` browser acceptance path.
@accept Implement rollback for every mutable setting before enabling apply mode.

### @risk @deferred autonomous repair safety
@memory ../memories/teleport/contracts/cloudflare-repair-boundary.md
@risk An AI Gateway Edit token is account-scoped and can affect gateways beyond the Researcher route if tool containment fails.
@risk Cloudflare observability and API responses may contain request metadata or payload policy details that must not leak into agent context or reports.
@risk Completion probes incur upstream traffic and possible spend; repair loops require hard request, token, duration, and cost ceilings.
@note Configuration-repair automation remains intentionally deferred and is not required for completed CAR export or the limited relay.

## @tier1 release and maintenance boundary

### @work @deferred public shell release
@memory ../memories/teleport/contracts/project-build-pipeline.md
@memory ../../../supa-mail-hook/proj-ledger/memories/ai-relay/contracts/limited-relay-scope.md
@accept Do not deploy solely because fixture/browser export proof passes; first complete the real credential gateway and `file://` CORS acceptance items.
@accept Rebuild through `mise exec bun -- bun run build:shells`, copy only the canonical Researcher artifact, verify source/target hashes, and deploy once from `C:/proj/wx-shells`.
@accept After deployment, verify `/agent/researcher` returns 200, provider settings persist, export still self-verifies, and no direct bundle/API convenience route was introduced.
@accept Rollback replaces only `dist/bundles/agent-researcher.html` with the last known-good artifact and performs a new Worker deployment; it does not mutate CAR schema or credentials.
@note Release ownership moved to `ai-relay.md` because the copied Researcher artifact cannot complete browser gateway access without the same-origin relay.

### @work @done ledger and contract maintenance
@closed 2026-08-16 evidence="CAR completion evidence is recorded, obsolete route guidance is superseded, and remaining browser work is routed to ai-relay.md with dedicated memory cards."
@memory ../memories/teleport/contracts/project-build-pipeline.md
@accept Keep roadmap state aligned with landed behavior; move durable rationale into linked cards and supersede cards rather than silently rewriting obsolete contracts.
@accept Update the build, Kilo route, security, harness goal, implementation evidence, and repair-boundary cards when their owned contracts change.
@accept Never add credential values, real CAR paths, gateway tokens, provider keys, passphrases, or secret-bearing live output to roadmap, memories, Git history, or generated artifacts.
