# Tasks

All items describe future implementation. Sections 1–5 and 7 are backend work; section 6 is a self-contained UI block that can be handed to a separate UI agent once sections 1–5 expose their HTTP contracts.

## 1. Data and migration

- [x] 1.1 Add `plugins/git/src/gitUi/$migration_<ts>_review_comments.ts` creating `git_review_comments` exactly as in design.md (CHECK constraints for scope/group/side/status, FK `agents(id) ON DELETE CASCADE`, index `(agent_id, host, dir, status)`) with a `down` that drops it; run `procs.migrate.up` and verify the schema through `information_schema.columns`.
- [x] 1.2 Add types `types.gitUi.ReviewComment` (row view incl. computed `outdated`) and `types.gitUi.CommentAnchor`; run `procs.dev.genTypes`.

## 2. Comments API and authorization

- [ ] 2.1 Extract the existing ownership resolution in `gitUi.handle` into a reusable step that returns `{ agentId, item, host, dir }` for an owned open `gitUi.repository` item of a non-archived agent; verify existing read tests still pass.
- [ ] 2.2 Implement `gitUi.commentCreate`, `commentUpdate`, `commentDelete`, `commentResolve`, `commentReopen`, `commentsList` (via `procs.dev.createFunction`), all joining `agents` with `archived_at IS NULL`, validating paths with `gitUi.checkPath`, anchors, sizes and the 500-open limit (409).
- [ ] 2.3 Implement worktree outdated detection by comparing `line_text` with the current group diff (`gitUi.diff`), computed per request and cached per (path, group) within one list call.
- [ ] 2.4 Extend `gitUi.handle` with GET `op=comments` and POST ops listed in design.md; POST requires CSRF; JSON errors 400/403/409 with `Cache-Control: no-store`.
- [ ] 2.5 Emit `gitUi.comments.changed { key }` after every successful mutation.

## 3. Delivery and agent tools

- [ ] 3.1 Verify `ui.sendToAgent` appends a user turn to the owning agent and schedules a run; if not suitable, use the documented session append plus worker wake API. Record the choice in the function JSDoc.
- [ ] 3.2 Implement `gitUi.commentsSend`: claim open unsent rows `FOR UPDATE`, render the message format from design.md, deliver, set `sent_at` in the same transaction, roll back on delivery failure; second send with nothing new returns `{ sent: 0 }` without a message.
- [ ] 3.3 Add `$tool_gitReviewComments.md` and `$tool_gitResolveComment.md` with strict JSON Schemas (`additionalProperties: false`) and their implementations, scoped to the calling agent and its workspace repository; bound output size.
- [ ] 3.4 Make `commentReopen` clear `sent_at`, `resolved_*` and `resolution_note`.

## 4. Archive and delete cleanup

- [ ] 4.1 Core: in `src/session/archive.ts` run `procs.hooks.run({ name: "session.archived", opts: { agentId } })` after a successful UPDATE only; catch and log handler errors; do not run for already archived agents. Update its JSDoc. Run `src/session/archive*.test.ts`.
- [ ] 4.2 Plugin: `$hook_session.archived.ts` deletes all rows of the agent and emits `gitUi.comments.changed` for each affected (host, dir) key.
- [ ] 4.3 `gitUi.sweepArchived` deleting rows whose agent is archived; schedule at plugin start and hourly (idempotent registration across reloads).
- [ ] 4.4 Confirm `session.delete` cascades through the FK; confirm `session.unarchive` restores nothing.

## 5. Live updates

- [ ] 5.1 Implement `gitUi.watch({ host, dir })` modelled on `openspec.watch`: shared entry by key, touch on authorized snapshot, 10-minute idle close, local recursive watcher ignoring `.git/objects` and `.git/logs` plus HEAD/index/refs/packed-refs, 300 ms debounce, polling fallback.
- [ ] 5.2 SSH: 3-second fingerprint polling of `rev-parse HEAD` + `status --porcelain=v2 -z --untracked-files=all` through `gitUi.command`; error state on failure; never local fallback.
- [ ] 5.3 Return `liveKey` (and watcher state) in the snapshot response; emit `gitUi.changed { key }`.

## 6. UI block (hand to the UI agent)

Prerequisites: read `docs/skills/apple-design/SKILL.md`, `docs/skills/apple-design/README.md`, `AGENTS.md`, `docs/ui-architecture.md`, `frontend/src/sdk/index.ts`, and the OpenSpec plugin UI (`plugins/openspec/ui/index.tsx`) as the reference for the live pill, segmented control and status regions. Edit only `plugins/git/ui/*` (and `package.json` dependencies if strictly required). Import only `react`, `@mauzcode/ui` and declared plugin dependencies; no deep imports, no second React. Use MauzCode theme tokens for light/dark; respect `prefers-reduced-motion`. HTTP contracts: GET `/gitUi?agentId&itemId&op=snapshot|commit|diff|comments`, POST ops from design.md with CSRF via `requestJson`.

- [ ] 6.1 Header: translucent/vibrant bar with repository name, branch, short HEAD (monospace), segmented Changes / History / Comments with sliding thumb and open-count badge, live pill (dot + Live / Connecting… / Not live), Refresh, primary "Send to agent (N)" (disabled at 0, spinner while sending, brief success or error status).
- [ ] 6.2 Live: `useLiveSubscription` for `gitUi.changed` and `gitUi.comments.changed` filtered by `liveKey`, with `resync` and `onError`, cleanup on unmount; silent refresh preserving section, selection and scroll; clear empty states when a selected file or commit disappears; Not live note suggesting Refresh.
- [ ] 6.3 Lists: changes grouped Staged / Unstaged / Untracked with status glyphs and comment counts; history with author, relative date, subject and comment counts; pagination "Load more"; roving focus with arrow keys.
- [ ] 6.4 Diff commenting: hover/focus "+" in gutters; click, shift-click and drag range selection with highlight; inline composer under the range (autosizing textarea, Cmd/Ctrl+Enter save, Escape cancel returning focus); inline comment widgets via react-diff-view widgets showing body (markdown-safe text), state chips (Open, Resolved, Outdated, Sent/Not sent), agent note, Edit / Delete / Resolve / Reopen.
- [ ] 6.5 Comments section: grouped by file, Open / Resolved / All filter, activation jumps to the diff and highlights lines; resolved items animate out (none under reduced motion); empty states with friendly copy.
- [ ] 6.6 Responsive layout: two panes on wide, single pane with back control on narrow; skeleton loading; inline error alerts.
- [ ] 6.7 Accessibility: roles for tablist/listbox/grid, visible focus rings, polite live regions for live status, send results and refreshes, labels on icon buttons, contrast in both themes, state not conveyed by color alone.
- [ ] 6.8 Component tests under the frontend test setup: composer save/cancel, range selection, list filters, Send states, live refresh preserving selection (mocked subscription), keyboard-only flow.

## 7. Tests, documentation, acceptance

- [ ] 7.1 Backend tests: CRUD and permissions (foreign agent, closed tab, archived agent → 403; missing CSRF → 403), limits (409), outdated detection, send batching and idempotency and rollback, tools list/resolve and cross-agent isolation, reopen, comment change events.
- [ ] 7.2 Archive tests: hook called once on first archive and not on re-archive, hook failure does not break archive, plugin hook deletes open and resolved rows only for that agent, sweep removes missed rows, FK cascade on delete, unarchive restores nothing; existing `archive.lifecycle` tests pass.
- [ ] 7.3 Watcher tests: local event after file edit, debounce, idle close, SSH polling with mocked `gitUi.command`, no local fallback on SSH errors.
- [ ] 7.4 Run `ctx.fns.code.quality({})` and `runtime.docs.validate` (strict, typecheck) for every new or changed function.
- [ ] 7.5 Update `plugins/git/SKILL.md` and `package.json` description: live updates, review comments, tools, explicit Send, repository stays read-only, archiving an agent permanently deletes its Git comments.
- [ ] 7.6 Manual acceptance in Canvas: edit a file → diff refreshes within ~1 s; add comments → Send → agent receives one message → agent resolves via tool → comment leaves Open without Refresh; archive the chat → zero rows for the agent in `git_review_comments`.
