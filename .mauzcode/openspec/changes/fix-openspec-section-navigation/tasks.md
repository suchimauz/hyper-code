## 1. Navigation state
- [x] 1.1 Reset manual cross-section selection and document state with one persisted patch; keep same-section activation a no-op.
- [x] 1.2 Repair incompatible persisted state after snapshot, preserving unavailable documents and archive auto-follow.
- [x] 1.3 Reject stale document responses after navigation.

## 2. Regression coverage
- [x] 2.1 Cover mouse and keyboard transitions across all sections, focus, empty Archive, reopening, same-section activation and stale successes/errors.
- [x] 2.2 Cover legacy incompatible state and retain live refresh, removal and archive-follow tests.

## 3. Verification
- [x] 3.1 Run targeted frontend tests and type checking.
- [x] 3.2 Strictly validate this change and review the scoped diff.
- [x] 3.3 Reload the OpenSpec plugin normally without restarting.
- [x] 3.4 Verify wide and narrow panels in a browser if available; record limitations otherwise.

Verification: 32 targeted Vitest tests passed; frontend TypeScript build checking passed; strict change validation and git diff --check passed. OpenSpec was hot-reloaded with plugins.reload. Chrome/CDP exercised the real mounted component at 1000px (document cleared, list and empty document prompt) and 420px (open document hides list; switching to Archive restores list and clears document). Limitation: the shell remained on its conversation-loading screen with Canvas visibility:hidden. Temporary DOM-only visibility/width overrides allowed responsive component inspection and were removed afterward; normal end-to-end shell interaction and visual screenshot review are not verified. No restart, commit, archive or publication was performed.
