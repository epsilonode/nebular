---
id: broker-request-grant-transfer-state-machines
kind: contract
status: proposed
created: 2026-08-23
updated: 2026-08-23
roadmap: broker
refs:
  - roadmaps/broker.md#consent-and-blast-radius-model
  - roadmaps/broker.md#define-closed-broker-contracts-and-threat-model
  - roadmaps/broker.md#implement-encrypted-credential-car-export-and-import
hook: "read before implementing request, consent, grant, lease, renewal, revocation, encrypted export, import, replay, or transaction state"
---

# Request, Grant, Lease, And Transfer State Machines

@contract Model request, grant, lease, export, and import lifecycles as discriminated states with explicit pure transition functions instead of mutable records containing partially related booleans and timestamps.
@contract A request advances through received, parsed, policy-accepted, awaiting-consent, approved or denied, and expired states. Only an approved unexpired request can produce a locally bound grant.
@contract A grant records canonical project, provider/account/environment, permitted scopes or operations, local expiry, upstream expiry facts, renewal authority, and delivery modes. Scope expansion constructs a new consent request rather than mutating approval in place.
@contract A lease is narrower and no longer lived than its grant, binds one delivery operation and process or client identity, and becomes expired or consumed without mutating its historical audit identity.
@contract Ordinary recipe enrollment derives consent from broker-owned requested-key entry. PIN/passphrase verification exists only in encrypted-CAR import or refresh-from-CAR transitions and proves local import consent; provider renewal separately requires explicit refresh, token-exchange, or new-authentication authority.
@contract Secret transfer advances through verified, recipient-matched, decrypted, policy-accepted, consent-approved, keychain-staged, committed, consumed, or recovery-required states. No transition skips graph verification, recipient policy, expiry, replay, or consent.
@contract Imported provider scopes are factual constraints, never local project authorization. The destination broker creates its own grant from local policy and consent.
@contract Transition functions consume a supplied clock and immutable inputs and return typed results; they do not read ambient time or perform effects.
@proof State-machine tests cover every legal transition and prove illegal transitions are unrepresentable or rejected, including lease-before-consent, expired renewal, scope widening, replay, wrong recipient, overwrite without elevation, and imported-authority escalation.
