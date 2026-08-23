---
id: agentic-gateway-diagnostician
kind: proposal
status: proposed
created: 2026-08-16
updated: 2026-08-16
roadmap: car-teleport
refs:
  - roadmaps/car-teleport.md#one-shot-verifier-does-not-continue-as-an-agent
  - roadmaps/car-teleport.md#deterministic-control-plane-before-model-reasoning
  - roadmaps/car-teleport.md#credential-bound-diagnostic-session
  - roadmaps/car-teleport.md#live-autonomous-diagnosis-matrix
hook: "read before implementing autonomous gateway diagnosis, credential-bound session tools, retries, budgets, or diagnostic state machines"
---

# Agentic Gateway Diagnostician Proposal

## Mission

After one passphrase entry, run a bounded autonomous local mission that proves or diagnoses the configured Cloudflare AI Gateway to Kilo path. The process owns credentials privately until exit; the policy receives capabilities, never secret strings.

The control plane must be deterministic because a broken gateway cannot reliably host the agent responsible for diagnosing itself. Model reasoning is optional after a successful completion and may summarize only already-redacted evidence.

## Session Lifecycle

```text
locked
  -> validating_archive
  -> unwrapping_keybag
  -> restoring_fireproof
  -> ready
  -> diagnosing
  -> resolved | failed | cancelled | budget_exhausted
  -> closed
```

Every event carries a session/request identity. Stale or duplicate completions become bounded diagnostics and cannot advance state. Closing aborts in-flight work, drops credential closures, closes Fireproof handles, and removes temporary storage.

Proposed source ownership:

```text
scripts/verify-agent-gateway.ts                 CLI composition and projection
scripts/lib/restore-provider-fireproof.ts       isolated credential restore
scripts/lib/gateway-transport.ts                 private credential-bound GatewayPort
scripts/lib/gateway-diagnosis/types.ts           closed commands/events/outcomes
scripts/lib/gateway-diagnosis/machine.ts         pure identity-guarded lifecycle
scripts/lib/gateway-diagnosis/policy.ts          next probe/retry/remediation decision
scripts/lib/gateway-diagnosis/redaction.ts       bounded public report projection
scripts/lib/gateway-diagnosis/catalog.ts         diagnosis -> safe action mapping
```

These names are a proposal, not landed structure. Keep modules together until a boundary has independent tests or reuse pressure.

## Private Capability Boundary

Create a session-local `GatewayPort` that closes over `baseUrl`, Kilo key, and Cloudflare Run token. Its public operations accept no URL or headers:

```ts
type GatewayPort = Readonly<{
  listModels(signal: AbortSignal): Promise<ModelProbeResult>;
  streamFixedCompletion(model: string, signal: AbortSignal): Promise<CompletionProbeResult>;
}>;
```

Do not expose generic fetch, raw headers, raw response bodies, arbitrary prompts, shell, filesystem, environment, browser storage, or Cloudflare management operations.

## Diagnostic Policy

Run URL validation and model discovery first. Classify Cloudflare auth, upstream Kilo auth, route/provider path, HTTP status, timeout, catalog shape, and network failures before considering completion.

Choose the saved model only when present; otherwise choose the first valid model ID and record only its hash. Send one fixed bounded prompt. Require HTTP success, a response body, non-empty SSE data, byte ceiling, `[DONE]`, and normal completion.

Retry only transient network/timeout/429/eligible 5xx observations under a small attempt and elapsed-time budget. Never blindly retry 401, 403, 404, malformed catalog/SSE, missing body, or billable completion failures.

If Node probes pass but browser behavior is unproven, invoke the existing `file://` browser seam or return a browser-CORS diagnosis. Node success is not browser CORS proof.

The policy loop is finite:

1. Decode the next state and remaining budget.
2. Select at most one allowlisted probe or safe session action.
3. Execute through a narrow port with an identity and abort signal.
4. Convert completion into a closed redacted event.
5. Reduce state and stop at a terminal outcome or repeat within budget.

No model chooses tools, URLs, headers, credentials, retry limits, or Cloudflare mutations in level 3.

## Repair At Run-Token Scope

The diagnostician may normalize a trailing slash in its private session, select a catalog fallback, adjust an eligible retry delay, or recommend an exact browser setting correction. It must not rewrite the CAR or browser Fireproof database automatically.

Cloudflare account configuration is not repairable with the Run token. Return a typed `management_permission_required` outcome when evidence points to gateway/custom-provider/auth/logging configuration.

## Budgets And Output

Set hard ceilings for total requests, completion requests, retries, response bytes, elapsed time, and cancellation. A practical first contract is one model request, one completion request, at most two transient retries per stage, 256 KiB per response, and a two-minute session ceiling.

Output a versioned redacted mission report containing ordered observations, policy decisions, safe actions, stage/status/timing/count evidence, final diagnosis, confidence, and operator next steps. Apply the existing secret/base URL/prompt/response/model redaction contract to every event and failure.

Suggested public outcome shape:

```ts
type GatewayDiagnosisReportV1 = Readonly<{
  schemaVersion: 1;
  mode: "diagnose";
  outcome: "passed" | "diagnosed" | "inconclusive" | "cancelled" | "budget_exhausted";
  diagnosis: string;
  confidence: "high" | "medium" | "low";
  observations: readonly RedactedObservation[];
  actions: readonly RedactedAction[];
  nextSteps: readonly string[];
  budgets: Readonly<{ requests: number; completions: number; retries: number; totalMs: number }>;
}>;
```

The concrete diagnosis and action fields should become closed unions before implementation; plain strings above only illustrate report composition.

## Required Proof

Use fake ports for full transition and retry matrices. Add deliberate live cases for valid credentials, invalid Cloudflare token, invalid Kilo key, wrong gateway, wrong provider path, timeout, malformed stream, and browser-only CORS failure. Every case must prove temporary cleanup and marker-based non-disclosure.
