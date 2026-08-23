---
id: broker-consent-and-car-unlock
kind: contract
status: proposed
created: 2026-08-23
updated: 2026-08-23
roadmap: broker
refs:
  - roadmaps/broker.md#consent-and-blast-radius-model
  - roadmaps/broker.md#git-scoped-recipe-command-authority
  - roadmaps/broker.md#build-trusted-key-entry-and-car-unlock-ui-plus-minimal-cli
  - roadmaps/broker.md#implement-encrypted-credential-car-export-and-import
hook: "read before implementing credential prompts, recipe enrollment, grant consent, PIN or passphrase handling, or encrypted-CAR import and refresh"
---

# Credential Entry, Consent, And Encrypted-CAR Unlock

@ordinary Ordinary enrollment opens a broker-owned masked console and displays broker-derived repository, canonical worktree, recipe, command/entrypoint, credential slot names, provider/account labels when known, and local grant expiry. The user enters the requested key; successful entry and acceptance is the consent event and stores the key through `Bun.secrets` plus a nonsecret recipe grant.
@ordinary Do not ask for a separate PIN, passphrase, Windows Hello gesture, reusable access code, or approval click in addition to normal key entry. A valid unexpired unchanged recipe grant runs non-interactively until expiry or revocation; changing the recipe revision requires new approval.
@new_repo An unchanged vetted recipe copied to a new Git repository may request an existing credential reference without asking the user to re-enter secret bytes. The broker must display the destination repository/worktree, recipe revision, credential label/slots, operations, and expiry and receive explicit approval before creating the new repository-scoped grant.
@existing An unchanged vetted recipe copied to another repository is still a new authority request. The broker displays the destination repository identity and requires explicit approval before binding an existing or newly entered credential to it. Existing-key selection may avoid re-entering the secret, but it never avoids destination-repository approval.
@car A PIN or passphrase may be requested only by an encrypted-CAR protection profile to derive/unlock decryption material for import or refresh-from-CAR. Its verifier and KDF parameters are profile metadata; the entered value is transient, masked, throttled, never logged, never sent to the agent, and released after the decrypt/import transaction.
@preview Before the PIN/passphrase prompt, display an authenticated nonsecret transfer preview containing transfer id, provider, redacted account label/identity, environment, secret kind, factual provider scopes, intended recipient, issue/transfer expiry, and trusted signer identity. The preview never contains secret bytes, PIN/KDF verifier material beyond the protection profile, destination project authority, or a local grant.
@preview_binding Bind the preview to the protected inner secret-transfer capability with a signed outer envelope or an equivalent cross-bound digest included in both authenticated structures. Verify outer graph integrity, required signer, intended recipient, expiry, and replay status before opening the prompt; after unlock, require exact semantic equality between preview and inner portable facts before any keychain or journal mutation.
@preview_failure The current generic private-inventory locator exposes only manifest/encrypted-inventory/KDF facts and cannot satisfy the preview ordering by itself. Do not treat an unauthenticated filename, caller label, or post-unlock-only display as consent. A preview mismatch, absent required signer, altered locator, expired/replayed transfer, or concealed unsupported provider fails closed without destination mutation.
@car_authority Successful CAR decryption proves possession of unlock material, not project authority. Import still verifies graph, signature, recipient/profile, expiry, replay, schema, and provider constraints, then creates a destination-local recipe grant only for an explicitly selected checked-in recipe.
@refresh Refresh-from-CAR means replacing or adding a local stored credential from a newer valid encrypted transfer. It does not contact the provider or extend upstream validity by itself. Provider renewal remains a separate adapter operation requiring actual refresh or authentication authority.
@failure Empty/cancelled input, prompt timeout, KDF failure, invalid CAR authentication, replay, expired transfer, destination conflict, keychain failure, recipe drift, and grant persistence failure produce distinct redacted outcomes. Never report whether a guessed PIN/passphrase was partially correct.
@proof Prove prompt ownership and displayed identity, masking, agent-channel isolation, no ordinary PIN path, noninteractive unchanged rerun, new enrollment after drift/expiry, CAR throttling/backoff, secret/passphrase absence from argv/env/log/audit/journal/crash fixtures, and transactional keychain/grant behavior.
