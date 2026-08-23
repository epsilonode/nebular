---
id: broker-secret-values-and-lifetime
kind: contract
status: proposed
created: 2026-08-23
updated: 2026-08-23
roadmap: broker
refs:
  - roadmaps/broker.md#secret-delivery-hierarchy
  - roadmaps/broker.md#encrypted-car-is-the-explicit-portability-channel
  - roadmaps/broker.md#security-and-lifecycle-conformance
hook: "read before representing, retrieving, logging, leasing, injecting, exporting, importing, comparing, or disposing credential secret values"
---

# Secret Values And Lifetime Discipline

@contract Convert the string returned by `Bun.secrets` immediately into a broker-owned redacted secret wrapper and retain raw access only inside the keychain adapter or an explicitly authorized operation callback.
@contract A secret wrapper exposes stable redacted inspection and a bounded `withValue` or lease operation; it does not expose useful default string conversion, JSON serialization, equality, logging, or arbitrary cloning.
@contract Prefer opaque credential references, scoped operation handles, and short secret leases across broker boundaries. Raw string or byte retrieval is an elevated compatibility delivery mode.
@contract Secret lifetime begins no earlier than the authorized effect requires and ends immediately after provider use, child launch preparation, or transfer encryption. Release and overwrite mutable buffers where the runtime permits, without claiming guarantees the JavaScript runtime cannot provide.
@contract Never retain plaintext in grant metadata, request state, IPC history, audit records, recovery journals, filenames, CAR public inventory, source maps, test snapshots, exceptions, or diagnostic messages.
@contract Child-process injection creates a minimal environment for only the authorized child tree. The security model explicitly acknowledges that any process receiving raw credentials can disclose them.
@contract Encrypted export obtains the source secret under a narrow lease, encrypts for the intended recipient before writing CAR blocks, and releases plaintext. Import decrypts only in isolated staging and writes accepted values directly to the destination `SecretStore`.
@constraint Type wrappers reduce accidental disclosure but do not sandbox same-user code, prevent debugger or memory inspection, or transform a broad static provider key into a least-privilege credential.
@proof Tests and artifact scans prove redacted inspection, serialization resistance, bounded callback lifetime, cleanup on every outcome, absence from logs and maps, and no persisted decrypted transfer blocks.

