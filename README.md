# Nebular

Nebular is a portable TypeScript toolkit for moving application capabilities, restoring them safely,
and supplying narrowly authorized development credentials without putting secrets in repositories or
agent conversations.

The public source lives at `epsilonode/nebular`. Once released, each version exposes four stable
TypeScript entrypoints that can be consumed from GitHub through esm.sh:

```text
https://esm.sh/gh/epsilonode/nebular@<tag-or-commit>/teleport.ts
https://esm.sh/gh/epsilonode/nebular@<tag-or-commit>/broker-client.ts
https://esm.sh/gh/epsilonode/nebular@<tag-or-commit>/recipe-runner.ts
https://esm.sh/gh/epsilonode/nebular@<tag-or-commit>/broker.ts
```

Use an immutable release tag or commit. Do not use a floating branch for production, credential, or
authority-bearing workflows.

## `teleport.ts`

The portable, browser-compatible Teleport Cartridge entrypoint. Its complete target includes:

- framework-neutral capability contracts, typed codec registries, canonical encoding, migrations,
  decode budgets, and unknown-capability retention;
- content-addressed CAR graphs, CID and signature verification, public or protected inventories,
  assets, streaming, files, and object-storage transport profiles;
- unencrypted export, encrypted export, recipient protection, selective disclosure, key rotation,
  and tamper detection;
- pure restore planning with staging, authorization, commit, verification, rollback, recovery, and
  application-owned effect adapters;
- conformance support for JTWC, wx-ui-melt, Supa/Fireproof, and other independent applications.

This entrypoint must not contain keychain access, consent UI, credential acquisition, provider
refresh, or process-launching authority.

## `broker-client.ts`

The unprivileged client for requesting narrowly scoped development credentials. Its complete target
includes:

- typed request, consent, grant, lease, revocation, refresh, and denial contracts;
- Git-repository and recipe-scoped authority with explicit approval for every new repository;
- versioned inherited IPC, bounded messages, cancellation, reconnect behavior, and redacted errors;
- cooperative JS/TS bootstrap APIs that make authorized values available only inside the managed
  target process;
- encrypted credential-cartridge import and refresh requests without direct access to plaintext,
  the OS keychain, or privileged broker state.

Importing the client must not start a listener, open consent UI, read credentials, or grant authority.

## `recipe-runner.ts`

The unprivileged, agent-oriented recipe execution entrypoint. Its complete target includes:

- canonical XML recipe parsing, inheritance, parameters, argv-safe native and interpreted
  entrypoints, lifecycle policies, ports, probes, completion rules, and credential slots;
- PM2-backed one-shot, long-lived, and service execution with reusable bounded slots and exact
  attempt identity;
- objective status, readiness, liveness, stall detection, heartbeat/progress facts, cursor-based
  stdout/stderr, bounded tails, cancellation, cleanup facts, and actionable failure guidance;
- repository and recipe discovery for diagnostics while treating all caller claims as
  non-authoritative hints;
- no unbounded public direct-spawn path and no resident per-target Bun execution capsule.

The runner cannot approve recipes, retrieve credentials, construct a secret environment, or bypass
broker-side revalidation.

## `broker.ts`

The Bun-only privileged broker and administration entrypoint. Its complete target includes:

- broker-owned masked credential entry, consent, repository/recipe grants, expiration, revocation,
  renewal, and provider adapters;
- OS credential storage through Bun's cross-platform secrets API, with SQLite restricted to
  non-secret authority, replay, lease, and recovery facts;
- independent Git worktree and recipe canonicalization, grant verification, secret-safe receiver
  materialization, and cooperative credential delivery;
- PM2 receiver control, bounded one-shot allocation, reconciliation, exact cancellation, Windows
  process-tree conformance, and agent-observable lifecycle results;
- encrypted credential CAR export/import with recipient protection, signatures, replay defense,
  transactional keychain writes, and explicit conflict handling;
- strict typed boundaries, functional effect composition, redaction, scoped finalization, and no
  localhost HTTP service or native executable requirement.

Run privileged workflows with the pinned Bun runtime through the repository's Mise tasks. Never load
`broker.ts` from an unpinned network reference.

## Development status

The capabilities above describe the intended public surface once implemented. This README is
intentionally an advertisement, not a progress ledger. Current state, accepted decisions,
implementation order, blockers, and proof are maintained only in:

- [`proj-ledger/roadmaps/car-teleport.md`](proj-ledger/roadmaps/car-teleport.md)
- [`proj-ledger/roadmaps/broker.md`](proj-ledger/roadmaps/broker.md)

## Development

Use the pinned toolchains only:

```sh
mise run install
mise run check
mise run test
mise run verify
```
