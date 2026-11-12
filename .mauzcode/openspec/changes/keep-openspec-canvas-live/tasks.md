## 1. Backend

- [x] 1.1 Add authorized `op=watch` to `openspec.handle` returning `{ key }` (same item/dir checks as snapshot)
- [x] 1.2 Tests: watch op authorization, keep-alive extends idle expiry, archive move emits `openspec.changed`

## 2. Canvas UI

- [x] 2.1 Keep-alive timer (2 min, visible only) plus immediate call on resync/visibility; refresh when key differs
- [x] 2.2 Follow a selected change into Archive after archiving, preserving the artifact kind
- [x] 2.3 Live state indicator (`aria-live`) and Refresh button; respect themes and reduced motion
- [x] 2.4 Frontend tests for archive follow, live state and Refresh

## 3. Verification

- [x] 3.1 `code.quality({})` ok, plugin and frontend tests pass
- [x] 3.2 Manual: open tab, wait past idle timeout, archive a change, see it move within a few seconds
- [x] 3.3 `openspec validate keep-openspec-canvas-live --strict` passes

## Verification notes

- 3.2 (2026-11-12): real Chrome tab on `/?agent=ek`. Closed the server watcher by hand to simulate idle expiry; the open tab recreated it within 22 s. Then a selected probe change was moved into `changes/archive`, and within 2.5 s the tab switched to Archive, opened `2026-11-12-probe-live-check` and showed `Live`. Probe removed afterwards.
- 2.3 follow-up (2026-11-12): via `https://mauzcode.suchimauz.com` the badge stayed on `Connecting…` while content still refreshed by polling. Browser showed `mauzcodeLive.getStatus() === 'connecting'` over HTTP/1.1 behind openresty: the proxy buffered the SSE response, so `hello` never arrived. Fixed by sending `X-Accel-Buffering: no` from `/procs/events`; the owner confirmed the badge now shows `Live`. The badge also re-reads `getStatus()` when the live client script loads late and treats received events as proof of a working stream.

## Commits

| Commit | Scope |
|---|---|
| `e7813d3e` | Keep-alive `op=watch`, archive follow, live state and Refresh (blocks 1–2) |
| `ad49bbd6` | Manual live-refresh check recorded (3.2) |
| `3f754c2b` | Fix: badge reads current transport state on mount |
| `8fda9468` | Fix: badge follows a live client script that loads late |
| `bd803c92` | Fix: disable proxy buffering for the live event stream (root cause of `Connecting…`) |

Known outside this change: the OpenSpec tab briefly requests snapshots with another chat's `agentId` while switching chats, which returns 404 in the console.
