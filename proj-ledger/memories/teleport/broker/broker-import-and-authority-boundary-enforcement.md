---
id: broker-import-and-authority-boundary-enforcement
kind: contract
status: proposed
created: 2026-08-23
updated: 2026-08-23
roadmap: broker
refs:
  - roadmaps/broker.md#broker-is-a-separate-security-boundary-in-this-project
  - roadmaps/broker.md#four-typescript-upstream-entrypoints
  - roadmaps/broker.md#hard-fp-tooling-and-fast-migration
hook: "read before moving modules, adding imports, defining public surfaces, configuring eslint-plugin-boundaries, or granting portable/client code new authority"
---

# Import And Authority Boundary Enforcement

@topology `protocol` may import only protocol; `codec` may import protocol; `protection` may import protocol and codec; `transport-contract` may import protocol; `credential-contract` may import protocol and codec; `broker-client` may import public credential/protocol contracts; `broker-domain` may import public portable and credential contracts; `broker-runtime` may import broker domain and declared ports; `adapter` may import its owned port and external dependency; `composition` may import all public surfaces and adapters.
@topology Tests may import the public surface under test and explicit test-kit exports; tests do not establish production dependency precedent. Tooling/build code cannot be imported by runtime source.
@portable `teleport.js` excludes broker client/runtime, Bun, Node, OS keychain, consent, provider authentication, child process, local IPC server, profile persistence, and recovery-journal adapters.
@client `broker-client.js` excludes keychain, consent UI, provider refresh, child process, server administration, direct profile mutation, and cartridge secret decryption. It sends authenticated typed requests and receives redacted typed outcomes.
@runner `recipe-runner.js` may locate and parse a checked-in recipe for early diagnostics, call the public client, stream agent-visible output/status, and request lifecycle operations. It excludes keychain access, credential acquisition, grant decisions, and authoritative repository/recipe resolution; the broker repeats every authority-relevant resolution from trusted local inputs.
@broker `broker.js` owns privileged interpretation and may use Bun and Effect only through broker runtime/adapters. Provider-specific modules cannot mutate grants or bypass central consent and policy state machines.
@public Cross-layer imports use package public entrypoints or layer `public.ts` files. Deep sibling imports, adapter imports from domain code, and reverse imports are errors.
@lint Configure boundary element patterns and default-disallow policies. Add restricted-import rules for known high-risk reverse paths and `bun:*`/`node:*` imports outside privileged or tooling profiles.
@build Bundle metafile verification independently walks all four artifact graphs and fails on forbidden modules even if lint misses a dynamic import or path alias.
@proof Negative fixtures attempt every forbidden edge, including type-only imports, dynamic imports, path aliases, barrel re-exports, client-to-broker leakage, portable-to-Bun leakage, and adapter-to-policy mutation.
