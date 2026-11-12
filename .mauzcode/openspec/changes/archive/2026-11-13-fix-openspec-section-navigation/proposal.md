## Why
Switching OpenSpec sections currently retains the previous document and selection, leaving a narrow panel on an unrelated document. Saved mismatched selections reproduce this problem after reopening.

## What Changes
- Reset selection, document and narrow-pane state when manually switching to a different section, with one persisted state update.
- Treat activation of the current section as a no-op.
- Repair incompatible saved selections without regressing removed-document messages or automatic archive following.
- Ignore stale document responses after navigation and cover navigation with regression tests.

## Capabilities
### New Capabilities
None.
### Modified Capabilities
- `openspec-workspace-viewer`: section navigation and compatible persisted selections.

## Impact
Changes are limited to the OpenSpec React UI and its frontend tests. No backend contracts, dependencies or permissions change.
