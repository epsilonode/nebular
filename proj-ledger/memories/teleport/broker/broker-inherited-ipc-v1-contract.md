---
id: broker-inherited-ipc-v1-contract
kind: contract
status: proposed
created: 2026-08-23
updated: 2026-08-23
roadmap: broker
refs:
  - roadmaps/broker.md#adopt-and-harden-pk-ipc-and-lifecycle-semantics
  - roadmaps/broker.md#implement-os-backed-vault-and-local-broker
  - roadmaps/broker.md#add-child-process-and-jsts-clients
  - memories/teleport/broker/broker-request-grant-transfer-state-machines.md
  - memories/teleport/broker/broker-secret-values-and-lifetime.md
  - memories/teleport/broker/broker-durable-bootstrap-authority-and-cleanup.md
hook: "read before implementing Bun parent-child IPC, defining broker envelopes, adding IPC authentication, transmitting bootstrap credentials, handling disconnect or cancellation, or proposing localhost/Hono"
---

# Inherited IPC V1 Contract

@decision Use inherited Bun parent-child IPC for short-lived V1 broker operations. Do not open TCP, HTTP, Hono, WebSocket, localhost, discoverable socket, or persistent broker endpoints. The runner or cooperative target spawns the privileged `broker.js` operation, exchanges one bounded request flow, observes a terminal result, closes IPC, and allows the helper to exit.
@channel Treat the inherited OS handle plus immediate parent/child relationship as the private transport capability within the documented same-user threat model. This is not proof against arbitrary hostile code already executing as the same user; broker-side Git, recipe, grant, attempt, expiry, and operation validation remains mandatory.

## Ordinary control envelopes

@envelope Every nonsecret control message contains `protocolVersion`, `messageKind`, `requestId`, optional `attemptId`, monotonically increasing `sequence`, supplied-clock timestamp or duration fact where needed, and a message-specific validated payload.
@messages Use closed message kinds for hello/capabilities, request, accepted/blocked, progress, observation, output chunk/cursor, cancellation, disconnect, terminal success/failure, and protocol error. Unknown kinds, extra authority-bearing fields, invalid ids, sequence regressions, oversized payloads, or unsupported versions fail typed.
@bounds Specify maximum encoded message bytes, maximum output chunk bytes, maximum retained diagnostic issues, handshake/start/idle/terminal deadlines, sequence limit, and cancellation grace. Oversize output is cursor-truncated at its source rather than embedded wholesale.
@correlation The child echoes broker-issued correlation and attempt identities after validation. Caller-supplied ids select no authority. Duplicate request ids are idempotent only where a journaled operation id proves prior state; otherwise they fail conflict.
@redaction Ordinary control messages never contain raw credentials, PINs, passphrases, decrypted CAR bytes, complete secret environments, keychain lookup results, or arbitrary serialized exceptions. Diagnostics are explicit redacted projections.

## Secret bootstrap exchange

@separate Credential material uses a distinct closed bootstrap protocol invoked only after broker-side authority and target-attempt checks. Do not add optional secret fields to ordinary control/status envelopes or reuse output/event serializers for credential delivery.
@request The cooperative target supplies nonsecret protocol, repository/recipe/grant/attempt/receiver references and requested declared slot ids. The helper independently resolves and validates current authority rather than trusting those claims.
@authority The request references are locators only. The helper joins durable grant and attempt records to a current PM2/OS parent-process proof and a fresh checked-in Git recipe read, compares repository/revision/generation/receiver/attempt/slots exactly, and atomically claims one nonterminal bootstrap lease before reading the keychain.
@response The helper returns either a typed redacted failure or one bounded map of admitted slot id/injection name to secret bytes/strings over the inherited private channel. It never returns extra credentials, provider metadata unnecessary for delivery, refresh authority, or a reusable environment snapshot.
@lifetime The target installs values immediately, acknowledges only lease/attempt/slot ids, slot count, and completion, drops message references, disconnects, and lets the helper exit. Neither endpoint journals, audits, logs, retries, snapshots, or crash-dumps the secret-bearing payload.
@terminal The transport resolves success only after the helper persists `active -> consumed`, disconnects, and exits 0. If installation has occurred and acknowledgement send, disconnect, deadline, durable terminal transition, or helper exit fails, the target invokes its private environment rollback capability and reports a typed redacted failure.

## Lifecycle

@handshake Parent and child exchange exact protocol/build/capability versions before the request. Incompatibility fails before keychain access or receiver mutation.
@disconnect Parent cancellation or disappearance cancels pre-materialization work and finalizes scoped resources. After receiver materialization, disconnect policy follows the recipe lifecycle: bounded one-shot may continue under receiver ownership; foreground requests may cancel; services remain receiver-owned. The journal records redacted disposition.
@cancel Cancellation names request/attempt and expected generation, is idempotent, and produces progress plus one terminal result. Closing the IPC channel is not itself an authoritative cancellation command.
@exit Broker helpers exit after their one operation and close keychain, SQLite, PM2/control, prompt, file, and IPC resources through scoped finalizers. A helper left resident after a terminal result fails conformance.
@unavailable The public broker root may recognize the exact bootstrap child marker while returning configuration exit 78 before the handshake when production authority adapters are absent. It must not run a test/fake authority composition or deliver values merely to make the entrypoint appear complete.

## Proof

@proof Test protocol mismatch, malformed/oversized messages, duplicate ids, sequence gaps, delayed/missing terminal result, parent and child crashes, cancellation races, target restart, bootstrap replay, undeclared slots, expired/revoked/drifted grants, attempt mismatch, receiver mismatch, secret canaries across ordinary envelopes/logs/journal/crash output, and absence of listeners after exit.
@proof Prove ordinary control fixtures are safe to persist for diagnostics only after redaction, while secret-bootstrap fixtures use ephemeral test values and are never captured in snapshots or forensic logs.
