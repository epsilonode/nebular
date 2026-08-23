---
id: cloudflare-repair-boundary
kind: decision
status: active
created: 2026-08-16
updated: 2026-08-16
roadmap: car-teleport
refs:
  - roadmaps/car-teleport.md#one-shot-cloudflare-verification-harness
  - roadmaps/car-teleport.md#credential-bound-diagnostic-session
  - roadmaps/car-teleport.md#safe-local-repair-actions
  - roadmaps/car-teleport.md#separate-management-credential
  - roadmaps/car-teleport.md#inspect-plan-apply-verify-repair-agent
  - roadmaps/car-teleport.md#autonomous-repair-safety
hook: "read before adding Cloudflare inspection, mutation, repair tools, management credentials, or autonomous apply behavior"
---

# Cloudflare Repair Boundary

@decision The browser CAR carries only the personal Kilo credential and Cloudflare AI Gateway Run token. CAR schema v1 never carries an account management token.
@constraint A Run token can authenticate inference traffic but cannot inspect or modify gateway settings, authenticated-gateway state, custom providers, logging policy, budgets, or rate limits.
@constraint Current repair is local and advisory: normalize the private session URL, choose a valid model, retry an eligible transient probe, distinguish browser CORS, or recommend an exact user-approved browser setting change.
@constraint Never claim Cloudflare configuration repair from successful inference traffic alone. Record only route proof and observed failure classification.
@decision Future account repair requires a separate least-privilege token with Account AI Gateway Edit permission, entered through a distinct session channel and never forwarded upstream.
@constraint Read-only discovery must land before mutation: selected gateway identity/settings, authentication state, custom `kilo` provider slug/base URL, logging policy, and limits.
@constraint Mutation follows inspect -> typed plan -> dry-run -> explicit approval -> allowlisted apply -> verify -> sanitized receipt. No direct plan-to-apply transition is allowed.
@constraint Limit changes to the selected gateway and `kilo` custom provider. Expose no generic Cloudflare API tool and reject operations outside the accepted repair surface.
@constraint Every mutable setting needs a captured prior value, rollback operation, post-change deterministic probe, and failure-safe rollback proof.
@constraint Account-scoped tokens, Cloudflare responses, dashboard metadata, and payload policy details are sensitive agent inputs and obey the same bounded redaction contract as provider credentials.
@blocker Exact current Cloudflare management API contracts and permission behavior require source-backed research before implementing repair tools.
