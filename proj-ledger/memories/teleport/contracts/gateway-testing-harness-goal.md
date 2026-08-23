---
id: gateway-testing-harness-goal
kind: strategy
status: active
created: 2026-08-16
updated: 2026-08-16
roadmap: car-teleport
refs:
  - roadmaps/car-teleport.md#one-shot-cloudflare-verification-harness
  - roadmaps/car-teleport.md#automated-security-and-portability-evidence
  - roadmaps/car-teleport.md#one-shot-verifier-does-not-continue-as-an-agent
  - roadmaps/car-teleport.md#credential-bound-diagnostic-session
hook: "read before changing gateway harness scope, success criteria, autonomous diagnosis behavior, live proof, evidence output, or repair escalation"
---

# Testing Harness And Cloudflare Gateway Goal

@goal Prove, diagnose, and where safely possible repair the personal Researcher path `browser credentials -> Cloudflare AI Gateway -> Kilo Gateway` without exposing credentials or depending on source/environment secret injection.

## Current Minimum Harness

@contract The user exports one protected `passphrase-wrapped-v1` CAR or explicitly chooses an `unprotected-v1` trusted-local-testing CAR from the same Researcher origin that owns the saved provider settings.
@contract The local harness prompts once for protected mode or runs without credential interaction for explicit unprotected mode, validates the archive, restores Fireproof in isolation, removes temporary disk state, and uses only private in-memory credentials.
@contract Deterministic proof requires both `GET /models` and one bounded streamed `POST /chat/completions` through Cloudflare with the expected two authentication headers.
@contract Success is a redacted `schemaVersion: 1` JSON result ending in `gatewayVerification: "passed"`; raw secrets, URLs, prompts, model identifiers, catalogs, completions, bodies, and Fireproof internals are absent.
@contract The operator confirms Cloudflare payload logging is disabled or minimized before a prompt is sent because the Run token cannot inspect that policy.

The current one-shot command is intentionally deterministic:

```text
verify archive -> prompt once -> restore and delete temp store
  -> validate Cloudflare destination
  -> confirm logging policy
  -> GET /models
  -> POST one fixed streamed completion
  -> emit one redacted result -> exit
```

## Complete Gateway Acceptance

@constraint Node/Bun success proves credential validity and Cloudflare-to-Kilo routing but does not prove browser `file://` CORS behavior.
@constraint Browser acceptance separately saves settings, tests model discovery, completes a streamed prompt, and confirms requests target Cloudflare rather than Kilo directly.
@finding The real browser acceptance attempt isolated missing CORS response headers after successful Node/Bun proof; hosted browser completion now belongs to the AI relay roadmap.
@constraint Cloudflare observability should correlate the model and completion operations with the intended gateway and `kilo` custom provider without retaining sensitive payloads.

## Agentic Diagnostic Target

@decision The minimum upgrade is a level-3 autonomous diagnostician: one unlock starts a bounded local state machine that probes, classifies, safely retries, and produces remediation without further operator steering.
@constraint The control plane is deterministic and local; it cannot depend on the gateway under diagnosis. Optional model reasoning begins only after transport proof and sees redacted evidence only.
@constraint Safe Run-token repair is limited to session-local normalization, model fallback, eligible retry timing, browser-CORS proof, and explicit recommendations. It never mutates Cloudflare account configuration or rewrites the browser CAR automatically.
@constraint A future level-4 repair agent requires a separately entered AI Gateway Edit token, read-only discovery, typed dry-run plan, explicit mutation approval, allowlisted apply, verification, receipts, and rollback.

The level-3 target adds autonomy without broadening credential authority:

```text
unlock once -> create private GatewayPort -> run bounded diagnosis policy
  -> observe -> classify -> choose safe action -> probe affected seam
  -> stop on pass, diagnosis, cancellation, or budget exhaustion
  -> redact report -> destroy session capability
```

@contract `verify` remains the short proof mode. `diagnose` owns iterative classification and safe session repair. Future `repair-config` remains unavailable until the separate management credential contract is accepted and implemented.
@contract A successful diagnosis is not equivalent to a functioning gateway. Reports distinguish transport pass, classified failure, inconclusive evidence, and repaired-and-reverified outcomes.

## Failure Taxonomy

@accept Distinguish invalid CAR/passphrase/restore, invalid gateway URL, Cloudflare authentication, Kilo authentication, wrong gateway/provider/path, timeout/rate limit/transient 5xx, malformed/empty catalog, missing/truncated/malformed stream, absent `[DONE]`, and browser-only CORS.
@accept Every autonomous branch obeys hard request, retry, completion, byte, time, cancellation, redaction, and cleanup budgets.

## Harness Layers

@harness Atomic CAR/crypto tests prove format, tamper detection, passphrase wrapping, and redaction primitives without Fireproof or network effects.
@harness Fireproof seam tests prove encrypted chunk/key portability, metadata reconstruction, normal document reopen, and cleanup.
@harness Gateway fake-port seams prove exact paths/header names, bounded model/completion behavior, state transitions, retries, and output projection without real credentials.
@harness Browser `file://` proof validates origin-scoped IndexedDB capture/export and separately validates Cloudflare browser CORS behavior.
@harness Deliberate live proof is the only evidence that the current real credentials, account gateway, custom provider, and upstream Kilo route work together.

## Completion Definition

@accept Minimum level-3 completion requires deterministic diagnosis for every accepted failure class, bounded safe retries, interruption cleanup, marker-based non-disclosure, real valid-route proof, and browser CORS separation.
@accept Level-4 completion additionally requires source-backed Cloudflare API contracts, separate Edit credential handling, read-only discovery, dry-run plans, explicit approval, allowlisted mutation, rollback, and live repair proof.
