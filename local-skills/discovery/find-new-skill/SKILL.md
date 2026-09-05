---
name: find-new-skill
description: Discover relevant skills from skills.sh, assess their trust signals, and present installation options before changing the agent environment.
compatibility: opencode
metadata:
  version: "1.0.0"
  scope: general
---

# Find New Skill

Use this skill when a user asks whether a skill exists, wants help finding an agent capability, or needs to extend the agent with a specialized workflow.

## Workflow

1. Translate the request into two or three specific search terms.
2. Search the skills.sh catalog:

   ```bash
   mise exec -- npx skills find <query>
   ```

   Do not invoke the project-managed CLI directly; `mise exec --` supplies the pinned toolchain.
3. Prefer established sources and skills with meaningful install counts. Treat unknown sources and very low install counts cautiously.
4. Present the best candidates with their purpose, source, install count when available, and the exact install command.
5. Do not install anything until the user explicitly chooses a candidate.
6. After approval, install with:

   ```bash
   mise exec -- npx skills add <owner/repo@skill>
   ```

7. Report the command result and where the skill was installed.

## Useful Commands

```bash
mise exec -- npx skills find <query>
mise exec -- npx skills add <owner/repo@skill>
mise exec -- npx skills list
mise exec -- npx skills update <owner/repo@skill>
mise exec -- npx skills remove <owner/repo@skill>
```

The skills CLI queries the skills.sh catalog and installs from GitHub or other supported sources. It does not independently verify skill contents. Review a skill's repository and instructions before trusting it with sensitive or destructive work.

## Direct CLI Fallback

Use `mise exec -- npx skills find <query>` or `mise exec -- npx skills add <owner/repo@skill>`. Never interpolate untrusted input into a shell command; pass user input as separate process arguments.
