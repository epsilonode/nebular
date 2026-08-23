---
id: broker-hard-fp-enforcement-policy
kind: contract
status: proposed
created: 2026-08-23
updated: 2026-08-23
roadmap: broker
refs:
  - roadmaps/broker.md#hard-fp-tooling-and-fast-migration
  - roadmaps/broker.md#strengthen-typing-and-functional-boundaries
hook: "read before setting FP strictness, granting lint exceptions, choosing pure versus adapter ownership, or deciding whether migration debt may remain"
---

# Hard FP Enforcement Policy

@decision The target is strict functional discipline with a hard, fast, bounded migration. New broker and credential code begins at zero warnings; existing touched Teleport code is migrated in complete dependency-ordered slices rather than receiving indefinite advisory rules.
@principle Purity is an authority boundary: protocol values, decoders after ingress parsing, migrations, policy, plans, reducers, state machines, projections, and error mapping cannot read ambient effects or mutate observable state.
@principle Effects are data until a named interpreter executes them. Domain functions construct commands, plans, transitions, and required capabilities; adapters translate filesystem, network, clock, crypto, keychain, IPC, process, UI, and provider operations into typed facts.
@principle Local mutation is permitted only inside explicitly classified mechanics where an immutable rewrite would obscure correctness or materially harm bounded performance: byte buffers, cryptography, stream readers, parser indexes, SDK transaction handles, UI reactive cells, and composition-root resource registration.
@principle An adapter exception relaxes syntax, not contracts. Adapter inputs and outputs remain readonly, expected failures remain typed, promises remain handled, errors remain redacted, and business policy remains outside the adapter.
@principle Exceptions are reserved for impossible programmer defects and the terminal CLI/process edge. Expected validation, authorization, availability, provider, keychain, IPC, cancellation, conflict, timeout, and recovery outcomes are values.
@enforce Pure modules use immutable data, no `let`, no loops, no `this`, no classes or inheritance, no mixed method/data types, no promise rejection, no throw, no try/catch, readonly public types, exhaustive branching, and no ambient effect globals.
@enforce Effect adapters retain type-aware TypeScript rules, promise safety, exhaustive domain outcomes, readonly boundaries, structured error mapping, and architectural imports even when local mutation, loops, classes, or try/catch are enabled.
@enforce Svelte component reactivity, test fixtures, generated code, and outer build scripts receive separate named profiles. No inline disable is accepted without a reason, owner profile, and proof that the code is at the intended boundary.
@migration Do not use repository-wide warning mode as the end state. When a legacy directory cannot migrate in the same slice, exclude it through a named temporary migration inventory with a removal gate; do not weaken the target profile.
@migration A migration slice includes decoder/domain/effect/edge flow, its tests, its imports, and its diagnostics. Partial conversion that leaves both thrown and typed expected-failure APIs is not complete.
@proof The final gate runs with zero lint warnings, no unexplained disables, no unclassified direct effects, no unhandled promises, no nonexhaustive state transitions, and an empty temporary migration inventory.

