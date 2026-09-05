---
name: browser-validation
description: Use when work changes or verifies browser-facing behavior, hosted routes, Chromium MCP transport, browser credentials, CORS, import maps, CDN delivery, or preflight behavior. Validate through the available browser MCP rather than assuming browser compatibility.
compatibility: opencode
---

# Browser Validation

Use browser automation for behavior that depends on a real browser, including CORS, preflight, hosted routing, import maps, CDN modules, browser credential headers, and consumer-visible request behavior.

1. Prove deterministic behavior with repository tests first when possible.
2. Use the available browser MCP for the browser-only seam.
3. Start any required local server through the `mise-toolchain` contract.
4. Verify the exact request, response, status, headers, visible result, and browser-visible failure mode relevant to the change.
5. Sanitize screenshots, traces, network bodies, and ledger evidence.

Do not add a browser package or permanent runner during unrelated work. Record an honest proof gap when no approved browser path exists.
