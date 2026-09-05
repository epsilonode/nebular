---
name: memory-authoring
description: Use before creating or materially revising proj-ledger memories, durable decisions, contracts, strategy, research, evidence, inventories, or reusable implementation guidance. Create roadmap-owned, frontmattered, hook-discoverable cards and explicit supersession.
compatibility: opencode
---

# Memory Authoring

Memories are durable project documentation. Roadmaps hold current state, next actions, blockers, proof gaps, and evidence pointers. Memories hold durable rationale, contracts, research, strategy, proof, implementation patterns, and operating guidance.

Create or update a memory only when it preserves durable value that a future agent would otherwise re-derive. Do not create memories for routine progress, tiny edits, speculative chat, command transcripts, or facts already captured compactly in a roadmap or log.

Every new or materially rewritten card needs frontmatter with `id`, `kind`, `status`, `created`, `updated`, `roadmap`, `refs`, and a precise `hook`. Link it from the owning roadmap with `@memory`. Do not silently delete obsolete durable material: mark it superseded and point it to the replacement. Never store secrets or unsanitized provider output.
