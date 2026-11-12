## Why

Archiving a change (`openspec archive`) did not update an already open OpenSpec Canvas tab: the change stayed in the Changes list until a manual reload. The server watcher does emit `openspec.changed` for a directory move into `changes/archive`, so the gap is in watcher lifetime and client delivery: the watcher is touched only by snapshot requests and closes after 10 minutes without them, so a tab that stays open and unchanged loses live updates, and nothing restarts the watcher or tells the person that live updates stopped.

## What Changes

- Keep the server watcher alive while an OpenSpec tab is open: the tab sends a lightweight authorized keep-alive (`op=watch`) on a timer while visible, and on resync; the watcher idle timeout stays as the cleanup for closed tabs.
- On receiving `openspec.changed`, or after resync, the tab re-reads the snapshot and keeps the selection when it still exists; when the selected change moved to the archive, the selection follows it into the Archive section.
- Show a small, accessible "live updates" state in the tab (live / reconnecting / stopped) and a manual Refresh button.
- Add tests for archive moves, watcher keep-alive and idle expiry.

## Capabilities

### Modified Capabilities

- `openspec-workspace-viewer`: automatic refresh covers archiving and long-open tabs; live state and manual refresh are visible.

## Impact

- `plugins/openspec/src/openspec/handle.ts`, `watch.ts` (keep-alive op, unchanged idle cleanup)
- `plugins/openspec/ui/index.tsx` (keep-alive timer, selection follow, live state, Refresh)
- Tests in `plugins/openspec/src/openspec/*.test.ts` and `frontend/src/test/openspec-extension.test.tsx`
