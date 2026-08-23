---
id: portable-car-security
kind: contract
status: active
created: 2026-08-16
updated: 2026-08-16
roadmap: car-teleport
refs:
  - roadmaps/car-teleport.md#browser-owned-credential-boundary
  - roadmaps/car-teleport.md#encrypted-browser-car-export
  - roadmaps/car-teleport.md#isolated-fireproof-restore
hook: "read before changing CAR schema, Fireproof export/restore internals, passphrase handling, temporary storage, or credential logging"
---

# Portable CAR Security Contract

@constraint The source of truth is browser Fireproof database `dataminr-agent-provider-settings`, document `agent-provider-settings`; never copy its plaintext document into an export-only database.
@constraint Outer CAR v1 has exactly one DAG-CBOR manifest root, raw blocks containing encrypted Fireproof CAR bytes, and one raw passphrase-wrapped keybag block.
@constraint `carBlocks[].cid` is Fireproof's plaintext-content CID while `bytesBlockCid` is the standard raw SHA-256 CID of ciphertext stored in the outer CAR; they are intentionally different.
@constraint CAR parsing validates exact type/version/package metadata, every block hash/codec/reference, no duplicates, no missing blocks, no unreferenced blocks, and exact metadata-to-Fireproof-block coverage before restore.
@constraint Keybag payload contains only required V2 storage key items with exactly one default key. PBKDF2-SHA-256 uses 310,000 iterations, a random 16-byte salt, and AES-256-GCM with a random 12-byte IV.
@constraint Passphrases are accepted only through transient masked browser fields or verifier stdin; never through arguments, environment, URL, log, report, artifact, or telemetry.
@constraint Protected `passphrase-wrapped-v1` remains the credential-backup mode. Explicit `unprotected-v1` is allowed only when both GUI fields are blank for trusted local testing; it provides no meaningful at-rest secrecy and must not be uploaded, committed, synced, or retained as a backup.
@constraint Export performs a final byte search for the saved Kilo key and Cloudflare Run token before download. The CAR is still a sensitive credential backup after this check passes.
@constraint Restore unwraps keys before mutation, seeds key material before Fireproof `ready()`, writes only into a fresh ignored temporary directory, and removes it recursively in `finally`.
@constraint The temporary keybag contains usable unwrapped key material while open. Do not retain, archive, inspect, or report the temporary directory.
@constraint Credentials may exist in private process memory only for the bounded verification/diagnosis session. They are never returned from a tool or included in an error.
@constraint Redacted output omits base URL/gateway identity, both credentials, auth headers, passphrase, prompts, completions, raw catalogs/model IDs, response bodies, Fireproof keys, and temporary paths.
