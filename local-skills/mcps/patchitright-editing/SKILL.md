---
name: patchitright-editing
description: Use before a multi-file or non-contiguous patch, or when retrying a rejected patch. Apply narrow validated PatchItRight changes while preserving unrelated work in a dirty worktree.
compatibility: opencode
---

# PatchItRight Editing

1. Re-read the current target and scope each change to the smallest unique `search_content` block or strict unified diff.
2. Use `dry_run: true` for non-trivial changes and inspect the preview before applying its run ID.
3. Use atomic multi-file batches only when every individual patch is narrow and understood.
4. If a patch is rejected, reduce or split its scope. Do not broaden the replacement or overwrite the file to bypass validation.
5. Inspect the resulting diff and run `git diff --check` after edits.

Never revert, rewrite, or absorb unrelated changes. If concurrent changes directly conflict with the task, ask rather than choosing an owner implicitly.
