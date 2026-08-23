---
id: implemented-verification-path
kind: evidence
status: active
created: 2026-08-16
updated: 2026-08-16
roadmap: car-teleport
refs:
  - roadmaps/car-teleport.md#provider-persistence-independent-of-connectivity
  - roadmaps/car-teleport.md#encrypted-browser-car-export
  - roadmaps/car-teleport.md#isolated-fireproof-restore
  - roadmaps/car-teleport.md#one-shot-cloudflare-verification-harness
  - roadmaps/car-teleport.md#automated-security-and-portability-evidence
hook: "read when locating implemented CAR/gateway code, reproducing proof, or checking what has already landed"
---

# Implemented Verification Path

@implementation Browser provider state: `src/lib/agent/provider-settings.ts`, `src/lib/agent/stores.ts`, and `src/components/agent/AgentApp.tsx`.
@implementation Shared credential header assembly: `src/lib/agent/provider-gateway.ts`.
@implementation Cloudflare custom-Kilo route projection: saved `/custom-kilo/api/gateway` is converted to request base `/custom-kilo` for authenticated `/models` and `/chat/completions` calls.
@implementation CAR schema/writer/reader: `src/lib/agent/provider-car.ts` using direct exact dependencies `@ipld/car@5.4.7`, `@ipld/dag-cbor@10.0.2`, and `multiformats@14.0.5`.
@implementation Passphrase wrapping: `src/lib/agent/provider-car-crypto.ts`.
@implementation Browser Fireproof internal adapter and download: `src/lib/agent/provider-export.ts`, pinned to `@fireproof/core@0.24.19`.
@implementation Node/Bun restore adapter: `scripts/lib/restore-provider-fireproof.ts`.
@implementation One-shot gateway verifier: `scripts/verify-agent-gateway.ts`.
@implementation Download wrapper and non-interactive explicit-unprotected mode: `scripts/verify-downloaded-agent-gateway.ts`.
@implementation Browser artifact proof: `scripts/provider-car-browser-smoke.ts`, exposed as `test:provider-car-browser`.
@proof The final full gate passed 25 Vitest files and 114 tests; Astro check reported zero errors, warnings, or hints.
@proof `mise exec bun -- bun run check`, focused ESLint, and strict script TypeScript passed.
@proof Browser smoke opened the built Researcher artifact via `file://`, persisted fixture settings in IndexedDB, exported 3,500 bytes, found no plaintext markers, and restored exact values in Bun.
@proof Final build output `build/shells/researcher/src/shells/researcher.html` was copied to `C:/proj/wx-shells/dist/bundles/agent-researcher.html`; both hashed to `BAEA6B589FF27AC2B2664A4BACC9C326A0A65A9D24133C4DF566B97EBDC7C54C`.
@proof Dependency audit reported low project risk and no critical/high vulnerabilities across 30 direct packages.
@command Run live proof from `C:/proj/supa-mail-hook/supa-svelte`: `mise exec bun -- bun scripts/verify-agent-gateway.ts <path-to-export.car>`.
@proof A real downloaded unprotected CAR restored non-interactively and returned gateway model HTTP 200 plus streamed completion HTTP 200 with normal SSE completion; only sanitized counts/status/timing evidence was retained.
@proof Browser-equivalent requests isolated the remaining hosted GUI failure to missing CORS response headers; that concern is owned by `roadmaps/ai-relay.md`.
@caveat `wx-shells` artifact handoff is complete but production deployment was not performed.
