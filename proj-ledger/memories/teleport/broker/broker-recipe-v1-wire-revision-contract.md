---
id: broker-recipe-v1-wire-revision-contract
kind: contract
status: proposed
created: 2026-08-23
updated: 2026-08-23
roadmap: broker
refs:
  - roadmaps/broker.md#git-scoped-recipe-command-authority
  - roadmaps/broker.md#extract-and-localize-the-bake-recipe-kernel
  - memories/teleport/broker/broker-git-recipe-command-authority.md
  - memories/teleport/broker/broker-bake-recipe-kernel-extraction.md
  - memories/teleport/broker/broker-recipe-parity-provenance-and-cutover.md
hook: "read before defining Recipe V1 XML, adding credential slots, canonicalizing a recipe, computing recipe revision identity, resolving inheritance, or deciding whether formatting changes require approval"
---

# Recipe V1 Wire And Revision Contract

@decision Define the broker-admitted XML contract as `wx.recipe/v1`. Preserve the proven Bake human/agent-editable `<recipe>` shape, but require an explicit root `schema="wx.recipe/v1"` marker for newly authorized broker recipes. A compatibility decoder may identify Bake fixtures during extraction; it cannot authorize an unversioned secret-bearing recipe in production.
@boundary Decode XML as untrusted input with bounded depth, element count, attribute count, text length, total bytes, and entity/DTD prohibition. Reject duplicate singleton elements, duplicate attributes after parser normalization, invalid Unicode/NULs, unknown authority-bearing elements/attributes, and ambiguous mixed content.
@subset The admission matrix defines the exact V1 Bake subset. Roadmap-only, scaffolded, UI, Hono, resource/compose, artifact, built-in registry, secret-direct, and implicit harness fields remain rejected unless separately versioned and admitted.

## Credential-slot extension

@shape Use repeated `<credential-slot>` elements with a stable local `id`, `provider`, optional `account` constraint, `environment`, `delivery`, and `inject` name. Repeated child `<operation>` and `<scope>` values express requested authority. The element contains requirements only—never a secret, keychain service/name, credential reference, grant id, PIN, passphrase, or refresh value.
@delivery V1 admits closed delivery variants rather than arbitrary strings. Begin with `environment` for the cooperative compatibility path and reserve provider-operation handles for the scoped-client path. Unsupported delivery fails decoding or capability negotiation; it never falls back to argv or broad environment inheritance.
@environment For `environment`, `inject` is the exact target variable name. Reject missing/empty names, `=`, NUL, platform-invalid characters, duplicate names, Windows case-fold collisions, reserved loader/runtime variables unless explicitly admitted by policy, and collisions with declared nonsecret environment entries.
@sets Treat operations and scopes as normalized sets: validate, deduplicate, sort canonically, and reject contradictory provider declarations. Preserve argv order, temporal sequence order, probe order where semantically ordered, and any other sequence whose order affects execution.

## Normalized semantic recipe

@resolve Resolve inheritance, defaults, parameters, relative paths, receiver defaults, lifecycle policy defaults, credential slots, and admitted aliases into one current semantic ADT before authority comparison. Authority never compares raw parser objects or partially resolved recipes.
@inheritance The effective identity includes every transitive base recipe identity and its resolved contribution. A base change that changes or could ambiguously affect the effective recipe changes the revision; inheritance cycles, missing bases, duplicate ids, or unresolved parameters fail closed.
@paths Preserve the checked-in recipe-relative source location separately from the normalized semantic value. Canonical cwd/path resolution is repository-bound policy and must not inject machine-specific absolute paths into the portable semantic digest unless the field is deliberately defined as local authority.
@defaults Apply versioned explicit defaults before hashing so different implementations cannot interpret an omitted field differently. Changing a default requires a schema/canonicalization version change or migration, not a silent runtime change.

## Revision identity

@digest Compute the recipe revision from a domain-separated canonical encoding of the fully resolved semantic recipe, credential slots, schema version, canonicalization version, and transitive inherited-source revisions. Use the form `sha256("wx.recipe.revision/v1\\0" || canonicalBytes)` and a stable lowercase base32 or equivalent typed textual representation.
@canonical Use the project's canonical structured codec rules for maps, arrays, strings, integers, booleans, absent values, and normalized sets. Do not hash JavaScript object serialization, raw XML, filesystem metadata, line endings, comments, indentation, attribute order, or diagnostic/source-location fields.
@meaning The digest is compact recipe-version identity used inside a larger repository-scoped grant. It is not executable, interpreter, dependency, lockfile, source-tree, or supply-chain integrity.
@formatting Formatting-only XML changes that decode to the same normalized semantic recipe retain the revision. Effective command, cwd, nonsecret environment, params/defaults, receiver, lifecycle, probes, deadlines, stop/cleanup, credential slots, operations/scopes, delivery, or inherited contribution changes produce a different revision.

## Compatibility and proof

@version Unknown recipe schemas fail typed. The decoder may retain a migration report for supported older non-authoritative fixtures, but broker authority is created only over the current normalized V1 value.
@fixtures Prove raw-XML variation equivalence; semantic-change inequality; map/set ordering stability; ordered argv sensitivity; inheritance/base drift; default application; Windows case folding; unknown fields; duplicate elements; malformed XML; decode budgets; and identical revision computation in runner and broker bundles.
@gate Freeze this card's exact XML fixture and canonical revision vectors before creating persistent grants or transplanting the full Bake kernel. A later wire change requires a versioned migration and explicit grant drift behavior.
