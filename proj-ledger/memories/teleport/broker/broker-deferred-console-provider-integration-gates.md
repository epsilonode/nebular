---
id: broker-deferred-console-provider-integration-gates
kind: strategy
status: proposed
created: 2026-08-23
updated: 2026-08-23
roadmap: broker
refs:
  - roadmaps/broker.md#build-trusted-key-entry-and-car-unlock-ui-plus-minimal-cli
  - roadmaps/broker.md#add-provider-adapters-and-renewal
  - roadmaps/broker.md#cross-workspace-developer-workflow
  - memories/teleport/broker/broker-consent-and-car-unlock.md
hook: "read before choosing the Windows console host, final CLI aliases, first provider adapter, first consumer workspace, or treating those selections as blockers for broker core"
---

# Deferred Console, Provider, And Consumer Integration Gates

@decision Final Windows console-host mechanics, CLI aliases, first provider, and first consumer workspace do not block tooling, domain, recipe extraction, IPC, SQLite, keychain-port, receiver-algebra, or conformance-fixture implementation. They become mandatory only before their respective integration slices close.

## Trusted console gate

@timing Select and prove the Windows console host before implementing the production consent UI. The choice must support a distinct user-visible window, masked input, broker-derived identity display, cancellation/timeout, parent/child result correlation, and no secret in argv, environment, shell history, clipboard, logs, SQLite, or crash output.
@candidates Evaluate direct Windows new-console process creation and an available terminal host through a narrow `TrustedPromptPort`. Do not make PowerShell, `cmd /c start`, Windows Terminal, or a GUI framework normative until lifecycle, quoting, availability, spoof resistance, and result-channel proof passes.
@fallback A missing preferred terminal returns a typed unavailable prompt outcome or uses an explicitly admitted second host. It never falls back to reading a key in the agent's current console/chat channel.

## Provider gate

@timing Implement provider-neutral contracts first. Select the first real provider before the provider-adapter slice and a second materially different provider before claiming the registry abstraction is general.
@selection Choose providers from real Mise-managed workflows using the broker, favoring restricted/short-lived credentials and observable renewal/revocation APIs. Do not distort the generic contract around Dataminr, Cloudflare, Supabase, or another incidental current use case merely because it is convenient.
@proof Each provider proof uses a real development credential entered outside chat, exercises the minimum admitted operations, expiry/refresh/revocation facts, redacted diagnostics, and cleanup without committing secrets or synthetic provider behavior.

## Consumer gate

@timing Select two consumer workspaces before cross-workspace rollout proof, not before core implementation. At least one should exercise cooperative Bun/JS/TS bootstrap and one should exercise a materially different scoped-client, build/deploy, or runtime boundary.
@ownership Consumer recipes and integration code remain in their owning repositories; this roadmap owns only generic contracts and conformance. Consumers use Mise or uv according to their local agent policy.
@proof Show distinct repository approvals and least-privilege grants cannot cross-consume each other's credential authority even when recipes are textually copied.

## Packaging names

@aliases Final human-facing bin aliases may be chosen during packaging after four artifact/subpath contracts stabilize. Names cannot merge privileged broker administration with unprivileged recipe-runner authority or introduce extra runtime artifacts.
@gate Record each selection and evidence before marking its roadmap item done; no selection here reopens the accepted security, recipe, receiver, SQLite, IPC, or four-artifact boundaries.
