---
id: broker-fp-verification-and-exception-governance
kind: contract
status: proposed
created: 2026-08-23
updated: 2026-08-23
roadmap: broker
refs:
  - roadmaps/broker.md#fp-and-tooling-conformance
  - roadmaps/broker.md#hard-fp-tooling-and-fast-migration
hook: "read before closing FP migration, adding a lint disable, changing verification tasks, accepting warnings, or claiming architectural purity"
---

# FP Verification And Exception Governance

@gate `mise run verify` executes format check when adopted, zero-warning lint, all compiler projects, unit/law tests, artifact builds, artifact graph checks, declaration fixture checks, and focused browser/Bun security conformance. No gate calls a global runtime or package manager directly.
@gate Lint configuration itself has positive and negative fixtures. A green source lint is insufficient if a rule silently lacks parser services or an override accidentally disables a whole profile.
@gate Record counts for explicit any, non-null assertion, unsafe assertion, throw, try/catch, promise catch, direct Bun/process/fetch/console/time/random access, mutable declarations, loops, classes, inline disables, deep imports, and forbidden dependency edges at baseline and completion.
@gate The hard migration completes only when target production code has zero counts outside named adapter classifications and the temporary migration inventory is empty.
@exception Every allowed exception is path-scoped, names the external/runtime constraint, lists the exact disabled rules, states why typed immutable boundaries still hold, and has a proof or test. Repository-wide rule disablement is prohibited.
@exception Inline disables are rejected by default. Where an external declaration forces a false positive, use the narrowest line disable with an adjacent reason and add it to an audited exception inventory.
@proof Result laws cover map identity, flatMap identities and associativity for pure callbacks, deterministic warning order, error accumulation, and foreign exception conversion. State-machine tests cover every legal and illegal transition.
@proof Effect tests use deterministic services and controlled clocks, prove finalizers under success/failure/interruption, verify no fiber/resource leak, and map Exit to exact redacted broker outcomes.
@proof Boundary tests prove portable/client artifacts cannot load privileged modules, adapters cannot choose policy, and all public declarations resolve without internal aliases.
@proof Security scans cover emitted JavaScript, declarations, optional source maps, build logs, test artifacts, IPC fixtures, diagnostics, and journals for credentials, PINs, tokens, decrypted payloads, and unexpected absolute paths.
@proof Performance checks ensure FP rewrites do not defeat CAR streaming bounds, crypto buffer discipline, decode budgets, backpressure, or keychain/IPC latency targets. Local internal mutation may remain in a named adapter when measurements and clarity justify it.
@closeout Record the exact dependency versions, rule profiles, compiler projects, remaining adapter exceptions, command results, artifact inventory, and conformance evidence. Do not claim completion from configuration edits alone.
