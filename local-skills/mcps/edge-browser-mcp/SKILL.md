---
name: edge-browser-mcp
description: Use when operating or diagnosing the connected Edge Browser MCP, including tabs, browser_run, browser_observe, controlled-tab ownership, hosted fixtures, console evidence, and network inspection.
compatibility: opencode
---

# Edge Browser MCP

Use the connected browser profile exactly as reported by `browser_session`; do not assume or copy a previously observed name. A failed open returns `PROFILE_DISCONNECTED` plus the currently connected `profiles` list. Retry with that exact `profileLabel` and reuse the returned session ID when available.

## Proven Surface

- Use `browser_session` to open a profile, create a tab, claim an existing tab, release a tab, or configure a session.
- Use `browser_run` for direct browser actions and action chains.
- Use `browser_observe` to inspect page content, screenshots, events, downloads, and capabilities.
- Use `browser_finalize` to release claimed tabs and clean up agent-owned tabs.

## Ownership

Advanced capability calls require a controlled tab belonging to the active session. Before calling one, create or claim the tab with `browser_session`, then reuse that session ID and tab ID in `browser_run`. Reopening the session with `browser_session(action="open")` provides a non-destructive tab inventory.

## Hosted Fixtures And Frames

- When `data:` navigation is blocked, use an approved local HTTP(S) fixture or hosted playground rather than treating the policy rejection as a browser failure.
- LiveCodes accepts URL-encoded HTML through `https://livecodes.io/?html=<encoded-html>`, but its preview runs in a nested frame and the host may inject editor-owned scripts, warnings, service workers, or shims.
- Parent-page inspection and assertions may see only the outer iframe. Use an inline screenshot for a nested preview's visible result; a failed parent-frame assertion is not an application failure.
- Prefer a top-level fixture when console or network closure is an acceptance criterion. If a preview exposes a top-level result URL, navigate to it before collecting evidence.
- Coordinate clicks can reach iframe UI but are viewport-dependent and should not replace selectors or direct navigation.

## Network Inspection

1. Request the manifest with `browser_observe(mode="capabilities", pack="network")`.
2. Invoke `network.inspect` through `browser_run` with `action: "capability"`.
3. Invoke inspection before the relevant navigation or reload, then use cache bypass when fresh requests are required.
4. Begin with narrow URL, method, resource-type, or status filters.
5. Request headers or bodies only when necessary; they are redacted and body access may require approval.

`totalEvents > 0` with `totalRequests: 0` does not prove that the page made no requests. A nested LiveCodes preview visibly imported an esm.sh module while the inspector exposed no nested-frame request records after reload. Treat this as an inspector coverage gap. Do not claim URL closure, CORS, cache, or no-fallback proof unless the relevant records are returned.

For strict module-closure acceptance, run a top-level fixture and record the entry request plus every transformed dependency URL. If the MCP still does not expose them, record the remaining DevTools Network proof rather than inferring it from successful execution.

## Console And Version Evidence

- Event observations group repeats and report `count`; use URL, level, source, and top frame to distinguish fixture errors from host warnings.
- A visible success proves execution but does not enumerate module closure or exclude every fallback request.
- `browser_session` may identify Microsoft Edge while returning `browserVersion: null`, and direct `edge://version/` navigation is rejected.
- As a fallback, load `https://httpbin.org/user-agent` and record the `Edg/<major>.0.0.0` token as the user-agent-reported major, not the full installed build.

## Approvals, Artifacts, And Finalization

- Submit-capable keys such as `Enter` can approval-gate a chain. If unnecessary, do not apply its immutable approval token; issue a new safe chain.
- Large observations may spill to a `browser://` artifact without a useful inline preview. Prefer narrow selectors, queries, and limits.
- Screenshot capture can time out on heavy pages. Retry only when required; otherwise use targeted extraction.
- Do not assume `storage` or `performance` capability packs exist. Performance diagnostics use `browser_observe(mode="diagnostic")`.
- Finish with `browser_finalize`. Keep a user-facing proof tab as `deliverable`; unkept agent tabs close and unkept claimed tabs are released.
