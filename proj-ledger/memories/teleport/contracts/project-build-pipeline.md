---
id: project-build-pipeline
kind: contract
status: active
created: 2026-08-16
updated: 2026-08-16
roadmap: car-teleport
refs:
  - roadmaps/car-teleport.md#cross-project-ownership-and-artifact-flow
  - roadmaps/car-teleport.md#automated-security-and-portability-evidence
hook: "read before changing Researcher source ownership, shell build commands, artifact copy paths, wx-shells routes, deployment order, or cross-project release work"
---

# Project Interdependencies And Build Pipeline

@source `C:/proj/wx-landing/ledger/build.md` is the detailed shell build/deployment contract; this card is the durable routing summary for CAR and gateway work.

## Ownership

@contract `C:/proj/supa-mail-hook/supa-svelte` owns Researcher and Dataminr source, Fireproof/provider behavior, CAR export, verifier scripts, shell tests, `vite.shell.config.ts`, and `scripts/build-shells.ts`.
@contract `C:/proj/jtwc` owns Tropical HUD/Briefer source and their independent Deno Tropical API; CAR and Kilo gateway work does not modify those projects.
@contract `C:/proj/wx-shells` owns the Cloudflare Worker route allowlist, static `dist/` artifacts, favicon assets, and Wrangler deployment configuration. It never compiles React, Svelte, Astro, Fireproof, or JTWC source.

## Researcher Build And Handoff

```text
supa-svelte source
  -> mise exec bun -- bun run check
  -> mise exec bun -- bun run test
  -> mise exec bun -- bun run build:shells
  -> build/shells/researcher/src/shells/researcher.html
  -> C:/proj/wx-shells/dist/bundles/agent-researcher.html
  -> wx-shells Worker route /agent/researcher
```

@constraint `build:shells` rebuilds both Researcher and Dataminr; copy only the canonical artifact whose source changed.
@constraint The shell builder reads the linked Supabase project and injects only `PUBLIC_SUPABASE_URL` and the publishable key. It must never inject provider credentials, CAR content, Cloudflare tokens, or a Supabase service-role key.
@constraint `wx-shells/src/index.ts` maps clean public routes to private bundle paths and returns 404 for unknown paths. Do not add direct public bundle routes for CAR work.
@constraint The verifier remains a local `supa-svelte/scripts` program. It is intentionally absent from the browser bundle and Worker routes except for browser-neutral modules imported by Researcher export code.
@constraint A successful local build and artifact copy are not deployment. Public activation occurs only after `mise exec node -- npx wrangler deploy` succeeds from `C:/proj/wx-shells`.
@constraint Deploy all changed source-project artifacts in one Worker version when multiple shells change, preserving a consistent release set.

## Current Evidence

@proof The final CAR/gateway Researcher output and copied `wx-shells` artifact matched SHA-256 `BAEA6B589FF27AC2B2664A4BACC9C326A0A65A9D24133C4DF566B97EBDC7C54C` on 2026-08-16.
@caveat Production deployment was intentionally not performed during CAR implementation; the copied artifact is only the handoff boundary.

## Release Checklist

1. Complete focused source tests, Astro check, changed-file lint, script typecheck, and browser CAR smoke in `supa-svelte`.
2. Complete deliberate live gateway proof with the real exported CAR and follow the successor AI relay roadmap for hosted browser acceptance; retain sanitized evidence only.
3. Run `mise exec bun -- bun run build:shells` and identify the canonical Researcher output rather than a source HTML or debug artifact.
4. Copy only Researcher output to `wx-shells/dist/bundles/agent-researcher.html` and verify source/target SHA-256 equality.
5. Deploy once from `wx-shells` with `mise exec node -- npx wrangler deploy`.
6. Verify public `/agent/researcher`, unknown-route 404 behavior, provider persistence, model discovery, completion, and encrypted export.
7. On regression, restore the last known-good Researcher artifact and deploy a new Worker version; do not alter unrelated shell artifacts.

@constraint CAR export schema and local verifier changes may require a new Researcher build but never require a Worker route change by themselves.
@constraint Node-only verifier/diagnosis code must stay outside the browser import graph. Browser-neutral CAR/crypto modules may be bundled only when Researcher export imports them.
