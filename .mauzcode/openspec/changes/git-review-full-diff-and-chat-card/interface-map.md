# Block 1: interface map and verification

## Scope and guidance

Block 1 only: retrieval contracts, tests and documentation. No UI, send serialization, card, aggregate diff, launcher or history-decoration changes. Guidance inspected: AGENTS.md, CLAUDE.md, docs/skills/apple-design/{SKILL,README}.md, docs/ui-architecture.md; public SDK index, extension types/registry/installed/pluginRuntime/ExtensionHost. Future UI must preserve keyboard focus, explicit expanded state, themes, restrained hierarchy and reduced motion. Plugin UI stays in plugins/git/ui and imports the public @mauzcode/ui and host React, not private core components.

## Ownership and retrieval

- Native `$tool_gitReviewComments.md` dispatches to `gitUi.gitReviewComments`. Identity is never a model argument.
- `commentToolTarget` resolves the injected calling agent and its current workspace to an exact open pinned host/directory Git tab. Workspace mismatch or missing tab fails; no fallback.
- `commentsList` calls `ownedItem` before querying and again before returning. `ownedItem` requires an active non-archived agent and an owned open Git Canvas item. SQL intersects agent, host, directory, status, path and optional IDs. HTTP callers must first authorize the owner via `canvas.authorizeHttp`.
- `code.slice` and `code.callers` inspected for both edited runtime functions. Direct callers of commentsList: gitReviewComments and handle. The latter keeps its existing query contract unchanged; no HTTP IDs endpoint is introduced in block 1. Native tool entry has no indexed direct callers.
- Optional `ids`: maximum 500 UUID strings; absent preserves listing, [] matches none, duplicates/case variants do not duplicate rows. Invalid values fail at runtime before SQL. Unknown/deleted/foreign IDs are omitted. Use status all for a delivered set and keep filters unchanged across nextPage. Current values, not historical snapshots.
- Pagination ordering remains created_at/id; tool pages remain ten items. Repository-wide open/unsent counts do not narrow with IDs or other filters. Larger delivery sets must be split into <=500-ID batches, following pagination in each batch.
- The native JSON Schema declares maxItems and UUID pattern. Existing generic tools.validate enforces types but does not enforce pattern/maxItems and skips optional nulls; commentsList explicitly enforces all these constraints. Core validator behavior is not changed here.

## Persistence, serialization and work association (future block 2 boundaries)

- `commentsSend` locks the agent and eligible comments within a DB transaction, calls `session.appendUserMessage` with messageType git_review_comments, schedules agents.next_run_at and writes receipts atomically. It currently sends full text; unchanged here.
- `appendUserMessage` passes role:user/content/message_type through `session.appendMessage`, then persists a user event via appendEvent with messageIdx and optional eventExtra. Never mutate live message/event arrays. Any reference metadata must survive both message and event persistence.
- `session.getEvents` reads persisted event payloads; `agent/$route_$id_events_GET` exposes the event history. New card metadata must also survive the primary React chat transport, not merely this compatibility route.
- `frontend/src/components/mauzcode/transcriptGroups.ts`: processEntries groups thinking/tool_call/tool_result and peers, not ordinary user events. workTurns prefers durable RunMetadata startIdx/endIdx/answerIdx; legacy fallback uses linked human input. It currently carries only adjacent peer suffixes into a newly started run.
- `Transcript.tsx` renders turn.input before WorkGroup, then processEntries(turn.events) inside it. Therefore merely rendering a card for user text would not establish the requested Completed-group association. Block 2 must explicitly classify review deliveries and associate their durable initiating identity with the run; it must not fabricate tool messages or infer association from component position.
- `WorkGroups.tsx` owns completion collapse and aria-expanded controls. Plugin review detail UI belongs to Git; any core changes should be limited to the chat integration contract/classification. Current SDK extensions do not by themselves establish review-card persistence or work association.

## Evidence

- Hot reload: procs.repl.load({name:'gitUi'}) succeeded (27 functions plus registered resources).
- runtime.docs.validate strict:true,typecheck:true: gitUi.commentsList and gitUi.gitReviewComments both ok, no errors/warnings.
- code.quality extra-parameter: ok, zero findings.
- Postgres integration suite: `bun test --timeout 30000 plugins/git/src/gitUi/comments.it.test.ts` passes. Includes exact set over two pages, all/open/resolved filters, empty/invalid IDs, duplicate/case variants, deleted/foreign IDs, path intersection, unchanged unfiltered listing/counts, workspace mismatch and closed tabs, plus existing lifecycle/HTTP/CSRF/send rollback coverage.
- Cold test bootstrap exceeded the default 5-second per-test timeout in one run; rerun with explicit 30 seconds passes. No product workaround or unrelated validator changes made.
- No commit performed. Parent reviews and commits block 1 independently.

### Block 2 evidence (2.1–2.4)

- 2.1 Reference: `types.session.ReviewReference` + `session.decodeReviewReference` (version 1, host, absolute dir, 1–500 unique lower-cased UUIDs, count===ids.length; else null). Persisted via `session.appendUserMessage({eventExtra:{gitReview}})` — no direct transcript mutation. Events API projects `gitReview` only for user events whose message has `message_type='git_review_comments'`; forged fields on ordinary messages and legacy full-text deliveries project `null` and keep their text. Live check: legacy agent `fr` events 543/552 (messages 532/542) → `gitReview:null`, text intact.
- 2.2 Details: `gitUi.reviewCard({agentId,eventIdx})` via `GET /gitUi?op=reviewCard&eventIdx` (after `canvas.authorizeHttp`). Reads the persisted typed event, requires an open owned Git tab for the reference host/dir (else 403 "Access denied…"), lists IDs through `commentsList({ids,status:'all'})`; send order, `unavailable` placeholders, `changedAfterSend` current-version flag; later unsent comments excluded; appends no messages/events. Live, not snapshot (documented in UI note and SKILL.md).
- 2.3 Card: new UI slot `chatCards` (grant `procs.ui.chatCards`, kind must start with `<plugin>.`; registry, uiCompile, uiManifest approval comparison, SDK types). Core `GitReviewCard` (`Git review · N`, `aria-expanded`/`aria-controls`, focus-visible, reduced-motion, prefers-contrast, theme passed to plugin) rendered by `TranscriptMessage`; `transcriptGroups` keeps reviews out of human input/process groups, carries them into the durable run they wake, and starts legacy run-less work at them. Plugin `ReviewCardDetails` renders details/placeholders/denial.
- 2.4 Send: `commentsSend` text = header, retrieval instructions (`gitReviewComments({ ids, status: 'all' })`, `nextPage`, `gitResolveComment`) and `ids: [...]`; no bodies, quotes or diffs. Same transaction, locks, receipts and rollback.
- Validation: `runtime.docs.validate` strict+typecheck ok for gitUi.commentsSend, gitUi.reviewCard, gitUi.handle, session.decodeReviewReference; hot reload gitUi + plugins.reload + loadRoutes; live manifest shows git grants `chatCards:["git.review"]`. `code.quality`: 8 unresolved errors, all pre-existing and unrelated (myhealthGaps, skill, tunnel).
- Tests: `bun test --timeout 30000 plugins/git/src/gitUi/comments.it.test.ts` 28/28 (incl. reference-only content + event payload, concurrent Send, reopen resend, rollback, new reviewCard order/placeholder/edited/unsent-excluded/forged/foreign/404/400/403 HTTP+closed-tab, repeated sends). Events route test 8/8. `src/plugins/ui.test.ts` 7/7 (chatCards grant). Vitest: registry 11/11, work-groups 23/23, git-review-card 2/2, git-extension 18/18; full `frontend:test` 747/749 — the 2 failures (live-navigation mobile shortcut, quota-matrix sidebar) also fail with all changes stashed (pre-existing). `tsc -b frontend/tsconfig.json` clean.
- No commit performed.

### Block 2 review follow-up

- Theme source: the SDK `ExtensionContext.theme` is supplied by the host. The shell's `useTheme` writes the resolved theme to `<html data-theme>`, and the transcript receives no theme prop. `GitReviewCard` now subscribes to that attribute through `useSyncExternalStore` and a `MutationObserver` (`useDocumentTheme`), so expanded plugin details re-render on a light/dark or OS (system mode) switch. It no longer reads the theme once.
- Keyboard and accessibility tests (`frontend/src/test/git-review-card.test.tsx`, 5/5):
  - Tab reaches a native `button type=button`; Enter and Space toggle it; `aria-expanded` and `aria-controls` match the `hidden` panel.
  - Collapsed details are not mounted, so their controls cannot be reached.
  - Focus stays on the toggle and Tab continues into the details; decorative icons are `aria-hidden`.
  - A live theme switch while expanded re-renders the details.
- Boundary of automated CSS checks: jsdom (with vitest `css:false`) cannot evaluate media queries, `:focus-visible` or computed colours. The test only checks that the stylesheet contains the focus-visible outline (`var(--focus-ring)`), the `prefers-reduced-motion` rule disabling transitions/animations and the `prefers-contrast` rule. It also checks that there are no hard-coded colours (theme tokens only) and that the plugin details contain no transitions or animations. Visual theme and motion rendering need a real browser check, which has not been done.
- Send above 500: `commentMutate` already enforces at most 500 open comments per agent/host/dir for create and reopen, under the agent row lock (existing test "500-open limit…"). `commentsSend` selects only open unsent comments, so it normally needs one reference. As a defence against legacy or corrupt data, `commentsSend` now splits larger sets into ordered references of up to 500 IDs. They share one timestamp and one transaction with the receipts and scheduling. New test: 500 → one reference, the 501st create is rejected (409 message), and a forced 501 → references of 500+1 with all comments receipted and every card available. `runtime.docs.validate` strict+typecheck is ok.
- Re-run: `comments.it` 29/29. Full `frontend:test` 750/752; the same 2 failures (live-navigation, quota-matrix) were already failing before this change. `tsc -b` is clean. `git status` has 33 entries (26 modified, 7 untracked).
