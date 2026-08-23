---
id: broker-algebra-ownership-lint-contract
kind: contract
status: proposed
created: 2026-08-23
updated: 2026-08-23
roadmap: broker
refs:
  - roadmaps/broker.md#expand-domain-algebras-and-lawful-composition
  - roadmaps/broker.md#fp-and-tooling-conformance
hook: "read before enforcing constructor ownership, registry casts, Result matching, Effect execution, Zod parsing, state mutation, secret imports, or algebra module boundaries"
---

# Algebra Ownership Lint Contract

@enforce Only constructor/decoder modules may assert branded domain primitives; all other modules call public parsers/constructors. Unsafe assertions in the dynamic codec/provider registries require a confined audited rule exception.
@enforce Only registry modules erase codec or provider generics. Only reducers construct successor domain states. Only interpreters execute closed effect commands. Only composition roots run Effect programs or construct live Layers.
@enforce Pure modules cannot import adapters, runtime services, secret wrappers, Bun/Node APIs, UI frameworks, or persistence clients. Portable and client modules cannot import Effect.
@enforce Raw secret exposure modules are importable only by authorized delivery, keychain, provider-operation, and transfer-encryption adapters. Policy, consent projection, audit, UI, and ordinary client modules see redacted references only.
@enforce Internal pipelines normally use `map`, `mapErr`, `andThen`, validation accumulation, or Effect composition. Result/Exit matching is restricted to explicit outer projections and reducer decision points where all variants are exhausted.
@enforce Prohibit throwing Zod `.parse` at expected input boundaries; use safe decoding and typed issue mapping. Prohibit Promise `.catch` that converts failures to undefined or logs-and-continues outside a named nonauthoritative adapter.
@enforce Direct state mutation occurs only inside named runtime cells/adapters; domain state changes through reducers. Direct time/random/environment/fetch/console/keychain/process access remains composition/adapter-only.
@proof ESLint negative fixtures and boundary graph tests cover type-only imports, barrels, aliases, dynamic imports, forbidden assertion locations, Effect execution leakage, secret-wrapper leakage, unsafe schema parsing, swallowed rejection, and reducer bypass.

