---
id: kilo-gateway-route
kind: contract
status: superseded
created: 2026-08-16
updated: 2026-08-16
roadmap: car-teleport
superseded_by: cloudflare-gateway-setup
refs:
  - memories/ai-relay/evidence/cloudflare-gateway-setup.md
hook: "read before changing Kilo provider URLs, Cloudflare custom-provider mapping, request headers, model discovery, completion probes, or gateway failure classification"
---

# Kilo Gateway Route Contract

@note Superseded by `../../ai-relay/evidence/cloudflare-gateway-setup.md` after live proof established Cloudflare's actual fixed-prefix path-joining behavior. The content below preserves the pre-fix contract for historical diagnosis only.

@source `C:/proj/wx-landing/ledger/cf-gateway.md` is the detailed account setup checklist; this card is the runtime route contract used by Researcher and the harness.

## Route

```text
Researcher or local harness
  -> https://gateway.ai.cloudflare.com/v1/{account_id}/{gateway_id}/custom-kilo/api/gateway
  -> https://api.kilo.ai/api/gateway
```

@contract Account ID is `7eaf32570ed54321d9e518504f786d68`.
@contract Cloudflare custom provider name is `Kilo`, slug is `kilo`, base URL is exactly `https://api.kilo.ai`, and the provider remains enabled.
@contract Researcher supplies `/api/gateway` after `/custom-kilo`; Cloudflare appends that suffix to the custom-provider base URL.
@constraint Do not configure the custom-provider base URL as `https://api.kilo.ai/api/gateway`; doing so duplicates the Kilo prefix.
@constraint Do not omit `/api/gateway` from the Researcher/verification base URL; doing so sends requests to the wrong upstream path.

## Supported Operations

```text
GET  {gatewayBaseUrl}/models
POST {gatewayBaseUrl}/chat/completions
```

@contract `Authorization: Bearer {kilo_api_key}` is forwarded by Cloudflare to Kilo.
@contract `cf-aig-authorization: Bearer {cloudflare_gateway_run_token}` authenticates the Cloudflare gateway request.
@constraint The Run token needs AI Gateway Run permission and is account-scoped rather than gateway-scoped. It is not a dashboard login, global API key, Worker secret, or AI Gateway Edit token.
@constraint Personal Kilo authentication remains local. This flow does not use Cloudflare BYOK, Secrets Store, or Unified Billing.

## Model And Completion Behavior

@contract Model discovery accepts string IDs from `data[]`. Use the saved default only when present; otherwise select the first valid ID.
@contract Kilo's OpenAI-compatible catalog may omit explicit tool-capability metadata even when models support tool calls; absence of capability metadata alone is not a route failure.
@contract The proof completion uses one fixed short prompt, streaming enabled, bounded response bytes/time, at least one non-empty data event, and normal `[DONE]` completion.

## Diagnostic Meaning

@finding A Cloudflare-attributed 401 indicates missing/invalid/disabled gateway authentication; a Kilo-attributed 401 indicates missing/invalid provider authentication.
@finding A Cloudflare-attributed 404 indicates wrong account/gateway/custom-provider route or disabled provider; an upstream Kilo 404 commonly indicates duplicated or omitted `/api/gateway`.
@unknown A bare status code does not always prove which layer produced it. Autonomous attribution requires sanitized response provenance, Cloudflare observability correlation, or controlled probes without projecting raw bodies.
@finding Node success plus browser preflight failure isolates the remaining problem to browser CORS. Do not disable gateway authentication; evaluate a narrowly scoped authenticated CORS facade only after that proof.
@constraint Payload logging, caching, rate limits, and budgets are Cloudflare gateway policies. Start with payload logging disabled/minimized and caching disabled for agent conversations.
