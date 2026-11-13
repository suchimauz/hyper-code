## Why

Git review currently requires selecting files individually and delivers comment bodies and quoted code into the agent context. Reviewers need a whole-change view and a distinct chat receipt without unnecessary context growth.

## What Changes

- Add a Full diff action in Changes showing Staged, Unstaged and Untracked sections with independently collapsible files; retain single-file review.
- Open all commit changes on commit selection in History, with file navigation and inline comments.
- Preserve unified/split rendering, anchors, live refresh, explicit non-text states and bounded lazy loading.
- Send repository identity, count and exact comment IDs instead of bodies or quoted code; extend the review tool with an optional IDs filter.
- Render a dedicated review card inside the associated completed-work group, never inside a tool-call group. Retrieve current comment details on expansion without injecting them into model context.
- Preserve transactional delivery, ownership checks, durable history and legacy message fallback.

## Capabilities

### New Capabilities
- `git-review-diff`: Whole-worktree and whole-commit diff navigation with inline review.
- `git-review-delivery`: Compact comment delivery, exact-set retrieval and dedicated chat presentation.

### Modified Capabilities
None. There are no existing Git review capability specs in the canonical spec directory.

## Impact

Affects plugins/git/ui, gitUi.commentsSend, gitReviewComments, commentsList, tool documentation, chat event serialization and frontend grouping/rendering tests. Existing single-file workflows and unfiltered tool calls remain compatible. No new dependency or database table is planned. Git operations remain read-only and SSH failures never fall back to local execution.

This approved stage creates and validates OpenSpec artifacts only. Application-code implementation requires a subsequent user request.

## Additional Scope: One-step Git Launch

- Open Git directly into a single repository Canvas tab, following the OpenSpec launcher pattern, without an intermediate launcher tab. Repeated activation reuses the existing tab for the same pinned host and directory.

## Additional Scope: History Reference Decorations

- Show HEAD, local branches, remote-tracking branches and tags beside their commits, similar to git log --decorate. Keep the current HEAD-history scope; an all-branches graph is not part of this change.
