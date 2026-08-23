---
id: teleport-layer-3-protection-profiles
kind: contract
status: active
created: 2026-08-22
updated: 2026-08-23
roadmap: car-teleport
refs:
  - roadmaps/car-teleport.md#seven-layer-teleport-architecture
  - roadmaps/car-teleport.md#capability-scoped-encryption-and-portable-stores
hook: "read before adding encrypted, unencrypted, selective-disclosure, private-inventory, key-envelope, signature, or recipient-protection behavior"
---

# Layer 3: Protection Profiles

@contract Encrypted and unencrypted exports are protection profiles over the same canonical capability values and cartridge graph, not different semantic formats or codec registries.
@contract The assembly pipeline supports `plain`, `protected`, and `selective` profiles. Plain stores canonical capability blocks directly; protected wraps protected capability bytes in authenticated envelopes; selective permits independently shareable public capabilities beside protected private capabilities.
@contract The implemented `private-inventory` profile conceals capability inventory and policy-sensitive metadata behind a minimal bootstrap envelope without changing inner capability bytes, ids, schemas, dependencies, or restore semantics.
@contract Each newly encrypted capability uses a random data-encryption key and nonce. A cartridge key envelope wraps capability keys through a declared key provider such as a passphrase-derived key, device/account key, or recipient public key.
@contract Authenticated associated data binds capability id, schema version, instance id, envelope version, and cartridge security context so ciphertext cannot be transplanted across semantic identities or downgrade contexts.
@contract Opaque Fireproof chunks that are already authenticated ciphertext are preserved rather than encrypted again. Their sensitive native CID mapping, key names, metadata heads, and recovery descriptor remain inside a protected descriptor and their usable store key is wrapped by the cartridge envelope.
@contract Plain secret-bearing export remains representable as an explicit user-selected profile with accurate classification and policy confirmation; it is never mislabeled as protected. Applications may omit secret capabilities or forbid unsafe unattended export without changing the format.
@contract CID integrity does not establish authorship. Optional signatures bind a canonical cartridge/root statement separately from encryption, and verification reports signer identity and trust policy without authorizing restore effects.
@constraint Plaintext secrets, passphrases, derived keys, unwrapped data/store keys, recipient private keys, and secret-derived diagnostics never enter public descriptors, logs, URLs, process arguments, environment, telemetry, or transport metadata.
@evidence 2026-08-22 plain/selective/passphrase profiles, per-capability AES-GCM keys with identity-bound AAD, RSA-OAEP recipient envelopes, multi-recipient rotation, provider-backed key lookup, Ed25519 graph signatures, and encrypted private-inventory CAR wrapping pass neutral tests including wrong-key cases.
@evidence 2026-08-22 `fireproof-split-teleport.ts` emits a protected `wx.fireproof.store@2` descriptor linked by CID and hard dependencies to raw native ciphertext chunks and a raw already-wrapped keybag. Plain/protected round trips assert exact native bytes and wrong-key rejection without ciphertext rewrapping.
@evidence 2026-08-22 `BrowserDeviceRecipientKeyProvider` is an optional platform adapter over the generic provider port. It creates non-extractable RSA-OAEP keys, persists them by IndexedDB structured clone, validates bounded key identities, supports explicit deletion/rotation lifecycle, and never exports private key bytes. Real Edge proves persistence across provider/database reopen and a complete protected-cartridge unlock before deleting its fixture key.
@evidence 2026-08-22 `TeleportRecipientUnwrapProvider` supplies the account/KMS/hardware seam: the authority receives only its local key id and wrapped data-key bytes, while the generic protection layer consumes the returned 32-byte wrapping key. Neutral proof unlocks a complete cartridge without exposing a private key through the provider interface.
@proof_gap Binding the operation-mediated provider to a selected real account/KMS authority and proving authentication, authorization, denial, audit, rotation, and revocation are deployment-specific conformance work, not missing generic protection-profile behavior.
