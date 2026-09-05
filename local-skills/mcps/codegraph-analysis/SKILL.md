---
name: codegraph-analysis
description: Use for architecture, request or data flow, caller/callee relationships, symbol dependencies, change-impact analysis, and refactor blast radius. Use Probe or Glob, Grep, and Read for exact text, files, and AST patterns.
compatibility: opencode
---

# CodeGraph Analysis

Use CodeGraph for indexed relationship questions: how code flows, who calls a symbol, what a symbol calls, and which code a change may affect.

1. Use `codegraph_explore` first with a focused natural-language question and the relevant symbols or files.
2. Treat returned source excerpts as already read.
3. If no index exists, report that fact and use Probe or normal discovery unless the user chooses to initialize an index.
4. Use `codegraph_status` to inspect index state and `codegraph_sync` after substantial edits before relying on prior results.
5. Use Probe or normal Glob, Grep, and Read for exact text, documentation, configuration, or AST patterns CodeGraph does not index.

Verify consequential conclusions against the selected source. Record durable boundary findings in the selected ledger route rather than leaving them only in chat.
