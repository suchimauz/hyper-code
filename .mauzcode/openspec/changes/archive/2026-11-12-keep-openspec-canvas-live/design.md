## Context

`openspec.watch({ dir })` keeps one recursive `fs.watch` per workspace, debounces 300 ms and emits `openspec.changed` with a hashed key. Only `op=snapshot` touches it; after 10 minutes without snapshots it closes. The UI subscribes with `useLiveSubscription` and refreshes on a matching key or resync. A manual probe confirmed the watcher emits on `mv changes/x changes/archive/x`.

## Goals / Non-Goals

**Goals:** an open tab stays live indefinitely; archiving is reflected within ~1 s; the person can see when live updates are not working and refresh by hand.

**Non-Goals:** changing the shared live transport (`procs/events/client.js`), remote (SSH) workspaces, write actions from the tab.

## Decisions

1. **Keep-alive op.** `GET /openspec?op=watch` (same authorization as snapshot: owned open item, dir from item args) calls `openspec.watch({ dir })` and returns `{ key }`. The tab calls it every 2 minutes while `document.visibilityState === 'visible'`, and immediately on resync and on becoming visible. If the returned key differs from the snapshot key, the tab refreshes. Alternative — no idle timeout at all — rejected: watchers would leak for closed tabs.
2. **Selection follow.** When the selected change id disappears from Changes and an archive entry ending with `-<id>` appears, the tab switches to Archive and selects it, preserving the artifact kind (proposal/design/tasks/spec).
3. **Live state.** Derived from `mauzcodeLive.getStatus/onStatus` plus keep-alive failures; shown as a small status text with `aria-live="polite"`. Refresh button triggers the same path as resync.

## Risks / Trade-offs

- A timer per open tab adds one cheap request every 2 minutes → acceptable; stops while hidden.
- Archive name matching by suffix could match two dated entries → pick the newest.
