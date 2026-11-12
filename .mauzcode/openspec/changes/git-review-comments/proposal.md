## Why
The Git Canvas plugin currently shows changes and history only as a static, manually refreshed read-only view. Reviewing an agent's work still requires describing code locations in chat by hand. The person needs live repository data with a visible live status, and a way to leave line-anchored code comments on diffs that the owning agent can read, act on and mark as done.

## What Changes
- Live updates for the Git Canvas tab: local repositories use a debounced, idle-expiring file watcher; SSH repositories use lightweight fingerprint polling. The header shows a Live / Connecting / Not live indicator and a Refresh action, consistent with the OpenSpec viewer.
- Review comments anchored to line ranges in commit diffs and uncommitted diffs (staged, unstaged, untracked). Comments are owned by the agent that owns the Canvas tab and scoped to its repository (host + directory).
- A Comments list with Open / Resolved / All filters, inline comment cards in diffs, outdated detection for working-tree anchors, edit, delete, resolve and reopen.
- An explicit "Send to agent" action that delivers all open, not-yet-sent comments to the owning agent as one chat message and wakes it. Nothing is sent automatically.
- Native agent tools to list review comments and resolve one with an optional short note; resolved comments leave the active list but remain visible under Resolved.
- Permanent deletion of all of an agent's review comments when that agent is archived or deleted. A generic core `session.archived` hook point is added to `session.archive` to support this; unarchiving restores nothing.
- A redesigned, Apple-design-aligned React UI for the Git Canvas, specified as a self-contained task block for a UI implementer.
- The repository itself remains read-only: no staging, committing, branch operations, fetches or pushes.

## Capabilities
### New Capabilities
- `git-review-comments`: line-anchored review comments on Git diffs, their storage, ownership, delivery to the owning agent, agent tools, resolution lifecycle and destruction on agent archive or delete.
- `git-repository-viewer`: the Git Canvas repository view, including live updates, live status, layout and accessibility.

### Modified Capabilities
None (no existing Git specification is recorded).

## Impact
- Plugin `plugins/git`: new migration, comment functions, watcher, hook handler, sweep, native `$tool_` definitions, extended GET/POST routes, rewritten `ui/index.tsx` and styles, updated `SKILL.md` and `package.json` description.
- Core: `src/session/archive.ts` runs a new `session.archived` hook after a successful archive; handler failures are logged and never undo archival.
- Database: new table `git_review_comments` with a foreign key to `agents` (`ON DELETE CASCADE`).
- Security: all comment operations require ownership of a non-archived agent and an open owned `gitUi.repository` Canvas item; browser writes require the CSRF token; repository targets never come from the browser.
