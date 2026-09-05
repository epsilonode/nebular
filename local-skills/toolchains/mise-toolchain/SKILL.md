---
name: mise-toolchain
description: Use before a project command, package operation, build, test, smoke, deployment, or conclusion that a runtime or CLI is unavailable. Resolve the active toolchain through mise.toml and Mise rather than ambient PATH.
compatibility: opencode
---

# Mise Toolchain

1. Read the applicable `mise.toml` and relevant declared task.
2. Use `mise tasks ls` when the appropriate task is not already known.
3. Prefer a declared Mise task such as `mise run check`, `mise run test`, or `mise run verify`.
4. For an approved direct invocation that needs the project environment, use `mise exec -- <tool>`.

Do not invoke `node`, `npm`, `npx`, `pnpm`, `bun`, `deno`, `python`, `pip`, or other globally resolved runtime/package commands directly. Do not infer tool availability from ambient `PATH`. If Mise reports the project configuration as untrusted, use the project's trust workflow rather than bypassing it with a separate runtime installation.

Run `mise run link` before installing an adjacent Bun consumer that declares `link:@epsilonode/nebular`. If a required command cannot run through Mise or uv, stop and ask before invoking it another way.
