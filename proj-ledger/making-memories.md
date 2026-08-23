# Memory Guidance

Memories preserve durable contracts, decisions, strategy, research, and evidence; they do not own implementation status.

Every memory requires YAML frontmatter with `id`, `kind`, `status`, `created`, `updated`, `roadmap`, `refs`, and a one-line `hook` describing when an agent must read it. Place Teleport memories under `memories/teleport/` and link every live memory from the owning roadmap or trigger map.

Use compact contract cards for stable seams and longer proposal memories only for unresolved architecture. Mark proposed material `proposed`; promote it to `active` only when implementation evidence proves the contract. Supersede obsolete cards explicitly rather than deleting historical rationale.

Application-specific implementation facts may be referenced here as cross-project evidence, but their application roadmap remains authoritative for integration status.
