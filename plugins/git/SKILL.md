---
name: git
description: Review live Git diffs and history locally or over SSH, save comments, explicitly Send to an agent and resolve via tools. Repository stays read-only; archiving an agent permanently deletes its Git comments.
---

# Git Canvas

Open `gitUi.repository` with `{ dir: absoluteProjectDirectory, host: "local" }` or an explicit SSH alias. The Git launcher uses the chat workspace and pins its directory and host to the durable Canvas item; reopening the same target reuses it. Changing the chat workspace does not change an existing tab.

Shows staged, unstaged and untracked files, unified/split highlighted diffs, and fifty-commit pages of HEAD history. Root commits compare with an empty tree; merges compare with their first parent. Binary files, conflicts, submodules, missing shallow parents and oversized diffs are explicit non-text states. All repository operations are read-only; no staging, commits, branch operations, fetch or pushes.

## Live review workflow

Local filesystem changes refresh the view through debounced live events; SSH targets use bounded Git polling. The live indicator reports watching, polling or errors, and Refresh remains available. Closing or leaving tabs idle releases watchers. SSH failures never switch to a local repository.

Select a diff line or range to save a review comment. Comments are private to the owning chat and pinned repository, with Open / Resolved / All filters, outdated-anchor badges and paginated resolved history. Saving does not send a message. Use **Send to agent** explicitly to deliver all unsent open comments as one chat message; successful delivery marks them sent, and repeated Send does not duplicate delivery. Reopening a resolved comment makes it eligible for sending again.

The agent can use `gitReviewComments` (runtime `gitUi.gitReviewComments`) to list its own comments, and `gitResolveComment` (runtime `gitUi.gitResolveComment`) to resolve an addressed comment with an optional note. Tools require an open owned Git tab matching the current workspace and cannot select another agent's identity. Resolve is idempotent. Live comment updates appear without a manual Refresh.

**Archiving an agent permanently deletes all its Git review comments, both open and resolved. Unarchiving does not restore them.** A cleanup sweep repairs missed archive hooks; deleting the agent also removes its comments. This lifecycle affects stored review data only: the repository remains read-only.

HTTP reads and writes require ownership of the active, non-archived agent and open Canvas item. Every POST, including tab opening, comment mutations and Send, requires the existing CSRF token. The browser cannot supply a filesystem target or Git command. Internal `gitUi.command` is not an HTTP command runner. Commands are bounded to 12 seconds and 1 MiB per output stream, text diffs to 256 KiB; working-tree files above 256 KiB are not rendered. SSH errors never fall back to local execution.

The UI uses MIT-licensed react-diff-view 3.3.2 and compatible refractor 3.6.0. Their dependencies are explicitly declared for the host's runtime UI bundler. React is supplied exclusively by MauzCode. New bundle approval, when required by host policy, belongs to the person; agents must not approve it.

Graph, blame, arbitrary-ref comparisons, editing and repository writes are intentionally outside this version.
