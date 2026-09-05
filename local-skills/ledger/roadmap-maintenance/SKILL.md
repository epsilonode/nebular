---
name: roadmap-maintenance
description: Use before creating or editing proj-ledger roadmaps or roadmap logs, changing tier or item state, recording acceptance evidence, blockers, proof gaps, or closeout state. Preserve the grep-first tiered roadmap contract.
compatibility: opencode
---

# Roadmap Maintenance

Roadmaps are compact current-state routers. Memories own durable contracts and rationale; logs are append-only forensic summaries.

1. Enter through `workspace-map.yaml`, then `proj-ledger/control.yaml` and its heading grep. Do not read whole roadmaps merely to orient.
2. Read only the selected tier/item and linked memory hooks before bodies.
3. Patch the smallest heading or mention that makes current truth explicit.
4. Keep detailed rationale in a memory created through `memory-authoring`.
5. Refresh roadmap metadata when active state or routing changes.

Work or proof may be `@done` only with adjacent auditable `@evidence`. Partial work requires an explicit `@proof_gap` or constraint. Do not remove caveats, blockers, gaps, or history to make the roadmap appear complete.
