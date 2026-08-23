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
@trusted_prompt The credential-entry algebra accepts only an awaiting-consent enrollment transition whose correlation, idempotency key, grant generation, deadline, repository, recipe, executable, provider authority, slots, delivery mode, and expiry exactly match broker-derived facts. Its port requires a distinct user-visible broker window, masked bounded input, clipboard prohibition, and callback-scoped `SecretInput`; accepted output is only a redacted stored receipt and lifecycle event.
@trusted_host The algebra and prompt-to-`Bun.secrets` orchestration do not choose or implement the production Windows prompt host. Until a host proves separate-window ownership, masking, cancellation/timeout, spoof-resistant broker identity, and absence of secret input from argv/environment/IPC/log/clipboard/crash artifacts, credential entry and CAR unlock remain non-user-operable.
@car A PIN or passphrase may be requested only by an encrypted-CAR protection profile to derive/unlock decryption material for import or refresh-from-CAR. Its verifier and KDF parameters are profile metadata; the entered value is transient, masked, throttled, never logged, never sent to the agent, and released after the decrypt/import transaction.
@preview Before the PIN/passphrase prompt, display the authenticated public preview: transfer id, provider, non-reversible account hint, environment, secret kind, factual provider scopes, intended recipient, issue/transfer/upstream expiry, trusted signer identity, and encrypted-inventory identity. The preview never contains account id/label, secret bytes, PIN/KDF verifier material beyond the protection profile, destination project authority, or a local grant.
@preview_binding Encode the preview as a required signed public capability bound both to the opaque encrypted-inventory CID and to a canonical digest of the complete inner portable facts. Verify outer graph/dependency shape, signature trust, intended recipient, expiry, and replay state before invoking unlock; after unlock, require the same signer set and exact semantic/digest binding before destination planning or mutation.
@preview_failure Do not treat an unauthenticated filename, caller label, inventory locator, or post-unlock-only display as consent. A preview mismatch, changed signer set, absent required signer, altered inventory, recipient mismatch, expiry/replay, or concealed unsupported provider fails closed without destination mutation.
@preview_account The current public contract deliberately exposes an opaque account hint rather than account id or label. If user consent requires a recognizable account label before unlock, resolve that privacy-versus-identifiability decision and revise the authenticated schema before shipping; do not silently display unauthenticated caller text.
@car_authority Successful CAR decryption proves possession of unlock material, not project authority. Import still verifies graph, signature, recipient/profile, expiry, replay, schema, and provider constraints, then creates a destination-local recipe grant only for an explicitly selected checked-in recipe.
@refresh Refresh-from-CAR means replacing or adding a local stored credential from a newer valid encrypted transfer. It does not contact the provider or extend upstream validity by itself. Provider renewal remains a separate adapter operation requiring actual refresh or authentication authority.
@failure Empty/cancelled input, prompt timeout, KDF failure, invalid CAR authentication, replay, expired transfer, destination conflict, keychain failure, recipe drift, and grant persistence failure produce distinct redacted outcomes. Never report whether a guessed PIN/passphrase was partially correct.
@proof Prove prompt ownership and displayed identity, masking, agent-channel isolation, no ordinary PIN path, noninteractive unchanged rerun, new enrollment after drift/expiry, CAR throttling/backoff, secret/passphrase absence from argv/env/log/audit/journal/crash fixtures, and transactional keychain/grant behavior.
