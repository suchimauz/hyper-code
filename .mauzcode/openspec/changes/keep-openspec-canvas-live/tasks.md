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
- [ ] 3.2 Manual: open tab, wait past idle timeout, archive a change, see it move within a few seconds
- [x] 3.3 `openspec validate keep-openspec-canvas-live --strict` passes
