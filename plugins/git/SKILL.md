---
name: git
description: Inspect project Git changes and HEAD history in a read-only Canvas tab, locally or over SSH.
---

# Git Canvas

Open `gitUi.repository` with `{ dir: absoluteProjectDirectory, host: "local" }` or an explicit SSH alias. The Git launcher uses the chat workspace and pins its directory and host to the durable Canvas item; reopening the same target reuses it. Changing the chat workspace does not change an existing tab.

Shows staged, unstaged and untracked files, unified/split highlighted diffs, and fifty-commit pages of HEAD history. Root commits compare with an empty tree; merges compare with their first parent. Binary files, conflicts, submodules, missing shallow parents and oversized diffs are explicit non-text states. All repository operations are read-only; no staging, commits, branch operations, fetch or pushes.

HTTP reads require ownership of the active agent and open Canvas item. The browser cannot supply a filesystem target or Git command. Tab opening also requires the existing CSRF token. Internal `gitUi.command` is not an HTTP command runner. Commands are bounded to 12 seconds and 1 MiB per output stream, text diffs to 256 KiB; working-tree files above 256 KiB are not rendered. SSH errors never fall back to local execution.

The UI uses MIT-licensed react-diff-view 3.3.2 and compatible refractor 3.6.0. Their dependencies are explicitly declared for the host's runtime UI bundler. React is supplied exclusively by MauzCode. New bundle approval, when required by host policy, belongs to the person; agents must not approve it.

Graph, blame, arbitrary-ref comparisons, editing and repository writes are intentionally outside this version.
