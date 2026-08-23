---
id: broker-eslint-flat-config-specification
kind: contract
status: proposed
created: 2026-08-23
updated: 2026-08-23
roadmap: broker
refs:
  - roadmaps/broker.md#hard-fp-tooling-and-fast-migration
  - roadmaps/broker.md#fp-and-tooling-conformance
hook: "read before adding or changing ESLint dependencies, flat configuration, type-aware parsing, FP rules, Svelte overrides, adapter overrides, or lint tasks"
---

# ESLint Flat Configuration Specification

@dependency Pin compatible exact dev dependencies in each independently installable workspace: `@eslint/js`, `eslint`, `eslint-plugin-functional`, `eslint-plugin-boundaries`, `globals`, and `typescript-eslint`; add `eslint-plugin-svelte` only in Svelte workspaces. The Nebular verified baseline is ESLint 10.9.0, functional 10.0.0, boundaries 7.2.0, typescript-eslint 8.67.0, `@eslint/js` 10.0.1, and globals 17.11.0.
@config Use flat config through `typescript-eslint` config composition. Start with JavaScript recommended, TypeScript recommended, and `recommendedTypeChecked`; set `parserOptions.projectService` and `tsconfigRootDir` so every type-aware functional and TypeScript rule has parser services.
@config Keep generated output, coverage, package caches, framework output, browser reports, and explicit vendored source ignored. Do not ignore first-party source merely to make lint pass.
@base Production TypeScript errors include consistent type imports/exports, no explicit any, no floating or misused promises, no non-null assertions, no unnecessary conditions or assertions after migration, no unsafe type assertions outside decoder/registry boundaries, only throwing `Error`, outer-edge `return await`, exhaustive switches, and unused-variable enforcement with a narrow underscore convention.
@pure Pure production modules additionally error on immutable-data, `let`, loops, `this`, classes, inheritance, mixed types, explicit promise rejection, throws, try/catch, mutable function/type declarations, method signatures where property signatures preserve variance, and ambient runtime access.
@pure Restrict globals `Bun`, `console`, `fetch`, and `process`; restrict `Math.random`, `crypto.randomUUID`, `Date.now`, and zero-argument `new Date` in deterministic modules. Receive these facts through named ports.
@boundary Configure element types for protocol, codec, protection, transport contracts, credential contracts, broker client, broker domain, broker runtime, adapters, CLI/composition, tests, and tooling. Default dependency policy is disallow; each source element has an explicit allow set.
@adapter Adapter directories keep base rules but may disable immutable-data, no-let, no-loop-statements, no-throw-statements, no-try-statements, no-classes, and immutable-type rules only as required by the foreign API. They never disable promise safety, explicit-any, exhaustive outcome handling, or dependency boundaries globally.
@svelte Svelte components use the Svelte parser with TypeScript parser delegation and type information. Disable assignment-oriented immutability and `no-let` only for `.svelte` reactive state; imported `.ts` domain modules remain pure. Copied vendor components live under one documented vendor pattern.
@test Tests may disable mutation, let, loop, try, throw, immutable-type, unnecessary-condition, and unsafe-test-assertion rules. Keep no-floating-promises, no-misused-promises, no-explicit-any where practical, and dependency boundaries.
@tooling Build scripts and composition roots may throw terminal errors and use loops or local mutation. Keep strict promise handling, input validation, exact import ownership, and no secret-bearing output.
@avoid Do not enable `prefer-tacit`, functional-parameters, no-expression-statements, or no-conditional-statements. They optimize stylistic purity at the cost of readable security and state-transition code.
@avoid Do not use deprecated `functional/prefer-readonly-type`; use `functional/prefer-immutable-types` with shallow-readonly enforcement and `functional/type-declaration-immutability`.
@command Every workspace exposes Mise-routed `lint`, `lint:fix`, and verification tasks. CI-equivalent verification uses zero warnings; auto-fix never runs as part of verification.
@atomic Nebular exposes scoped `lint:teleport`, `lint:broker-client`, `lint:recipe-runner`, and `lint:broker` tasks. Root lint composes those once plus tooling/configuration lint; it does not redundantly lint the entire production tree before invoking the same domain profiles. The complete lint/typecheck/test/check topology lives in `broker-four-domain-atomic-quality-harness.md`.
@proof Add configuration fixtures that must fail for direct ambient effects, forbidden import direction, unhandled promise, mutable domain data, thrown expected failure, nonexhaustive state, and privileged import from portable/client code.
