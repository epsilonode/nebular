---
id: broker-cooperative-bootstrap-entrypoint
kind: contract
status: proposed
created: 2026-08-23
updated: 2026-08-23
roadmap: broker
refs:
  - roadmaps/broker.md#secret-delivery-hierarchy
  - roadmaps/broker.md#add-child-process-and-jsts-clients
  - memories/teleport/broker/broker-receiver-secret-delivery.md
  - memories/teleport/broker/broker-inherited-ipc-v1-contract.md
  - memories/teleport/broker/broker-direct-receiver-materialization.md
hook: "read before exposing a bootstrap import, mutating a target environment, choosing side-effect import versus explicit initialization, using Bun preload, dynamically importing an application, or delivering credentials to JS/TS"
---

# Cooperative Bootstrap Entrypoint

@decision The normative Bun/JS/TS compatibility path is an explicit awaited bootstrap that completes credential acquisition before dynamically importing the actual application module in the same PM2-managed process. Do not promise that a bare side-effect import makes environment values available before unrelated static module initialization.
@topology PM2 starts one Bun process at the declared bootstrap entrypoint. That process imports the unprivileged bootstrap library, invokes a short-lived privileged `broker.js` helper over inherited IPC, installs admitted environment slots, closes the exchange, and dynamically imports the application. No persistent wrapper or second application process remains.

## Public shape

@api Provide a narrow API conceptually equivalent to `prepareRecipeEnvironment(): Promise<Result<PreparedEnvironment, BootstrapError>>` plus a composition helper that accepts a deferred application import. The result exposes only redacted slot ids/names, expiry/renewal facts, attempt identity, and warnings—not secret values.
@entry A generated or consumer-owned entry module follows `const prepared = await prepareRecipeEnvironment(); if error, render redacted failure and exit classified; await import(applicationSpecifier)`. Static application imports before preparation are forbidden in credential-bearing entrypoints.
@nonsecret Recipes with no credential slots may use the exact application entrypoint or the same bootstrap as a no-op after authority/attempt validation according to policy. Do not impose helper startup on every nonsecret target unless measurement and consistency justify it.
@preload Bun preload may become an optimized adapter only after tests prove top-level-await ordering, failure propagation, restart behavior, sourcemap/diagnostic safety, and absence of application evaluation before completion. It is not the normative V1 contract merely because it is convenient.

## Identity and environment

@references PM2 supplies only nonsecret opaque repository/recipe/grant/attempt/receiver/protocol references needed to initiate bootstrap. The helper independently resolves current repository and recipe authority and validates that the requesting process matches the receiver attempt.
@install Construct an allowlisted environment patch from declared slots. Reject undeclared slots, duplicate/case-fold collisions, NUL/invalid names, reserved loader/runtime variables, nonsecret-entry collisions, and values exceeding provider/platform budgets. Install only in the current process immediately before application import.
@inherit The recipe declares the nonsecret inheritance policy. Bootstrap augments that already filtered environment; it never copies the runner, broker, user shell, or PM2 daemon environment wholesale.
@failure Failure before import leaves application code unevaluated and exits with a typed non-restarting or policy-selected classification. No partial slot set is installed unless the recipe explicitly declares a safe atomic grouping policy; default delivery is all-or-nothing.

## Restart, renewal, and lifetime

@restart Every PM2 restart begins a fresh bootstrap, revalidates repository/recipe/grant/attempt/expiry/revocation, and reacquires current values. PM2 does not persist a plaintext environment for reuse.
@renewal V1 does not silently mutate arbitrary running application environments. Renewal either uses a scoped provider client/operation handle designed for rotation or triggers the recipe's declared safe restart/rebootstrap policy. Long-lived raw-environment recipes without safe renewal/termination policy are rejected.
@memory Release IPC payloads and helper references promptly. JavaScript cannot guarantee physical zeroization of immutable strings, so document the limitation and minimize copies, logging, closures, snapshots, and lifetime.

## Consumer integration

@bun Bun CLI/server/worker entrypoints can use the normative dynamic-import bootstrap directly.
@ui Browser bundles never receive OS-keychain credentials through this bootstrap. Build-time tools may use a broker-authorized recipe; browser code uses backend/scoped service APIs and public configuration only.
@deno Deno and other runtimes require an independently admitted cooperative adapter or receiver-native delivery. Do not launch a resident Bun capsule merely to claim universal support.

## Proof

@proof Test that no application top-level code runs before preparation; success/all-or-nothing failure; helper exit; no extra persistent process; PM2 restart revalidation; expired/revoked/drifted grants; attempt spoofing; slot collision/reserved variables; no-secret recipes; output/error redaction; secret canaries in PM2 state, argv, logs, journal, crash reports, bundles, and source maps; and browser/Deno typed rejection.
