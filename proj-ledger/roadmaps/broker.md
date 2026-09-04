# Development Credential Broker Roadmap

@roadmap broker
@updated 2026-09-04
@meta name=roadmap-format content="../format-guidance.md"
@meta name=roadmap-status content="active"
@meta name=owner-project content="R:/Code/web/wx-teleport-cartridge"
@meta name=implementation-boundary content="independent packages and privileged broker process"
@meta name=related-roadmap content="car-teleport.md"
@meta name=required-runtime content="Bun through Mise"
@meta name=planned-public-upstream content="https://github.com/epsilonode/nebular"
@note This roadmap defines a local-development credential broker within wx-teleport-cartridge. It reuses Teleport contracts, codecs, protection, and CAR transport while remaining an independently loadable security boundary; the OS credential store is authoritative for live secret material.

## @tier9 active architecture and security boundary

### @decision @accepted broker is a separate security boundary in this project
@memory ../memories/teleport/broker/broker-domain-types-and-boundary-parsing.md
@memory ../memories/teleport/broker/broker-result-task-result-and-error-algebra.md
@memory ../memories/teleport/broker/broker-explicit-effect-environment.md
@memory ../memories/teleport/broker/broker-capability-specific-ports.md
@memory ../memories/teleport/broker/broker-sqlite-nonsecret-authority-journal.md
@accept Build the broker as independent packages, a privileged process, CLI, and client within `R:/Code/web/wx-teleport-cartridge`; do not require a separate repository merely to preserve the security boundary.
@accept Keep package direction one-way: credential packages may depend on neutral cartridge contracts, codecs, protection, and transport, while cartridge core must not depend on Bun, the broker, the keychain adapter, provider adapters, or consent UI.
@accept Keep the broker usable without CAR transfer and keep the generic CAR implementation usable without loading privileged broker or keychain code.
@accept Begin with explicit package boundaries for credential contracts, broker policy/runtime, Bun keychain adapter, agent/client API, and CLI; keep provider adapters and encrypted secret-transfer codecs separable as the implementation grows.
@accept Reuse neutral Teleport capability-contract, canonical-codec, validation, diagnostic, and restore-planning conventions where they reduce duplication without importing CAR storage or application adapters into the broker core.
@accept Require Bun as the broker runtime and package/build tool, pinned and invoked through Mise. Do not maintain Node, Deno, or browser-runtime compatibility for the privileged broker process.
@accept Use `Bun.secrets` as the initial keychain port: Windows Credential Manager on Windows, Keychain Services on macOS, and libsecret-compatible services on Linux. Do not build a parallel DPAPI vault while this API satisfies the contract.
@accept Keep provider tokens, refresh tokens, and other secret material in the operating-system credential store. On Windows, credentials are per-user, backed by Windows Credential Manager and DPAPI through Bun rather than broker-owned encryption at rest.
@accept Treat `Bun.secrets` as an experimental runtime API behind a narrow broker-owned `SecretStore` adapter. Pin the supported Bun version and prove get, replace, delete, persistence, size limits, unavailable-service behavior, and upgrade compatibility before release.
@accept Store only nonsecret grant metadata in the user profile: credential reference, provider, account label, canonical project binding, scopes, environment, issue time, local expiry, renewal policy, and redacted audit events.
@accept Persist broker-owned nonsecret authority, recovery, replay, consent, lease, and attempt state in one versioned per-user SQLite database through a narrow journal port. Secret values remain exclusively in `Bun.secrets`; PM2 remains authoritative for live processes; bounded output remains outside the database.
@accept A Teleport cartridge may declare a credential requirement or carry a deliberately exported recipient-encrypted secret-transfer capability, but it is never the default live vault and never grants authority merely because it was imported.

### @decision @accepted encrypted CAR is the explicit portability channel
@accept Support deliberate export from the broker/keychain into a recipient-encrypted and signed CAR for backup, provisioning, or transfer between user-controlled devices. Plain CAR export of secret material is forbidden.
@accept Support deliberate import from an encrypted CAR into the destination broker and OS keychain. A decrypted cartridge is transient input, never the destination live vault.
@accept Model a versioned secret-transfer capability containing provider, account identity, secret kind, secret bytes, upstream expiry when known, factual provider scopes, intended recipient, issue time, transfer expiry, and unique transfer id.
@accept Keep local project grants out of portable authority. Provider scopes may travel as factual constraints, but the destination broker independently establishes project binding, permitted operations, local expiry, and consent.
@accept Import verifies graph integrity, signature policy, intended recipient, transfer expiry, replay state, capability schema, and provider constraints before opening the broker-owned PIN/passphrase unlock prompt with redacted transfer and destination-recipe identity.
@accept Successful PIN/passphrase unlock is the import consent act. Import then writes through the `SecretStore` port, creates a separately scoped local recipe grant, records the transfer id as consumed, and discards decrypted secret bytes as promptly as the runtime permits.
@accept Export and import diagnostics, receipts, manifests, filenames, logs, and audit records contain only redacted metadata and content identifiers; they never contain plaintext secret values.

### @decision @accepted consent and blast-radius model
@memory ../memories/teleport/broker/broker-request-grant-transfer-state-machines.md
@memory ../memories/teleport/broker/broker-secret-values-and-lifetime.md
@accept Optimize for preventing accidental disclosure through chat, repositories, shell history, logs, broad environment inheritance, and unrelated projects. Do not claim containment against arbitrary malicious code already executing as the same OS user.
@accept Bind every grant to a canonical project root, provider, account/environment, explicit scopes or operations, expiry, and credential injection name. Reject symlink, path-alias, or working-directory ambiguity before release.
@accept The trusted prompt displays the requesting executable, canonical project, provider, requested scopes, duration, account/environment, requested delivery mode, and any scope escalation before the user approves.
@accept Default grants expire locally within 24 hours or sooner. Provider-side short-lived credentials remain preferable; local expiry cannot revoke a still-valid upstream static token.
@accept CAR PIN/passphrase entry is local proof of import consent, not authentication to the upstream provider and not sufficient by itself to mint or renew an upstream credential. Provider renewal requires valid refresh/token-exchange authority or fresh provider authentication.
@accept Ordinary credential enrollment uses a broker-owned masked prompt for entry of the requested key; entering and accepting that key is the consent act. An unchanged vetted recipe requesting an existing credential in a new repository requires a broker-owned repository-approval prompt, but no PIN, Windows Hello, reusable access code, or key re-entry is inherently required.
@accept A PIN or passphrase is used only to decrypt/import or refresh local credentials from an encrypted CAR protection profile. It authorizes local decryption/import, never authenticates to a provider, widens a project grant, or renews an upstream credential without actual refresh authority.

### @decision @accepted secret delivery hierarchy
@memory ../memories/teleport/broker/broker-secret-values-and-lifetime.md
@memory ../memories/teleport/broker/broker-explicit-effect-environment.md
@memory ../memories/teleport/broker/broker-cooperative-bootstrap-entrypoint.md
@accept Prefer a broker-mediated scoped API client, signed request service, or provider operation handle that never exposes raw token text to application code.
@accept Provide recipe execution as the compatibility path: invoking `recipe-runner.js` with a repository and checked-in recipe resolves an approved repository-scoped grant and supplies only the recipe-declared credentials to that leaf and its descendants.
@accept A JS/TS client package may request a scoped client, operation handle, or explicit secret lease. It cannot mutate the environment of its parent shell merely by being imported.
@accept Raw secret retrieval and environment injection are explicitly labeled elevated compatibility operations, short-lived in memory, unavailable to unrelated project roots, and excluded from diagnostics.
@accept Never place secrets in command-line arguments, process titles, persisted `.env` files, repository files, cartridge manifests, ordinary IPC messages, audit logs, or crash reports.
@accept For cooperative Bun/JS/TS targets, require an explicit awaited bootstrap entrypoint that completes the private credential exchange before dynamically importing application code. A bare unordered side-effect import is not the normative initialization contract.

### @decision @accepted Git-scoped recipe command authority
@memory ../memories/teleport/broker/broker-git-recipe-command-authority.md
@memory ../memories/teleport/broker/broker-consent-and-car-unlock.md
@memory ../memories/teleport/broker/broker-pk-recipe-runner-adoption.md
@memory ../memories/teleport/broker/broker-universal-process-receiver.md
@memory ../memories/teleport/broker/broker-recipe-v1-wire-revision-contract.md
@accept Require a checked-in recipe located inside a canonical Git worktree for every secret-bearing child launch. Ad hoc command strings, recipes outside Git, and unbound working directories fail closed.
@accept Use `pk`'s implemented XML recipe format and typed direct/PM2/observe leaf semantics as the V1 recipe contract. Ignore its proposed, scaffolded, partial, or unrelated resource/compose features until independently admitted here.
@accept Bind a grant to repository identity, canonical worktree root, recipe-relative path, the exact validated recipe revision, requested credential slots, and local expiry. The recipe is the reviewed authority description; executable, script, package manifest, lockfile, and dependency-tree hashes are not required.
@accept A recipe revision may use canonical typed equality or a digest as a compact comparison key, but that value is only recipe-version identity. Never describe it as executable or interpreted-code integrity.
@accept Native, script, interpreter, Mise, uv, and other argv-safe entrypoints are permitted as declared by the recipe. Preserve the high-velocity behavior of interpreted projects: ordinary source, package metadata, and lockfile changes do not invalidate authorization when the recipe itself is unchanged.
@accept Copying the same vetted recipe to another Git repository preserves its reviewed recipe semantics but not local authority. The new canonical repository requires explicit user approval and receives a distinct grant.
@accept On every execution the privileged broker independently resolves Git/worktree and recipe identity, validates the typed recipe and grant, and prepares the declared credential delivery. The selected backend receiver—not an unbounded direct spawn—owns materialization, process lifecycle, observation, cancellation, and cleanup. Caller-supplied repository or recipe claims are never authoritative.
@accept Preserve agentic observability for authorized recipes: live or cursor-based stdout/stderr, bounded tails, stream offsets, state transitions, probes, readiness, lifecycle facts, cleanup facts, and actionable typed failures. The threat model assumes a vetted recipe and well-behaved agent; the broker does not promise to redact a credential deliberately printed by the authorized child.
@accept Version the admitted XML recipe as `wx.recipe/v1`, fail closed on unknown authority-bearing fields, and bind grants to a domain-separated digest of the canonical fully resolved semantic recipe rather than raw XML bytes. Formatting-only changes do not revoke approval; effective recipe, inherited-base, lifecycle, receiver, or credential-slot changes do.

### @decision @accepted adopt and harden pk IPC and lifecycle semantics
@memory ../memories/teleport/broker/broker-pk-recipe-runner-adoption.md
@memory ../memories/teleport/broker/broker-universal-process-receiver.md
@memory ../memories/teleport/broker/broker-universal-process-contract.md
@memory ../memories/teleport/broker/broker-process-receiver-algebra.md
@memory ../memories/teleport/broker/broker-direct-receiver-materialization.md
@memory ../memories/teleport/broker/broker-agent-objective-observability.md
@memory ../memories/teleport/broker/broker-receiver-secret-delivery.md
@memory ../memories/teleport/broker/broker-python-uv-windows-job-receiver.md
@memory ../memories/teleport/broker/broker-bake-recipe-kernel-extraction.md
@memory ../memories/teleport/broker/broker-local-recipe-integration-and-bundling.md
@memory ../memories/teleport/broker/broker-recipe-parity-provenance-and-cutover.md
@memory ../memories/teleport/broker/broker-inherited-ipc-v1-contract.md
@memory ../memories/teleport/broker/broker-host-owned-pm2-prerequisite.md
@memory ../memories/teleport/broker/broker-cooperative-bootstrap-entrypoint.md
@memory ../memories/teleport/broker/broker-durable-bootstrap-authority-and-cleanup.md
@memory ../memories/teleport/broker/broker-windows-process-tree-conformance.md
@accept Adopt the implemented `pk` recipe parsing, parameter resolution, receiver-specific leaf execution, preflight, exact-name lifecycle, structured status/events, bounded output tails, stream facts, probe/readiness, timeout/cleanup, orphan/stale reporting, and heartbeat tick/tock cursor concepts.
@accept PM2 is the required Windows V1 backend receiver for every agent-launched recipe, including one-shot, bounded foreground, intentionally long-lived, and service commands. V1 assumes a compatible PM2 daemon is already running as host-owned infrastructure; Nebular does not install, start, stop, restart, upgrade, save, resurrect, or otherwise manage the daemon.
@accept The backend-neutral `ProcessReceiver` contract admits PM2 first and later systemd, launchd, containers, schedulers, or other supervisors without changing recipe, broker, heartbeat, or agent-facing lifecycle semantics.
@accept Avoid Hono, localhost, a persistent broker service, and a resident per-process Bun wrapper in V1. `recipe-runner.js` uses short-lived broker operations over inherited Bun IPC; PM2 directly materializes and manages the requested command.
@accept Keep observation outside a resident wrapper: combine PM2 exact-name state/logs/restarts, output cursors, declared probes, process facts, recipe progress signals, and agent/control-side monotonic evaluation. Cooperative applications may emit heartbeat/progress facts without becoming a second supervisor.
@accept Credential delivery is capability-selected. Bun/JS/TS targets use an imported bootstrap that invokes a short-lived broker helper and installs authorized values inside the already-PM2-managed target process. Other runtimes require an equivalent cooperative adapter or receiver-native secret mechanism; unsupported generic delivery fails typed rather than adding a permanent Bun capsule.
@accept Reuse or extract behavior into this project without taking a runtime dependency on `R:/Code/pk`. Treat resource-backed leaves, composition, asset resolution, and heartbeat service wiring as unavailable unless source and tests prove them complete and this roadmap separately admits them.
@accept V1 proves the enhanced lifecycle and IPC path on Windows. The domain protocol, runner states, and transport ports remain cross-platform for later Bun-backed macOS/Linux proof.
@accept Preserve the `pk`-derived recipe and universal `ProcessReceiver` contracts independently of backend choice. A Python/uv Windows Job Object receiver is a deferred alternative that may replace PM2 only after it proves the same recipe, observation, secret-delivery, recovery, cancellation, and conformance contracts; it is not part of the active V1 implementation sequence.
@accept Continue proving generic recipe behavior in Bake while its recipe package remains coupled, then freeze an admitted kernel and transplant its TypeScript source plus fixtures into this workspace. Do not import `@bake/recipe`, a compiled Bake bundle, or Bake workspace paths at runtime or build time.
@accept After transplant, wx-teleport-cartridge owns its recipe kernel and broker extensions. Layered local TypeScript is bundled independently into `recipe-runner.js` and `broker.js`; shared recipe code may be duplicated across those artifacts because an undeclared shared runtime chunk is forbidden.
@accept Use inherited Bun IPC with a versioned bounded one-request protocol for short-lived runner/broker control. Use a distinct narrowly typed secret-bearing bootstrap exchange only during authorized target initialization; never mix secret payloads into ordinary status, audit, journal, or observation envelopes.
@accept Do not add PM2 or Node as a Nebular package dependency for V1. The receiver adapter probes the already-running host PM2 service and returns a typed prerequisite failure when it is absent, unreachable, or incompatible; remediation remains outside Nebular.
@accept Run Windows PM2 tree-cleanup proof before receiver implementation expands. Failure to prove exact descendant cleanup disqualifies PM2 for the affected lifecycle contract and must not be repaired with a resident per-target wrapper.
@accept No recipe is operationally unbounded: one-shot attempts require a completion deadline; long-lived/service attempts require startup/readiness bounds, liveness or stall policy, observation heartbeat, cancellability, and exact stop/delete semantics. Intentional indefinite service lifetime does not mean unbounded startup, silence, failure, or cleanup.
@accept A secret-bearing managed attempt retains an active secret lease for its process lifetime. Grant expiry or revocation blocks reuse and triggers the recipe's exact safe-stop/delete policy; recipes without a safe termination policy cannot receive an expiring secret lease in V1.

### @decision @accepted four TypeScript upstream entrypoints
@memory ../memories/teleport/broker/broker-four-upper-level-domains.md
@memory ../memories/teleport/broker/broker-four-domain-atomic-quality-harness.md
@memory ../memories/teleport/contracts/teleport-colocated-domain-seam-vitest.md
@memory ../memories/teleport/broker/broker-eslint-flat-config-specification.md
@memory ../memories/teleport/broker/broker-four-artifact-type-boundaries.md
@memory ../memories/teleport/broker/broker-typescript-project-and-compiler-matrix.md
@memory ../memories/teleport/broker/broker-import-and-authority-boundary-enforcement.md
@memory ../memories/teleport/broker/broker-epsilonode-nebular-esm-distribution.md
@accept Create the new public GitHub repository `epsilonode/nebular` and commit four stable root TypeScript entrypoints: `teleport.ts`, `broker-client.ts`, `recipe-runner.ts`, and `broker.ts`.
@accept The canonical upstream prefix is `epsilonode/nebular`, never `wx` or `@wx`; if package-style identity is required, use `@epsilonode/nebular`.
@accept Each entrypoint is addressable through `https://esm.sh/gh/epsilonode/nebular@<immutable-ref>/<entrypoint>.ts`; production examples and lockfiles pin a release tag or full commit rather than a floating branch.
@accept Preserve layered TypeScript source behind the four thin public entrypoints. Committing public `.ts` entrypoints does not require collapsing the maintained implementation into four monolithic source files.
@accept Treat those four deliverables as the V1 upper-level production domains: portable `teleport`, unprivileged `broker-client`, unprivileged `recipe-runner`, and privileged `broker`. Keep finer codec, protection, transport, restore, policy, receiver, and adapter ownership nested inside them until a concrete authority or independent-verification seam warrants another internal domain gate.
@accept Enforce the acyclic public dependency graph `teleport <- broker-client <- recipe-runner` while allowing `broker` to consume public `teleport` and `broker-client` contracts; `broker` never imports `recipe-runner`, and supporting test/tooling classes never become production domains.
@accept `teleport.ts` and its generated `.js` mirror contain portable capability contracts, codecs, CAR graph handling, protection, signatures, restore planning, and transport ports; they contain no broker, keychain, consent, process-launching, or provider-refresh implementation.
@accept `broker-client.ts` and its generated `.js` mirror contain unprivileged versioned IPC contracts and request/grant/lease client behavior; importing either neither accesses `Bun.secrets` nor starts a broker.
@accept `recipe-runner.ts` is the public unprivileged recipe CLI entrypoint. It parses a recipe for early diagnostics and sends a typed execution request, but it cannot authorize a recipe, retrieve a credential, construct a secret environment, or launch the secret-bearing child.
@accept `broker.ts` is the public Bun-only privileged broker and CLI entrypoint containing policy, consent, `Bun.secrets`, provider adapters, child-process launch, and encrypted credential CAR import/export orchestration.
@accept Do not compile or distribute a native executable. Run the privileged entrypoint or its generated `broker.js` mirror using the Mise-pinned Bun runtime so runtime provenance, upgrades, and workspace tooling policy remain explicit.
@accept Bun bundles TypeScript entrypoints to JavaScript with code splitting disabled so the runtime distribution remains exactly four files and does not depend on implicit shared chunks.
@accept Emit TypeScript declarations as a separate minimal type tree or bundle one declaration entry per public artifact; declarations do not count as runtime artifacts.
@accept Keep sourcemaps optional and outside release artifacts by default because privileged source maps increase audit surface and may capture build paths or literals.
@note `wx.recipe/v1` and application capability ids are protocol namespaces, not the GitHub/package upstream prefix; do not rename them merely because repository ownership changes.

### @decision @accepted hard functional programming target
@memory ../memories/teleport/broker/broker-hard-fp-enforcement-policy.md
@memory ../memories/teleport/broker/broker-eslint-flat-config-specification.md
@memory ../memories/teleport/broker/broker-typescript-project-and-compiler-matrix.md
@memory ../memories/teleport/broker/broker-fp-runtime-package-contract.md
@memory ../memories/teleport/broker/broker-result-effect-interoperation.md
@memory ../memories/teleport/broker/broker-import-and-authority-boundary-enforcement.md
@memory ../memories/teleport/broker/broker-fp-verification-and-exception-governance.md
@accept Treat purity and typed effects as authority boundaries, not optional style. Protocol, codec, migration, policy, planning, reducers, state machines, and projections are deterministic and immutable; effects enter through named ports and leaf adapters.
@accept Execute a hard, fast, dependency-ordered migration with zero-warning target profiles. Temporary exclusions require an explicit bounded inventory and are removed before the broker feature gate closes.
@accept Standardize portable/client expected-failure composition on pinned neverthrow, exhaustive state matching on ts-pattern, selected immutable transformations on Remeda, and ordinary JSON/CLI/IPC/profile validation on Zod; retain Teleport-specific canonical and bounded decoders.
@accept Use Effect only inside privileged `broker.js` for structured concurrency, cancellation, scoped resource finalization, redacted values, schedules, and typed service layers. Effect types and requirements never enter `teleport.js`, `broker-client.js`, IPC documents, or CAR schemas.
@accept Enforce separate type-aware lint profiles for pure domains, effect adapters, Svelte reactivity, tests, and tooling; adapter exceptions relax mechanics only and never relax typed outcomes, promise safety, redaction, or dependency direction.
@accept This roadmap and its linked memories contain the complete implementation policy. Associated workspaces may be cited as evidence or consumers but are not normative configuration, code, or documentation dependencies.

## @tier8 implementation sequence

### @work @done hard FP tooling and fast migration
@memory ../memories/teleport/broker/broker-four-upper-level-domains.md
@memory ../memories/teleport/broker/broker-four-domain-atomic-quality-harness.md
@memory ../memories/teleport/contracts/teleport-colocated-domain-seam-vitest.md
@memory ../memories/teleport/broker/broker-hard-fp-enforcement-policy.md
@memory ../memories/teleport/broker/broker-eslint-flat-config-specification.md
@memory ../memories/teleport/broker/broker-typescript-project-and-compiler-matrix.md
@memory ../memories/teleport/broker/broker-fp-runtime-package-contract.md
@memory ../memories/teleport/broker/broker-result-effect-interoperation.md
@memory ../memories/teleport/broker/broker-import-and-authority-boundary-enforcement.md
@memory ../memories/teleport/broker/broker-associated-workspace-hard-migration.md
@memory ../memories/teleport/broker/broker-fp-verification-and-exception-governance.md
@memory ../memories/teleport/broker/broker-typing-fp-implementation-sequence.md
@accept Pin the complete type-aware ESLint, functional, boundaries, TypeScript, and runtime FP dependency set; no security-sensitive dependency uses an unbounded or floating version.
@evidence `mise.toml`, `package.json`, and `bun.lock` pin Bun 1.4.0, Node 22.23.2, TypeScript 6.0.2, neverthrow 8.2.0, Effect 3.22.1, Remeda 2.42.0, ts-pattern 5.9.0, Zod 4.4.3, fast-check 4.9.0, fast-xml-parser 5.9.3, ESLint 10.9.0, typescript-eslint 8.67.0, functional 10.0.0, boundaries 7.2.0, and `@types/bun` 1.4.0 with exact versions and a frozen lockfile.
@evidence On 2026-08-23, a clean `mise run verify` passed zero-warning type-aware lint, all five domain/artifact compiler projects plus the dedicated compile-negative project, 51 deterministic test files/226 tests, eight negative lint fixtures, 22 exact production exception surfaces, declarations, the isolated package-consumer fixture, exact four-artifact emission, inert imports, credential-literal scans, and authority-graph/path scans. The temporary migration inventory is empty; any exception-path or disabled-rule drift now fails the policy gate.
@accept Add self-contained flat-config profiles and negative lint fixtures before migrating source, including parser services and explicit pure/adapter/Svelte/test/tooling ownership.
@accept Split compiler projects and ambient types before broker adapters land; add exact artifact import topology and default-disallow dependency policies.
@accept Give every Broker domain a named conservative Vitest project with colocated atomic tests; reserve `.seam.test.ts` for precise public-boundary composition and `.live.test.ts` for explicit host-dependent proof.
@accept Give each of the four upper-level domains `lint:<domain>`, `typecheck:<domain>`, `test:<domain>`, and composed `check:<domain>` commands. Root verification composes them in dependency order, then runs seam and artifact conformance; shared lint rules execute through scoped domain gates without redundantly linting all production source first.
@accept Treat current `kernel` and `restore` test projects as transitional partitions of `teleport`. Preserve their evidence until domain directories and public surfaces exist, then consolidate their test ownership under `test:teleport`; retain `configuration`, `seam`, and opt-in `live` as supporting harness classes.
@accept Migrate result/error composition, identifiers, codecs, state machines, restore execution, and effect ports in the linked dependency order, removing old expected-failure APIs in the same bounded slice.
@accept Complete each associated workspace independently from the specifications here; do not import or point at an external project's configuration as the implementation contract.

### @work @partial strengthen typing and functional boundaries
@memory ../memories/teleport/broker/broker-domain-types-and-boundary-parsing.md
@memory ../memories/teleport/broker/broker-result-task-result-and-error-algebra.md
@memory ../memories/teleport/broker/broker-codec-adt-and-registry-boundary.md
@memory ../memories/teleport/broker/broker-typed-restore-effects-and-recovery.md
@memory ../memories/teleport/broker/broker-request-grant-transfer-state-machines.md
@memory ../memories/teleport/broker/broker-secret-values-and-lifetime.md
@memory ../memories/teleport/broker/broker-explicit-effect-environment.md
@memory ../memories/teleport/broker/broker-capability-specific-ports.md
@memory ../memories/teleport/broker/broker-four-artifact-type-boundaries.md
@memory ../memories/teleport/broker/broker-typing-fp-implementation-sequence.md
@memory ../memories/teleport/broker/broker-hard-fp-enforcement-policy.md
@memory ../memories/teleport/broker/broker-fp-runtime-package-contract.md
@memory ../memories/teleport/broker/broker-result-effect-interoperation.md
@accept Parse unknown values once into constructed domain types; use branded ids, references, paths, scopes, versions, instants, and durations internally rather than repeatedly validating primitives.
@accept Move portable/client result composition behind a project façade over pinned neverthrow, preserving Teleport warnings as `Warned<T>` and failures as nonempty structured issue families; use Effect only inside the privileged broker runtime.
@accept Express raw versus structured codecs, current-only versus migrating schemas, request/grant/lease/import states, execution outcomes, and adapter capabilities as discriminated unions that exclude invalid combinations.
@accept Keep pure policy, planning, codec, migration, and state-transition functions separate from explicit clock, entropy, crypto, keychain, consent, audit, IPC, process, provider, filesystem, and journal ports.
@accept Replace unstructured restore stage/receipt tokens and exception control flow with typed handlers, direct task-result composition, cancellation, and explicit rollback, cleanup, and recovery-required outcomes.
@accept Enforce portable, client, runner, and privileged authority through separate compiler projects and import graphs in addition to the four output entrypoints.
@evidence The four domains now own constructed primitives, nonempty typed issue channels, closed IPC/recipe/bootstrap decoders, immutable codec/protection/transport/restore plans, sealed consent/grant states, provider-indexed sealed scope vocabularies, explicit runtime ports, callback-scoped secret leases, and a broker-only Result-to-Effect/finalization boundary with redacted Exit projection. The dedicated compile-negative gate proves parsed-to-policy and pending-to-active states cannot be skipped, provider scopes cannot cross witnesses or forge seals, and plaintext cannot stand in for a credential reference.
@proof_gap Additional warning/report combination laws and any remaining legacy Teleport result conventions still require focused admission rather than repository-wide mechanical rewrites.

### @work @partial expand domain algebras and lawful composition
@memory ../memories/teleport/broker/broker-trust-state-transition-algebra.md
@memory ../memories/teleport/broker/broker-scope-and-authority-lattice.md
@memory ../memories/teleport/broker/broker-temporal-authority-algebra.md
@memory ../memories/teleport/broker/broker-possession-versus-authority-algebra.md
@memory ../memories/teleport/broker/broker-provider-indexed-contract-algebra.md
@memory ../memories/teleport/broker/broker-validation-versus-operation-composition.md
@memory ../memories/teleport/broker/broker-reducer-decision-effect-algebra.md
@memory ../memories/teleport/broker/broker-composable-plan-algebra.md
@memory ../memories/teleport/broker/broker-report-combination-algebras.md
@memory ../memories/teleport/broker/broker-secret-exposure-state-algebra.md
@memory ../memories/teleport/broker/broker-codec-witness-algebra.md
@memory ../memories/teleport/broker/broker-optics-adoption-policy.md
@memory ../memories/teleport/broker/broker-property-and-type-proof-strategy.md
@memory ../memories/teleport/broker/broker-algebra-ownership-lint-contract.md
@memory ../memories/teleport/broker/broker-domain-algebra-implementation-sequence.md
@accept Introduce opaque trust states only where verification, authority, durability, reversibility, or secret exposure changes; successor constructors remain private to total transition functions.
@accept Replace scope arrays and ad hoc expiry arithmetic with provider-indexed scope lattices and a temporal algebra whose intersection laws guarantee grants and leases can only narrow authority.
@accept Keep stored credential possession, factual provider authority, local project grants, and operation leases as incompatible domains. Portable import never constructs local authority.
@accept Model provider vocabularies and capabilities through indexed contracts with one audited dynamic registry erasure point; missing provider authority fails during planning rather than optional-method probing.
@accept Separate accumulating warning-preserving validation from fail-fast dependent operations, and define lawful deterministic combination separately for warnings, issues, audit, receipts, rollback, cleanup, recovery, and redaction.
@accept Drive broker lifecycles through pure reducers that return next state, closed effect commands, audit facts, and warnings; interpreters return correlated events and cannot choose policy or mutate domain state directly.
@accept Compose credential operations as validated declarative plans with dependencies, resources, authority, confirmation, exposure class, idempotency, retry, verification, rollback, and recovery metadata before binding handlers.
@accept Represent secret reference, encrypted bytes, scoped plaintext, operation handle, and lease identity as incompatible exposure states; plaintext exists only inside an authorized scoped interpreter operation.
@accept Strengthen codecs with typed witnesses and typed encoded blocks while separating migration, dependency, restore planning, and effects; confine unavoidable generic erasure to registries.
@accept Add property-law tests with pinned fast-check, compile-negative fixtures, and algebra-ownership lint. Do not add optics unless measured nested immutable update pressure satisfies the linked adoption gate.
@evidence Pure authority request/grant reducers now emit closed consent/journal effects, audit facts, warnings, and terminal projections; lease states separate reference/authorization/plaintext exposure; receiver plans and observations are closed; secret-transfer plans separate portable facts from destination authority. The provider-indexed contract algebra now seals scope sets, validates acyclic implication vocabularies, implements normalization/containment/intersection/request-union/difference, confines dynamic erasure to one registry witness, rejects unsupported capabilities before decoder/effect execution, and proves its bounded laws plus compile-negative cross-provider separation.
@evidence 2026-09-04 Named report combinators now combine warnings, audit facts, and per-step recovery facts with deterministic semantic-identity deduplication, associative empty identity, canonical ordering, no failure/journal-obligation loss, and monotonic redaction. Fast-check proves report associativity; focused examples prove deterministic audit order and stricter-redaction retention. `mise exec -- bun run check:broker` passes 601 tests.
@evidence 2026-09-04 The new declarative broker-plan algebra validates explicit authority, exposure, confirmation, deadline, idempotency, verification, retry, rollback, journal, dependency, and resource-ownership fields before producing an immutable canonical plan. Composition is closed through plan revalidation; it deterministically topologically orders independent steps, rejects cycles, missing dependencies, duplicate identities, unsafe exposure/confirmation pairs, impossible rollback or journal combinations, and unordered shared-resource operations. Focused tests cover every rejection class and fast-check proves associative composition for independent plans; `mise exec -- bun run check:broker` passes 604 tests.
@evidence 2026-09-04 Generated request-expiry reducer laws now prove deterministic reduction and terminal non-replayability across bounded issued-at/duration inputs; `mise exec -- bun run check:broker` passes 605 tests in 59 files.
@evidence 2026-09-04 Generated grant-persistence reducer laws now prove deterministic pending-to-active reduction across bounded valid persistence times and reject replay against the active successor; `mise exec -- bun run check:broker` passes 606 tests in 59 files.
@evidence 2026-09-04 Generated encrypted-transfer admission laws now prove fresh-plan determinism across bounded scope subsets and valid times while a consumed replay is rejected before any commit plan; `mise exec -- bun run check:broker` passes 607 tests in 59 files.
@evidence 2026-09-04 Generated Result-faÃ§ade laws now prove left identity, associative dependent composition, and typed nonempty conversion of thrown mechanics at the broker boundary; `mise exec -- bun run check:broker` passes 609 tests in 60 files.
@proof_gap Broader durable replay and remaining grant-lifecycle reducer laws remain open. A second materially different real provider is still required before claiming the provider abstraction universal. Optics remain deliberately unadopted because no measured pressure justifies them.

### @work @partial define closed broker contracts and threat model
@memory ../memories/teleport/broker/broker-domain-types-and-boundary-parsing.md
@memory ../memories/teleport/broker/broker-result-task-result-and-error-algebra.md
@memory ../memories/teleport/broker/broker-request-grant-transfer-state-machines.md
@memory ../memories/teleport/broker/broker-secret-values-and-lifetime.md
@memory ../memories/teleport/broker/broker-git-recipe-command-authority.md
@memory ../memories/teleport/broker/broker-consent-and-car-unlock.md
@accept Define request, grant, credential-reference, lease, consent, renewal, revocation, audit, provider-adapter, secret-delivery, and typed-diagnostic contracts before implementing a UI or provider integration.
@accept Document protected assets, trust boundaries, same-user limitations, process inheritance behavior, clipboard prohibition, memory lifetime, logging/redaction rules, and recovery behavior after broker or client termination.
@accept Separate local grant expiry, secret lease expiry, provider-token expiry, and refresh authority; never infer one from another.
@accept Version broker IPC and persisted nonsecret metadata independently from Teleport capability schemas.
@evidence Broker/client contracts now cover versioned control and secret-bootstrap IPC, repository/recipe grants, consent evidence, leases, revocation/expiry, nonsecret journal records, receiver lifecycle/observation, secret delivery, and encrypted-transfer replay/transaction outcomes. The trusted-prompt algebra binds every displayed identity fact to broker-derived awaiting-consent state, requires a distinct masked clipboard-free window, and sends callback-scoped input directly to the secret-store port; security seams reject path/revision/slot drift, mismatched attempts, expired authority, replay, recipient/signature failures, and secret-bearing diagnostics.
@proof_gap The production Windows trusted-prompt host and spoofing proof do not exist. Provider renewal, same-user IPC impersonation analysis, DLL/module/clipboard/crash-dump limits, and end-to-end hostile-process tests remain open.

### @work @partial implement OS-backed vault and local broker
@memory ../memories/teleport/broker/broker-bun-1-4-runtime-capabilities.md
@memory ../memories/teleport/broker/broker-secret-values-and-lifetime.md
@memory ../memories/teleport/broker/broker-explicit-effect-environment.md
@memory ../memories/teleport/broker/broker-capability-specific-ports.md
@memory ../memories/teleport/broker/broker-sqlite-nonsecret-authority-journal.md
@memory ../memories/teleport/broker/broker-inherited-ipc-v1-contract.md
@memory ../memories/teleport/broker/broker-durable-bootstrap-authority-and-cleanup.md
@memory ../memories/teleport/broker/broker-host-owned-pm2-prerequisite.md
@memory ../memories/teleport/broker/broker-windows-process-tree-conformance.md
@blocker Keep production bootstrap unavailable until the SQLite schema/adapter atomically rejects a second nonterminal lease claim, attempts durably locate their grant/receiver/checked-in recipe, a production Git recipe re-reader and trusted profile-root adapter exist, and PM2 plus OS facts prove the helper parent is the exact current managed attempt. The reusable PM2 receiver and Windows descendant-containment proof remain separate required receiver gates.
@evidence `Bun.secrets` is confined behind broker-owned callback-scoped read/write ports; the Bun 1.4.0 Windows live harness proves replace/read/delete/missing cleanup against the real OS keychain. The versioned Bun SQLite adapter proves ten real transactional cases with 46 expectations including consent+grant atomicity, CAS leases, replay, corruption, lock bounds, trusted profile paths, and connection cleanup. The durable bootstrap authority algebra joins grant/attempt/current-receiver/current-recipe ports, exact repository/revision/generation/receiver/attempt/slot facts, a broker clock/entropy source, atomic claim semantics, and the closed `authorized -> active|revoked`, `active -> consumed|revoked` transition set.
@evidence The live two-process Bun bootstrap harness proves independent authority revalidation at its test composition root, private inherited IPC, atomic current-process environment installation, acknowledgement, deferred import ordering, clean helper exit, redacted receipt shape, and no orphan helper. The public `broker.ts` root deliberately exits 78 before the bootstrap handshake because the production SQLite/Git/PM2/Windows adapters above are not admitted; this is fail-closed evidence, not production bootstrap completion.
@accept Run broker control as short-lived Bun child processes over inherited IPC. Do not start a local HTTP server, open a TCP listener, or require singleton endpoint discovery in V1.
@accept Implement create, resolve, lease, revoke, expire, enumerate-redacted, and rotate-reference operations through the broker-owned `SecretStore` port backed initially by `Bun.secrets`.
@accept Derive stable, collision-resistant Bun `service` and `name` identifiers from the broker namespace and opaque credential reference; keep provider, project, scope, and expiry metadata outside the secret value and never use secret content as an identifier.
@accept Keep secret bytes inside the broker except during an explicitly authorized delivery operation; zero or release buffers as promptly as the runtime permits.
@accept Implement the journal initially with pinned Bun `bun:sqlite`, explicit schema migrations, transactional state/event writes, bounded lock waits, current-user filesystem protection, and typed recovery for interrupted consent, keychain mutation, rotation, revocation, renewal, CAR replay commits, and process-attempt transitions.

### @work @partial build trusted key-entry and CAR-unlock UI plus minimal CLI
@memory ../memories/teleport/broker/broker-deferred-console-provider-integration-gates.md
@memory ../memories/teleport/broker/broker-consent-and-car-unlock.md
@blocker Select and implement the production Windows prompt host and complete the production broker bootstrap authority composition before any secret/PIN entry flow is user-operable.
@evidence The broker-owned trusted-prompt algebra and seam suite now derive prompt identity from awaiting-consent authority, require a distinct user-visible broker window with masked input and forbidden clipboard, keep `SecretInput` callback-scoped, write through the `Bun.secrets` port, and return only redacted enrollment receipts/events. No Windows console/GUI host or CAR PIN/passphrase host is implemented.
@accept The CLI supports `request`, `run`, `status`, `revoke`, and `doctor` flows and opens a separate broker-owned console for masked key entry or encrypted-CAR PIN/passphrase entry. Ordinary existing authorized recipe runs do not display a second approval prompt.
@accept The agent-facing process receives a typed approval/denial result, never keystrokes, PINs, refresh tokens, or secrets entered into the trusted window.
@accept Consent prompts resist request spoofing by displaying broker-derived executable and canonical project identity rather than trusting caller-provided labels alone.
@accept Cancellation, timeout, denial, expired grants, unavailable keychain, scope mismatch, and provider-authentication failure return distinct redacted diagnostics.

### @work @partial add child-process and JS/TS clients
@memory ../memories/teleport/broker/broker-request-grant-transfer-state-machines.md
@memory ../memories/teleport/broker/broker-secret-values-and-lifetime.md
@memory ../memories/teleport/broker/broker-git-recipe-command-authority.md
@memory ../memories/teleport/broker/broker-pk-recipe-runner-adoption.md
@memory ../memories/teleport/broker/broker-universal-process-receiver.md
@memory ../memories/teleport/broker/broker-process-receiver-algebra.md
@memory ../memories/teleport/broker/broker-direct-receiver-materialization.md
@memory ../memories/teleport/broker/broker-agent-objective-observability.md
@memory ../memories/teleport/broker/broker-receiver-secret-delivery.md
@memory ../memories/teleport/broker/broker-inherited-ipc-v1-contract.md
@memory ../memories/teleport/broker/broker-cooperative-bootstrap-entrypoint.md
@memory ../memories/teleport/broker/broker-durable-bootstrap-authority-and-cleanup.md
@blocker The public control-child route now composes the production durable-authority, Git, SQLite, Windows Job, PM2 AMP-v1, inherited-IPC, launch, terminal-observation, and cleanup leaves. The production bootstrap-child resolver remains fail-closed where its own ports are unavailable. Neither route is release-ready until the installed four-artifact live E2E proves the complete PM2-managed cooperative launch, durable bootstrap bind, exact PM2 upgrade, terminal cleanup, artifact release, and no-exposure result on the real host.
@evidence `broker-client` now has bounded ordinary control IPC, a real Bun inherited-IPC helper spawn, a distinct closed secret-bootstrap protocol, atomic environment-patch planning and current-process installation, deferred application import, callback-opaque secret values, and grant-to-lease-to-bootstrap seams. The private install cleanup capability rolls back after inconsistent receipts, acknowledgement/send/timeout/disconnect/helper-exit failures, and deferred import rejection; the Bun adapter removes only newly installed names, in reverse, idempotently. Import remains inert and cannot access `Bun.secrets` or privileged broker modules.
@evidence The live two-process harness exercises the real Bun transport and process-environment leaves with a test authority composition and proves helper exit/no orphan. The installed four-artifact harness now additionally packs and installs all four artifacts into an isolated temporary Git consumer, provisions a keychain canary, commits a checked-in recipe, drives the real runner/broker/PM2 path, proves only a credential digest at the target, and removes the canary/workspace on every result. Its preflight passes. Focused Windows seams cover strict native-path PM2 metadata decoding, PM2 prepare dispatch/drain/wipe, exact-name ownership, durable reservation/replay, provisional bootstrap binding, Job-root observation, terminal-before-confirmation retention, exact containment upgrade, and cleanup-gated PM2 deletion.
@proof_gap The real installed live run is not yet successful. Current host evidence proves the target's managed Windows Job first effect was `assigned`, its domain-separated Job-identity commitment matches the broker's expected PM2 payload identity, and PM2/current broker sessions match; the broker's separately opened named-Job observation nevertheless remains `pending` until the bounded bootstrap deadline. The current native observation algebra conflates an absent Job name and an opened Job with zero process IDs; split those redacted states, then resolve the resulting native session/query or handle-lifetime discrepancy without weakening exact identity, policy, incarnation, membership, or durable-journal requirements. Rerun the complete installed E2E through successful terminal cleanup afterward.
@accept `recipe-runner.js` requests one checked-in Git-scoped recipe; one-shot broker control validates authority and materializes the requested command directly in PM2. A cooperative target bootstrap obtains declared credentials through a short-lived private broker exchange inside the managed process; no parent environment rewrite, `.env` file, or resident wrapper is introduced.
@accept The JS/TS package exposes request and scoped-operation APIs; raw-token access requires an explicit elevated method and policy approval.
@accept Clients reconnect safely, handle broker upgrades and lease expiry, and never cache secrets beyond the authorized operation lifetime.
@accept Conformance proves unrelated project roots, expired grants, broader scopes, and environment/account mismatches cannot reuse a grant.

### @work @open add browser broker client and authenticated bridge
@memory ../memories/teleport/broker/broker-browser-client-transport-and-trust.md
@memory ../memories/teleport/broker/broker-browser-client-public-surface-and-conformance.md
@memory ../memories/teleport/broker/broker-epsilonode-nebular-esm-distribution.md
@memory ../memories/teleport/broker/broker-four-artifact-type-boundaries.md
@decision A real browser client is an additive, separately named public artifact; it does not reclassify or weaken the existing Bun/inherited-IPC `broker-client` surface. Its public-path, package-export, declaration, artifact-count, and release-version change are explicit admission work rather than an accidental fifth output.
@blocker V1 broker control uses short-lived inherited Bun IPC and deliberately has no local HTTP/TCP listener or endpoint discovery. A browser cannot use that carrier, so no implementation begins until a broker-owned browser bridge has an approved transport, authentication, origin-binding, pairing, lifetime, revocation, and hostile-local-user threat contract.
@accept The browser entrypoint builds with the browser target and can name only browser-safe APIs plus portable/client contracts. Import, declaration, and artifact gates reject Bun, Node process/filesystem, keychain, child-process, recipe-runner, privileged broker, bootstrap-environment, and secret-delivery edges.
@accept The browser API carries typed, bounded intents and redacted progress/terminal outcomes only. The broker independently derives and revalidates every repository, recipe, scope, account/environment, grant, consent, and lifecycle fact; browser claims, labels, origin text, and returned handles are never authority.
@accept Pair a browser origin and current user session through an explicit broker-mediated ceremony with narrow expiry, replay resistance, cancellation/revocation, and no ambient localhost discovery. Raw credentials, credential plaintext, secret-bearing environment patches, cooperative bootstrap, and privileged recipe launch remain unavailable to browser code.
@accept Prove real-browser import and request/status/cancel behavior; allowed-origin success; wrong-origin, stale/replayed pairing, unauthenticated local peer, malformed/oversized message, broker restart, disconnect, cancellation, revocation, and expiry failure; no secret in DOM, browser storage, URL, console, network diagnostics, bundle, source map, or terminal receipt.
@accept Publish only after the bridge and browser artifact pass isolated package, immutable CDN/ref, and real-browser conformance. esm.sh may deliver a pinned released browser-safe artifact, but it is not the bridge, authentication mechanism, or source of authority.

### @work @deferred extract and localize the Bake recipe kernel
@memory ../memories/teleport/broker/broker-pk-recipe-runner-adoption.md
@memory ../memories/teleport/broker/broker-bake-recipe-kernel-extraction.md
@memory ../memories/teleport/broker/broker-local-recipe-integration-and-bundling.md
@memory ../memories/teleport/broker/broker-recipe-parity-provenance-and-cutover.md
@memory ../memories/teleport/broker/broker-recipe-v1-wire-revision-contract.md
@meta name=delegated-dev-target content="../../../../pk/proj-ledger/roadmaps/recipes.md#universal-pm2-receiver-and-reusable-one-shot-slots"
@meta name=integration-partner content="R:/Code/pk/proj-ledger/roadmaps/recipes.md#universal-pm2-receiver-and-reusable-one-shot-slots"
@meta name=integration-baseline content="Bake 7964fc9434a76b23c9d04f075b1a97f504a21805; Nebular 8396250"
@note Cross-repository contract: Bake owns generic recipe/receiver/containment substrate and hands it off by immutable source-and-proof packet; Nebular owns broker authority, secret delivery, local adaptation, packaging, and conformance. Both owners record the same candidate ID and status before starting equivalent work.

| Candidate | Owning workspace | Current shared status | Receiving disposition / return trigger |
| --- | --- | --- | --- |
| `RCP-001` portable one-shot kernel | Bake | `source-auditable`: `one-shot-{slots,receiver}.ts` and focused fixtures exist at the baseline; production cutover is incomplete | Nebular `defer` until local recipe-domain requirements and the admission matrix name exact source/tests; return any generic semantic defect with a redacted fixture |
| `RCP-002` PM2 materializer | Bake | `awaiting-bake-proof`: cross-process mutex, ownership metadata/log adapter, exact-name lifecycle, repeated-live and caller-death proof remain open | Nebular `defer`; consume only an evidenced receiver contract, never create a parallel PM2 substrate |
| `RCP-003` Windows Job containment | Bake | `awaiting-bake-proof`: native FFI, suspended launch/assignment, and creator-versus-observer live proof remain open | Nebular `defer`; adapt only redacted observation facts after Bake proves containment; `taskkill` is never a substitute |
| `RCP-004` broker authority integration | Nebular | `local-only`: grants, credentials, secret delivery, CAR, packaging, and conformance are not Bake extraction candidates | Bake `exclude`; return only a minimal redacted reproducer when the discovered defect is receiver-generic |

@evidence On 2026-08-23 Bake commit `8a1b79c35436e6985f9123efe13b6b6fbbc8fd69` landed the portable strict-FP kernel in `src/process-runner/one-shot-{slots,receiver}.ts`: fixed stable slot identities, exact attempt ownership and stale-handle rejection, serialized-allocation and exact-name PM2 ports, empty-or-confirmed-terminal reuse, expired reconciliation plans, and generation-checked output bounded to 1 MiB by independent UTF-8 measurement rather than adapter-reported counts. Eight collocated slot atoms and nine receiver seam cases pass; Bake also passes typecheck, 252 source tests/1 skip, 23 named Vitest tests, and zero lint errors, with the new strict kernel at zero findings. Commit `7964fc9434a76b23c9d04f075b1a97f504a21805` records the active receiver contracts and bidirectional return route.
@blocker Continue the production cross-process allocation mutex, PM2 ownership-metadata/log adapter, exact-name list/start/stop/delete/output-reset materialization, repeated live/caller-death proof, and runnable Windows Job Object containment in Bake at the delegated target; do not duplicate that substrate here.
@note The delegated Bake/recipe workspace owns Windows native Job Object FFI and its focused creator-versus-observer probe: redacted `OpenJobObjectW` access/session facts, `QueryInformationJobObject` accounting/process-list observations, and creator/observer handle lifetime while the managed target is known alive. The OpenCode harness notes' `taskkill /T /F` fallback is diagnostic timeout cleanup only; it is not a containment proof and must not be imported or substituted here.
@blocker Complete the broker recipe-domain contracts and record an explicit admission matrix against implemented Bake source/tests before copying code. Bake roadmap prose, temporary package façades, planned built-ins, and unproved lifecycle behavior are not extraction evidence.
@accept Use the linked Bake extraction memory's two-sided admission handshake. Bake supplies an immutable revision, exact source/dependency closure, focused fixtures/tests, semantic contract, known gaps, and redacted effect proof; Nebular records one `admit`/`adapt`/`reimplement`/`exclude`/`defer` disposition with local target and parity gate before any mirrored recipe or receiver work begins. Exchange minimal redacted semantic diffs and fixtures for later generic defects; never synchronize through a workspace import, link, generated bundle, or copied `dist`.
@note The portable kernel accepts opaque admitted payloads and deliberately owns no Git, recipe-grant, credential, or consent authority. No ordinary Bake recipe is routed through it, terminal reuse refuses unconfirmed cleanup, and Windows descendant containment remains unproved. Broker remains authoritative for FP architecture, credential authority, secret delivery, CAR integration, four-artifact packaging, and final conformance; return here after the production leaf closes for admission, transplant, and local cutover.
@accept Harden generic parsing, normalization, parameter/port resolution, lifecycle vocabulary, receiver semantics, observation facts, and representative fixtures in Bake only until the admitted extraction boundary is stable enough to copy. Broker grants, credential slots, CAR transfer, keychain access, and authority policy are implemented only here.
@accept Transplant admitted TypeScript source and fixtures into locally owned modules, sever all Bake imports and filesystem pointers, apply the strict FP/domain boundaries, and bundle from local entrypoints. Do not publish or consume a compiled Bake compatibility artifact as an intermediate architecture.
@proof_gap Differential fixtures must prove decoding, normalization, argv resolution, lifecycle/status reduction, redaction, and rejected-field behavior before cutover. Build proofs must show no `R:/Code/pk`, `@bake/*`, Bake alias, source fallback, or undeclared shared chunk in runtime artifacts or declarations.
@note Paused; currently deferred pending completion of the delegated production recipe/PM2 receiver substrate and its admission boundary.

### @work @partial establish four-entrypoint public upstream and builds
@memory ../memories/teleport/broker/broker-four-artifact-type-boundaries.md
@memory ../memories/teleport/broker/broker-typing-fp-implementation-sequence.md
@memory ../memories/teleport/broker/broker-epsilonode-nebular-esm-distribution.md
@blocker Run the real browser golden vector, finish the intended CLI/bin surfaces, and close the real installed four-artifact broker/PM2/keychain E2E before calling distribution complete.
@evidence GitHub reports `https://github.com/epsilonode/nebular` as PUBLIC with default branch `main`, matching the configured `origin` and package identity `@epsilonode/nebular`. Four thin root `.ts` entrypoints, conditional package exports, separate declarations, Mise/Bun builds with splitting disabled, and graph verification exist. `mise run verify` emits exactly `teleport.js`, `broker-client.js`, `recipe-runner.js`, and `broker.js`, resolves all four subpaths through an isolated consumer, and rejects any fifth export, undeclared chunk, privileged edge, old workspace pointer, absolute source path, or credential-shaped literal. `tooling/verify-installed-package.ts` additionally packs and installs the package into a fresh temporary consumer outside the workspace, rejects linked or escaped package resolution, independently typechecks the four installed declarations, runtime-imports all four subpaths, and proves their resolutions end at the installed `dist/*.js` files; the standalone proof observed export counts `[59, 48, 27, 152]` from a 761531-byte tarball. The verified implementation series is pushed and all four source entrypoints return HTTP 200 JavaScript from esm.sh at immutable commit `a97d66c0eb3bb8cdc3f9e7e8cb9b423a43bc2633` with repository-internal imports pinned to that same ref.
@accept Add root TypeScript entrypoints `teleport.ts`, `broker-client.ts`, `recipe-runner.ts`, and `broker.ts`; internal modules remain layered and are not individually exposed as stable esm.sh paths.
@accept Add Mise-managed Bun build tasks for the portable artifact, broker artifacts, complete distribution, and distribution verification. No build or package command bypasses Mise.
@accept Build `teleport.js` with the portable/browser-compatible target required by existing consumers and build `broker-client.js`, `recipe-runner.js`, and `broker.js` for the pinned Bun runtime.
@accept Disable code splitting, clean only the bounded generated output directory, and fail when the runtime build emits anything other than the four declared JavaScript artifacts.
@accept Use package identity `@epsilonode/nebular` with eventual exports `.`, `./broker-client`, `./recipe-runner`, and `./broker`; migrate adjacent `@wx/teleport-cartridge` consumers atomically with their dependency/import/lock updates.
@accept Document immutable esm.sh URL templates and generate an import-map/lock fixture that pins all four paths to the same Git tag or commit; never mix refs across the authority boundary.
@accept Keep broker administration/import/export commands in `broker.js` and recipe execution commands in `recipe-runner.js`; expose them through package `bin` mappings or equivalent Mise tasks without native executable compilation. Final human-facing aliases may be selected during packaging without changing the four artifact or subpath contracts.
@accept Generate declarations through the pinned TypeScript toolchain and prove every public runtime export has an accurate declaration without exposing privileged internal modules through the portable entrypoint.
@accept Add an import-graph gate that rejects Bun-only APIs, broker modules, OS keychain code, consent UI, process launch, and provider refresh implementations from `teleport.js`, and rejects direct keychain access from `broker-client.js`.

### @work @deferred close installed four-artifact broker E2E
@memory ../memories/teleport/broker/broker-four-upper-level-domains.md
@memory ../memories/teleport/broker/broker-four-domain-atomic-quality-harness.md
@memory ../memories/teleport/broker/broker-host-owned-pm2-prerequisite.md
@memory ../memories/teleport/broker/broker-cooperative-bootstrap-entrypoint.md
@memory ../memories/teleport/broker/broker-durable-bootstrap-authority-and-cleanup.md
@memory ../memories/teleport/broker/broker-windows-process-tree-conformance.md
@accept The success signal is one isolated installed-consumer execution using all four deliverables: `teleport.ts`, `broker-client.ts`, `recipe-runner.ts`, and `broker.ts`. It must use Bun through Mise, an already-running host-owned PM2 daemon, a canonical temporary Git repository, a committed recipe, a canary in the OS keychain, a cooperative Bun target, and no source fallback.
@accept Success requires all of: target-only credential digest match; a trusted broker terminal outcome carrying the attempt identity; durable authority/lease/attempt state finalized; exact PM2 record absent; exact Windows Job absent; trusted artifacts absent; no secret exposure retained; canary deleted; and temporary workspace deleted. Target success by itself is insufficient.
@evidence The isolated harness preflight succeeds and proves a pack/install/import of exactly four artifacts plus recipe admission and cleanup. Focused seam suites currently pass for the FP domain boundaries, artifact/package topology, keychain bridge, Git admission, SQLite journal, inherited IPC, cooperative bootstrap, PM2 AMP-v1 adapter, exact slot/ownership, Windows Job native leaves, provisional bootstrap state, exact containment upgrade, terminal cleanup, and redacted E2E receipts.
@evidence The live harness has already corrected and tested: invalid `source.command` recipe provenance; escaped native Windows repository-path decoding in PM2 metadata; PM2 prepare request dispatch with asynchronous bounded response drain/wipe; terminal outcome attempt identity propagation; retry-only-exact PM2 cleanup observation; and no pre-containment target application effect. Its diagnostics are deliberately allowlisted and never expose PM2 metadata, environment, arguments, Job identity, PID, secret, or raw receipt contents.
@remaining 1. In the delegated Bake/recipe workspace, resolve why a target can atomically report managed-Job first-effect `assigned` and a matching domain-separated Job commitment while a separate observer sees the same named Job as pending. Prove the redacted creator-versus-observer native session/access/query and process/Job-handle-lifetime contract there; this cartridge must consume that objective contract rather than own or duplicate native Job FFI. Do not replace it with an unbounded delay, loose name match, direct shell launch, resident wrapper, raw PM2 inspection, or the OpenCode harness `taskkill /T /F` timeout fallback.
@remaining 2. Once exactly-one Job-root observation is proven, complete the bounded sequence: Job root -> current process incarnation -> exact Job policy/membership -> atomic materializing `bindBootstrap` -> private bootstrap exchange -> exact PM2 ownership observation -> atomic full containment/running bind. Preserve the preconfirmed-binding replay invariant and fail closed on any disagreement.
@remaining 3. Rerun `mise run test-live-broker-e2e` until it produces the public success receipt. Then run the full verification and installed-consumer gates, record command evidence, update this roadmap only with verified facts, commit the implementation, and push the public `epsilonode/nebular` main branch.
@note Paused; currently deferred pending a proven Windows Job-root observation and the bounded PM2 containment sequence.

### @work @ready add provider adapters and renewal
@memory ../memories/teleport/broker/broker-deferred-console-provider-integration-gates.md
@memory ../memories/teleport/broker/broker-request-grant-transfer-state-machines.md
@memory ../memories/teleport/broker/broker-capability-specific-ports.md
@blocker Core broker, consent, and client conformance must pass without provider-specific assumptions.
@blocker No concrete provider or existing Mise deployment workflow is named for this cartridge. A product owner must select the first provider, required scopes, authentication flow, renewal authority, and target workflow before an adapter can be implemented or evaluated.
@accept Provider adapters describe supported scopes, upstream expiry, refresh/token-exchange behavior, revocation, and redacted identity metadata behind a closed port.
@accept Start with one provider required by an existing Mise deployment workflow, then prove a second provider with materially different authentication semantics before generalizing the adapter contract.
@accept Prefer upstream OAuth, device authorization, service-token exchange, or restricted short-lived tokens over storing broad static API keys.
@accept Renewal always repeats policy evaluation and user verification when required; scope expansion always requires a new explicit consent.

### @work @done integrate optional Teleport credential requirements
@memory ../memories/teleport/broker/broker-codec-adt-and-registry-boundary.md
@blocker Broker contracts and neutral credential-requirement schema must be stable.
@accept Define a nonsecret `dev.credential.requirement` capability containing provider, environment, scopes/operations, project-binding policy, injection name, and optional account constraints.
@accept Cartridge decode and restore planning report unresolved credential requirements without fetching, unlocking, embedding, or silently provisioning secrets.
@accept Importing a cartridge may start a broker consent flow but cannot bypass local policy, user verification, project binding, expiry, or provider authentication.
@accept Keep recipient-encrypted `secret-transfer` separate, opt-in, short-lived, replay-aware, and interactively imported. It is not required for ordinary local development.
@evidence 2026-09-04 `dev.credential.requirement@1` is a bounded canonical DAG-CBOR public capability with strict provider/environment/scope/operation, project-binding, injection-name, and optional account-constraint decoding. Its conformance and CAR composition tests prove it only projects a retained unresolved requirement; no keychain, provider, consent, or secret action occurs during decode or restore planning. `mise exec -- bun run check:broker` passes 598 tests.

### @work @partial implement encrypted credential CAR export and import
@memory ../memories/teleport/broker/broker-codec-adt-and-registry-boundary.md
@memory ../memories/teleport/broker/broker-consent-and-car-unlock.md
@memory ../memories/teleport/broker/broker-typed-restore-effects-and-recovery.md
@memory ../memories/teleport/broker/broker-request-grant-transfer-state-machines.md
@memory ../memories/teleport/broker/broker-secret-values-and-lifetime.md
@blocker A trusted import/export CLI and production Windows PIN/passphrase host must close before this capability is user-operable.
@evidence `dev.credential.secret-transfer@1` now has a closed budgeted codec, portable-fact and destination-authority separation, recipient protection, trusted signatures, private-inventory wrapping, replay/expiry/scope/conflict policy, callback-scoped export plaintext, transaction-scoped import plaintext, explicit elevated replacement consent, and redacted committed/recovery receipts. A required signed public preview now exposes provider, opaque account hint, environment, kind, factual scopes, recipient, issue/transfer/upstream expiry, and signer facts before unlock; it is cross-bound to the opaque encrypted-inventory CID and canonical inner portable-facts digest. Import verifies outer graph/signature/recipient/expiry/replay before prompting, then requires the same signer set and exact inner binding before mutation.
@evidence Atomic and real WebCrypto/CAR seam tests cover success, replay, wrong recipient, untrusted signer, expiry, modification, preview/inventory binding, preview-before-unlock ordering, and transactional recovery.
@proof_gap Production CLI/host proof must cover masked PIN/passphrase entry, cancellation, wrong PIN/key, throttling, keychain failure, interrupted terminal commit, and absence of prompt input from every observable surface. The public preview intentionally uses an opaque account hint; resolve whether a recognizable authenticated account label is required for consent before freezing the UX schema.
@accept Add dedicated broker CLI flows for encrypted export and import; require an explicit credential selection, intended recipient, transfer expiry, and confirmation rather than exporting all available credentials implicitly.
@accept Export obtains the selected secret through an authorized short lease, encodes the closed secret-transfer capability, protects it for the intended recipient, signs according to policy, writes the CAR, and releases plaintext buffers.
@accept Import performs verification and decryption in an isolated staging flow, rejects expired or previously consumed transfer ids, displays the exact provider, account, kind, scopes, destination repository, and recipe in the broker-owned prompt, and does not mutate the keychain until successful PIN/passphrase unlock.
@accept Keychain write and replay-record commit behave transactionally: an interruption cannot leave an accepted reusable transfer without either a recoverable pending journal or a completed consumed-transfer record.
@accept Define explicit conflict behavior for an existing destination credential: reject, replace after elevated confirmation, or import under a new account/reference; never overwrite silently.
@accept Conformance proves wrong-recipient, wrong-key, unsigned or untrusted signer, modified block, expired transfer, replay, cancellation, keychain-write failure, and interrupted-commit behavior.

## @tier7 verification and rollout

### @proof @partial security and lifecycle conformance
@memory ../memories/teleport/broker/broker-result-task-result-and-error-algebra.md
@memory ../memories/teleport/broker/broker-typed-restore-effects-and-recovery.md
@memory ../memories/teleport/broker/broker-secret-values-and-lifetime.md
@memory ../memories/teleport/broker/broker-typing-fp-implementation-sequence.md
@memory ../memories/teleport/broker/broker-fp-verification-and-exception-governance.md
@memory ../memories/teleport/broker/broker-durable-bootstrap-authority-and-cleanup.md
@evidence The Windows Bun 1.4.0 live suite passes ten real SQLite cases/46 expectations, real OS-keychain replace/read/delete/missing cleanup, terminal-plus-helper-exit inherited IPC, the two-process secret-bootstrap exchange, and runner-to-built-broker control with no helper orphan. Default seams cover authority drift, durable lease transition shape, atomic environment install and rollback after helper/import failure, redacted failures, authenticated preview-before-unlock, encrypted-transfer recipient/signature/replay/expiry/modification failures, and transactional recovery; artifact scans reject credential-shaped literals and absolute workspace paths.
@proof_gap Production root bootstrap remains deliberately unavailable with exit 78 pending atomic SQLite claim/recovery, current Git recipe, PM2/current-parent, and trusted profile-path adapters. Keychain lock/unavailable and platform size limits, restart/ambiguous-terminal recovery, trusted key-entry/PIN cancellation and failure, provider refresh, hostile same-user IPC/process cases, exact managed-child inheritance, PM2/Job Object tree cleanup, and proof on macOS/Linux remain open.
@accept Prove secrets do not appear in CLI arguments, parent environments, repository scans, persisted metadata, standard logs, denial diagnostics, audit events, or Teleport requirement cartridges.
@accept Pin and record the tested Bun version, then prove real `Bun.secrets` persistence, replacement, deletion, missing-entry behavior, user scoping, platform size limits, locked or unavailable keychain behavior, and failure redaction on every supported OS.
@accept Prove restart recovery, expiration, revocation, scope mismatch, canonical-path mismatch, process termination, key-entry cancellation, failed CAR PIN/passphrase unlock, and provider refresh failure.
@accept Prove child-process inheritance is limited to the launched tree and document that a permitted child can still disclose any raw credential it receives.
@accept Threat-model review explicitly covers local IPC impersonation, confused deputy behavior, symlink/path substitution, DLL or module injection limits, clipboard capture, crash dumps, and same-user hostile processes.
@accept Prove encrypted credential CARs reveal no provider secret or locally authorized project identity through their public inventory, filenames, logs, or diagnostics, subject to the selected private-inventory protection profile.
@accept Prove successful import leaves the credential only in the destination OS keychain, retains only redacted receipt and replay metadata, and does not retain staged plaintext or decrypted CAR blocks.

### @proof @open cross-workspace developer workflow
@memory ../memories/teleport/broker/broker-associated-workspace-hard-migration.md
@blocker 2026-09-04 Current consumers `jtwc`, `wx-ui-melt`, and `supa-svelte` still declare and import the retired `@wx/teleport-cartridge` package rather than this package's published `@epsilonode/nebular` identity. Their owners must atomically migrate manifests, imports, and lockfiles before the multi-workspace workflow can be run without source/link fallback.
@accept Prove at least two Mise-managed workspaces can request different least-privilege credentials without sharing grants or storing project secrets.
@accept Prove an agent can request authorization, the user can enter or approve a credential entirely outside chat, and the authorized Mise task completes without the raw key appearing in the conversation or repository.
@accept Document installation, broker startup, trusted prompt identity, grant inspection, revocation, provider recovery, and removal in lightweight tiered-routing guidance.

### @proof @partial four-artifact distribution conformance
@memory ../memories/teleport/broker/broker-four-upper-level-domains.md
@memory ../memories/teleport/broker/broker-four-domain-atomic-quality-harness.md
@memory ../memories/teleport/broker/broker-four-artifact-type-boundaries.md
@memory ../memories/teleport/broker/broker-typing-fp-implementation-sequence.md
@memory ../memories/teleport/broker/broker-typescript-project-and-compiler-matrix.md
@memory ../memories/teleport/broker/broker-import-and-authority-boundary-enforcement.md
@memory ../memories/teleport/broker/broker-epsilonode-nebular-esm-distribution.md
@evidence A clean `mise run verify` proves exactly four package exports and runtime `.js` files, four root declaration entries, no shared chunks, the acyclic authority graph, portable/client/runner exclusions, inert imports, no old workspace pointers or absolute source paths, and all subpath declarations through an isolated consumer fixture. The broker root parses exact control/bootstrap child modes, but bootstrap intentionally exits 78 until production adapters are composed.
@evidence Commits `51f38469bb7185d68a55d8b8aeb4226796f679d7` and `a97d66c0eb3bb8cdc3f9e7e8cb9b423a43bc2633` are pushed to the public `epsilonode/nebular` `main`. At immutable ref `a97d66c0eb3bb8cdc3f9e7e8cb9b423a43bc2633`, esm.sh returns HTTP 200 JavaScript for `teleport.ts`, `broker-client.ts`, `recipe-runner.ts`, and `broker.ts`; every emitted repository-internal import observed at those entry responses retains that exact ref and external package imports are version-pinned.
@evidence 2026-09-04 `mise run verify-installed` packs a 1074433-byte `@epsilonode/nebular@0.1.0` tarball and installs it into an operating-system temporary consumer outside the workspace. It rejects symlink or escaped resolution, independently typechecks all four package subpaths, runtime-imports export counts `[59, 68, 34, 388]`, and proves every runtime resolution terminates in that installed package's `dist/*.js` files with no workspace source fallback.
@proof_gap Run the real browser golden vector. Wire and prove production PM2 receiver, durable bootstrap, trusted prompt, and CAR CLI compositions before advertising the four entrypoints as fully capable rather than structurally emitted.
@accept Prove a public immutable `epsilonode/nebular` ref serves all four committed TypeScript entrypoints through esm.sh and that every resolved module stays within the same repository/ref and allowed dependency graph.
@accept Prove the committed public surface contains exactly the four root TypeScript entrypoints and no accidental fifth public path; separately prove a clean optional build emits exactly their four `.js` mirrors with no shared chunks, hidden runtime dependencies, or native executable.
@accept Prove the immutable esm.sh forms of `teleport.ts` and `broker-client.ts` load in their supported unprivileged environments, and prove the pinned `recipe-runner.ts` and `broker.ts` delivery paths preserve their Bun/runtime and authority constraints.
@accept Prove `teleport.js` loads and passes its golden CAR vector in a real supported browser and in the pinned Bun runtime without resolving broker or keychain modules.
@accept Prove `broker-client.js` imports without starting a listener, opening consent UI, reading the keychain, or importing privileged broker modules.
@accept Prove `recipe-runner.js` cannot read `Bun.secrets`, construct a secret environment, or authorize its own repository/recipe claims; prove broker-side revalidation rejects repository, recipe-revision, credential-slot, expiry, or grant drift while ordinary interpreted source and package-manifest changes remain runnable.
@accept Prove `broker.js` runs through Mise and the pinned Bun runtime, exchanges versioned messages over inherited Bun IPC, uses an already-running host PM2 daemon through bounded exact-name application operations without managing daemon lifecycle, observes and cancels managed commands without a resident wrapper, uses the real `Bun.secrets` adapter for cooperative bootstrap, and performs encrypted credential CAR export/import.
@accept Install the built package into isolated consumer fixtures and prove all four package subpath exports plus declaration resolution without falling back to workspace source files.
@accept Scan the four artifacts, declarations, optional maps, build logs, and fixtures for embedded credentials and reject unexpected absolute workspace paths or secret-bearing literals.

### @proof @partial FP and tooling conformance
@memory ../memories/teleport/broker/broker-four-upper-level-domains.md
@memory ../memories/teleport/broker/broker-four-domain-atomic-quality-harness.md
@memory ../memories/teleport/contracts/teleport-colocated-domain-seam-vitest.md
@memory ../memories/teleport/broker/broker-eslint-flat-config-specification.md
@memory ../memories/teleport/broker/broker-typescript-project-and-compiler-matrix.md
@memory ../memories/teleport/broker/broker-fp-runtime-package-contract.md
@memory ../memories/teleport/broker/broker-result-effect-interoperation.md
@memory ../memories/teleport/broker/broker-import-and-authority-boundary-enforcement.md
@memory ../memories/teleport/broker/broker-fp-verification-and-exception-governance.md
@memory ../memories/teleport/broker/broker-property-and-type-proof-strategy.md
@memory ../memories/teleport/broker/broker-algebra-ownership-lint-contract.md
@memory ../memories/teleport/broker/broker-domain-algebra-implementation-sequence.md
@evidence 2026-09-04 A clean `mise run verify` passes zero warnings, all five domain/artifact compiler projects plus compile-negative policy, 102 deterministic test files/830 tests, eight deliberate lint failures, 24 exact production exception surfaces, test inventory classification, package declarations, artifact checks, and isolated installed-tarball resolution. The broker-only Effect suite proves Result conversion, finalization on success/typed failure/interruption, defect separation, cancellation projection, and redaction. Bounded fast-check laws cover authority and provider-indexed scope algebra; compile-negative fixtures prove illegal trust/authority/provider/exposure edges cannot typecheck.
@evidence 2026-09-04 Bounded fast-check canonical-codec laws now prove source-object insertion-order independence and decode-to-reencode byte/CID idempotence for generated valid values; `mise exec -- bun run check:teleport` passes 60 tests in 7 files.
@evidence 2026-09-04 Bounded fast-check authority-request expiry laws now prove deterministic reduction and terminal non-replayability; `mise exec -- bun run check:broker` passes 605 tests in 59 files.
@evidence 2026-09-04 Bounded fast-check grant-persistence laws now prove deterministic pending-to-active reduction and successor replay rejection; `mise exec -- bun run check:broker` passes 606 tests in 59 files.
@evidence 2026-09-04 Bounded fast-check encrypted-transfer admission laws now prove fresh-plan determinism and consumed-replay rejection before commit planning; `mise exec -- bun run check:broker` passes 607 tests in 59 files.
@evidence 2026-09-04 Bounded fast-check Result-faÃ§ade laws now prove left identity, associative dependent composition, and typed thrown-mechanic conversion; `mise exec -- bun run check:broker` passes 609 tests in 60 files.
@proof_gap Broader warning/durable-replay and grant-lifecycle reducer laws plus bounded performance/streaming measurements remain before closing the full FP proof target. Production adapter admission must keep the 22-surface inventory exact or reduce it; any exception drift fails verification.
@accept Prove type-aware lint actually executes every configured rule, emits zero warnings, and rejects negative fixtures for mutation, ambient effects, promise misuse, nonexhaustive state, expected-failure throws, and forbidden import direction.
@accept Prove all compiler projects independently pass with their minimal ambient types and isolated consumer fixtures resolve all public declarations without source aliases or privileged leakage.
@accept Prove named atomic projects, cross-domain seam projects, and opt-in live projects select each test exactly once and preserve conservative deterministic execution.
@accept Prove neverthrow warning/error composition laws, Result-to-Effect boundary helpers, Effect finalization under failure/interruption, redacted outcome projection, and absence of mixed rejected-promise control flow.
@accept Record and eliminate the temporary migration inventory; retain only justified path-scoped adapter/test/tooling exceptions with their exact disabled rules and proof.
@accept Prove scope, time, authority, report, Result, reducer, replay, plan, rollback, redaction, and codec laws through bounded generated tests and prove illegal trust/authority/exposure combinations through compile-negative fixtures.

### @risk @open portability and false security expectations
@accept V1 release conformance is Windows-only, but the implementation leans into Bun's cross-platform `Bun.secrets` contract through one narrow `SecretStore` adapter. macOS and Linux become supported only after equivalent keychain and prompt conformance; never add a portable plaintext fallback.
@accept The broker reduces routine exposure and narrows authority; it does not sandbox an authorized process or make a broad static provider key least-privilege.
@accept Do not advertise encrypted cartridges as equivalent to revocable OS-bound credentials. Portable encrypted secret transfer has different retention, replay, recipient-key, and recovery risks.

## @tier6 deferred receiver alternatives

### @work @deferred evaluate Python/uv Windows Job Object receiver
@memory ../memories/teleport/broker/broker-python-uv-windows-job-receiver.md
@accept Keep PM2 as the required Windows V1 receiver and keep the `pk` recipe implementation, recipe authority model, and backend-neutral receiver algebra unchanged while this target is deferred.
@accept The candidate is one shared Python receiver per user/domain replacing PM2, never a Python supervisor per target and never an additional observer beside PM2. Targets remain direct Job Object members without resident per-target wrappers.
@blocker Do not promote this target until the PM2-backed V1 contract and receiver conformance fixtures exist, because those fixtures define the behavioral comparison surface.
@proof_gap Promotion requires race-free suspended launch and Job assignment, durable attempt identity and reconciliation, cursor-based bounded output, typed observation and stall evaluation, secure local control, secret-safe environment materialization, whole-tree cancellation, receiver crash/restart recovery, concurrency proof, and measured overhead no worse than the accepted receiver budget.
