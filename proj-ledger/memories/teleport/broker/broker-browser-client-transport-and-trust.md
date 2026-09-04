---
id: broker-browser-client-transport-and-trust
kind: contract
status: proposed
created: 2026-09-05
updated: 2026-09-05
roadmap: broker
refs:
  - roadmaps/broker.md#add-browser-broker-client-and-authenticated-bridge
  - memories/teleport/broker/broker-inherited-ipc-v1-contract.md
  - memories/teleport/broker/broker-request-grant-transfer-state-machines.md
  - memories/teleport/broker/broker-secret-values-and-lifetime.md
hook: "read before designing a browser broker client, exposing a browser-to-broker transport, adding localhost/IPC bridge code, pairing a browser origin, or publishing a browser broker API"
---

# Browser Broker Client Transport And Trust

@boundary The browser client is an unprivileged presentation and request surface. It is not the existing Bun inherited-IPC client, a broker runtime, a receiver, a secret-delivery endpoint, or a trusted recipe executor.
@carrier The existing short-lived inherited Bun IPC control channel is intentionally unavailable to browsers. Do not tunnel it through a browser shim, expose its bootstrap methods, or make browser callers emulate a child process.
@decision The exact browser bridge carrier remains an explicit design decision. Before implementation, record why its local reachability, authentication, origin binding, user pairing, session expiry, replay defense, disconnect, broker restart, revocation, and hostile same-user behavior meet this contract. A raw localhost HTTP/WebSocket listener, ambient endpoint discovery, and unauthenticated loopback are not defaults and are not admitted merely for convenience.
@pairing A browser origin becomes eligible only after a broker-mediated, user-visible pairing ceremony. Pairing binds the exact origin, current user, broker instance/release, and a short bounded session; it is single-use or replay-resistant, cancellable, revocable, and produces only opaque nonsecret handles. Redirected, lookalike, file, extension, and changed origins fail closed unless specifically admitted and proved.
@api Browser messages are versioned, bounded, schema-validated intents and redacted events. They may request approval/status/cancellation/revocation operations that the broker policy exposes, but they cannot assert trusted repository or recipe identity, consent context, scope, account/environment, grant ownership, process ownership, or secret possession.
@authority The broker re-derives and revalidates every authority fact from its own trusted sources before acting. A browser-visible identifier is a correlation hint only. User approval is rendered by the broker-owned trusted surface, never by a browser-controlled prompt or label.
@secrets Browser code never receives credential plaintext, raw-token access, secret-derived identifiers, secret-bearing environment patches, cooperative bootstrap material, keychain responses, provider refresh material, or privileged process-launch capability. It retains no secret in DOM, storage, URL, worker cache, console, diagnostics, event stream, bundle, source map, or crash report.
@lifecycle The bridge reports bounded redacted progress and one typed terminal outcome. Disconnect, browser reload, broker restart, pairing expiry, revocation, cancellation, malformed messages, and transport failure have distinct nonsecret outcomes. A browser reconnect never silently revives expired or revoked authority.
@proof Use real-browser tests with at least allowed-origin success plus wrong-origin, stale/replayed pairing, unauthenticated local peer, malformed/oversized input, concurrent request correlation, disconnect, broker restart, cancellation, revocation, and expiry cases. Synthetic secret canaries prove absence from every browser-observable surface.
@forbid Do not add a generic browser RPC proxy, a persistent browser-held broker capability, arbitrary command/recipe execution, raw HTTP headers/body passthrough, implicit CORS relaxation, an origin wildcard, a browser secret cache, or a fallback that degrades to the Bun client.
