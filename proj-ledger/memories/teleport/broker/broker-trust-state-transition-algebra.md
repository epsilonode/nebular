---
id: broker-trust-state-transition-algebra
kind: contract
status: proposed
created: 2026-08-23
updated: 2026-08-23
roadmap: broker
refs:
  - roadmaps/broker.md#expand-domain-algebras-and-lawful-composition
hook: "read before representing CAR verification, unlock, decode, authorization, staging, commit, replay consumption, or recovery transitions"
---

# Trust-State Transition Algebra

@contract Represent security-relevant lifecycle phases as distinct opaque states, not one record with optional fields or boolean flags. Initial families are cartridge trust, broker request, credential import/export, and restore transaction.
@shape Cartridge states are unverified bytes, graph-verified cartridge, recipient-unlocked cartridge, decoded capability inventory, planned restore, authorized restore, staged restore, and committed or recovery-required outcome.
@shape Credential import states are received transfer, graph/signature verified, recipient matched, decrypted, policy accepted, consent approved, keychain staged, committed, consumed, or recovery required.
@contract Each transition is a named total function accepting exactly one predecessor state and returning `Result`, `ResultAsync`, or broker Effect with one declared successor/error family. Constructors for successor states are private to the owning transition module.
@contract State values carry immutable evidence needed by the next transition: verified root, signer set, recipient identity, decoded inventory, policy decision, consent proof, staging reference, transaction id, and recovery journal reference. Evidence is not reconstructed from logs.
@contract Portable types contain no secret plaintext, live handles, Effect services, DOM values, or runtime instances. Privileged staged states may retain opaque handles only inside a Scope and never serialize them.
@contract Illegal skips must fail at compile time where static flow exists and at decoder/state-machine boundaries where state crosses IPC or persistence. Runtime status strings never substitute for constructed type states.
@constraint Do not type every local intermediate. Introduce states only where trust, authority, durability, reversibility, or secret exposure changes.
@proof Compile-negative fixtures reject decode before verification, restore before authorization, keychain write before consent, replay consumption before commit, and finalization with recovery pending. Transition tests cover every legal edge and terminal state.

