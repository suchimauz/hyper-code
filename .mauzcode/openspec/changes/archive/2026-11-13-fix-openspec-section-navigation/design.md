## Context
See proposal.md for motivation. The viewer maintains section, selected entry, document id and narrow-pane visibility separately. Snapshot refresh also supports following changes into Archive and showing unavailable deleted artifacts.

## Goals / Non-Goals
Provide consistent manual navigation and repair legacy cross-section state. Preserve layout, keyboard focus, read-only persistence guards and existing deletion/archive behavior. No new API, state format, migration, redesign, per-section remembered selection or automatic first selection.

## Decisions
- Manual transitions clear selection, document id, rendered document, document error and narrow-pane visibility, saving one complete state patch. Same-section activation returns immediately. This is preferable to per-section selection memory, which is outside the approved scope.
- After a snapshot arrives, normalize only demonstrably incompatible selection/document ownership. Infer document section from its stable id prefix and compare existing owners; missing artifacts within the active section retain unavailable behavior. A missing selected change eligible for auto-follow is handled by the existing archive effect rather than reset.
- Increment a document request generation when clearing navigation state; response handlers also retain their effect cleanup guard. This rejects late successes and errors even before the next effect cleanup.

## Risks / Trade-offs
- Over-eager normalization could hide deleted-document feedback or prevent archive following → distinguish incompatible ownership from absence and keep archive-follow behavior covered by tests.
- DOM tests cannot prove responsive layout visually → attempt browser verification at wide and narrow widths, record environmental limits.

## Migration Plan
Deploy by normal OpenSpec plugin reload, without restarting the server. Existing saved state repairs when a snapshot arrives; no database migration. Roll back by reverting the two UI/test files and reloading the plugin.
