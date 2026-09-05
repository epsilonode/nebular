---
name: probe-discovery
description: Use for semantic code discovery, AST or structural search, unknown symbols or source areas, complete-symbol extraction, or inspection of a public remote repository. Prefer exact Glob, Grep, and Read when the target is already known.
compatibility: opencode
---

# Probe Discovery

Use Probe when syntax structure matters, the relevant source area or symbol is unknown, or no CodeGraph index is available.

1. Use `probe_search_code` for semantic discovery across local source.
2. Use `probe_query_code` for AST patterns that text search cannot reliably express.
3. Use `probe_extract_code` or `probe_symbols_code` for complete symbols with context.
4. Use `probe_clone_remote` only for public HTTPS repositories. Analyze with `probe_remote_*` and always release the checkout with `probe_release_repository`.
5. Use Glob, Grep, or Read for exact files, symbols, routes, filenames, or error text.
6. Do not infer caller/callee paths or refactor blast radius from Probe alone; use `codegraph-analysis` for indexed relationship analysis.

Keep searches narrow and return durable architectural discoveries to the selected ledger route.
