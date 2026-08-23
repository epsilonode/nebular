---
id: teleport-security-and-store-portability
kind: contract
status: active
created: 2026-08-22
updated: 2026-08-22
roadmap: car-teleport
refs:
  - roadmaps/car-teleport.md#capability-scoped-encryption-and-portable-stores
  - roadmaps/car-teleport.md#transactional-import-migration-and-restore-planning
  - roadmaps/car-teleport.md#seven-layer-teleport-architecture
hook: "read before changing Teleport encryption, credential capabilities, Fireproof store export, key envelopes, or destructive restore policy"
---

# Capability Security And Portable Store Contract

@contract Plain, protected, and selective export are first-class protection profiles over the same canonical capability graph. Protection changes block envelopes and disclosure, never capability identity, semantic schema, migration, dependency, or restore semantics.
@contract Each newly protected sensitive capability uses a random data-encryption key and authenticated encryption. A cartridge key envelope wraps capability keys without forcing nonsensitive layout or semantic intent behind the same disclosure boundary.
@contract Protection metadata identifies algorithms and parameters; plaintext secrets, passphrases, derived keys, and unwrapped store keys never enter the manifest, logs, URLs, arguments, environment, reports, or telemetry.
@contract Plain secret-bearing export is accurately labeled and requires explicit application policy authorization; it is never represented as protected. Protected passphrase mode remains the default for unattended secret-bearing backup, while applications may omit secret capabilities from a plain share.
@contract `wx.fireproof.store` records logical database identity, writer storage-format version, encrypted store blocks, original Fireproof CIDs, outer ciphertext CIDs, current metadata, CAR log, key-envelope reference, and allowed restore policies inside its protected native-recovery descriptor.
@contract Fireproof chunks already protected by authenticated encryption remain opaque and are not encrypted again. Teleport protects the sensitive descriptor and wraps the usable Fireproof key without decoding or re-encoding native chunks.
@contract Fireproof library package version is evidence for adapter selection, not the universal capability identity. Import uses an explicit compatible adapter or rejects before key unwrap and mutation.
@contract Credential and store capabilities can be omitted while workspace and HUD intent remain shareable. Export safety scans every declared secret marker represented by a sensitive source document, not only the primary provider key.
@constraint Import never restores a store directly into an active database before isolated open/reopen verification succeeds.
