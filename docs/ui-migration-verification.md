# React shell migration verification

## Scope

Migration started at `718ffcfa`. Other concurrent work may advance HEAD; the UI change does not reset that work. The old navigation/dock/chat shell is deleted, not moved into a renamed compatibility module. `ui.layout` remains the minimal document hook required by dynamic `procs.http.toResponse` string and `{main}` responses.

Delivered surfaces:

- Native People page and authorized `/auth/users` JSON writes; HTML redirects to React.
- Browser sidebar draft with first-message atomic claim/retry reuse, native React composer and existing attachment pipeline.
- React Applications catalogue from explicit `nav.items` registration, retaining required built-in/plugin server documents without loading the retired shell.
- Native Canvas text editing and directory navigation; optimistic explicit Save, conflict handling, preserved mounted tab contents, host-granted React plugin kinds. Other plugin renderers and rich/binary previews retain item documents.
- Secure input compatibility, Redmine's separate approval authority, HTML/URL sandboxes, SSE resync and SDK example dev/test-only status are retained.

Current source redirects `/projects/view` and `/projects/archive` into the native workspace filter. Generic popup/RPC helpers and scripts are removed; `POST /rpc` is a 410 tombstone without payload parsing or runtime dispatch. Page-local HTMX, Canvas item documents/assets, protected input cards and independent Redmine approval transports remain intentionally. Sber/TBank are not migrated or enabled.

## Third-wave source and verification

The worktree now removes ordinary `renderEventHtml` branches and `ui.chatEventCard`, with only the protected input-card adapter retained. Native lifecycle/busy-tool receipts, Push settings, People presence, initial-prompt inspection, project-icon editing and transient `SecureInputDialog` replace their old app UI paths. Mentions uses structured `mentions.rowsData`. Shared document rendering, Canvas fallback documents and protected input/Redmine authority are preserved; not all SSR is removed.

Explicit terminal `respondHtml` answers now carry `htmlSource: assistant-answer` and render through a bounded parse5-to-React semantic allowlist. No raw HTML injection, handlers, styles, URL attributes, forms, SVG or media are admitted; links become text and the plain-text version remains available. Historical unmarked HTML is not automatically trusted because the same stored field also contains rendered Markdown; those events retain their text fallback. The three frontend HTML security/provenance tests and seven API projection tests passed. This deliberately does not promise pixel-identical historical HTML rendering.

A broader worker verification attempt reported `runGoal` harness failures involving a missing `classifyError` mock and an `appendHelpers` timeout. The parent reran both with a 240-second test allowance: `appendHelpers` passed after 100.47 seconds, while `runGoal` had 10 passes and 35 failures. An isolated copy of both `run.ts` and its test from HEAD `464b1d3c` reproduced the same 10/35 result (scratch `baseline-goal.log`), establishing that those failures precede this wave; no goal behavior was changed to hide them. The separately rerun 46-test selection below is green; the whole backend suite has not been certified.

The third-wave production build and **584 frontend tests across 115 files** pass after the popup removal and final author/dialog changes. Human author display has 16 focused fixture tests; the transient dialog has 14 React lifecycle tests plus a source guard, including explicit submission, cancellation, expiry and authorization-loss cleanup. Menu/default-layout and parking/wake fixture repairs pass 12 tests (72 assertions). RPC/document retirement separately passed 22 mocked tests (151 assertions). These are bounded checks, not a claim that the entire backend suite is green.

Read-only browser checks of People and Notifications show no alerts, Vite error overlay or legacy popup host. `/secureInput/current` returned 200 with no active prompt; no real secret was entered. Earlier own-agent full-prompt reader inspection showed the native reader without logging its contents. Screenshot capture timed out, so no screenshot-based visual verification is claimed. No real notification subscription, reset, icon save, secret submission, send or approval was performed.

The final call-graph audit still reports eight unrelated unresolved calls in private healthrepo/circleback/tunnel integrations. Global code quality is therefore **not** green. The parent rerun of 46 focused backend tests across 13 files passes (256 assertions), covering RPC, transient secrets, icons, structured widgets, prompt reads, tool abort, lifecycle, retired shell and PAYG classification. An additional cold 16-test selection passes (72 assertions, 103.16 seconds) after test-only repairs to lifecycle mocks, native secure-input control assertions and Anthropic settings redirects. Frontend logs are stored locally under `.hyper/tmp/ehz/final-build.log` and `final-frontend.log`; the 46-test log is `final-backend.log`. An additional protected-input/Canvas selection passes 30 tests (151 assertions), including compatibility metadata, choice/cancel behavior, durable input waiting and transient secret submission (`final-protected.log`). Its wait fixture was updated with an in-memory transaction wrapper; this does not claim to test database locking or rollback.

## Earlier shell-migration checkpoint evidence

The following records the earlier checkpoint and is retained as historical evidence, not a claim that these exact checks cover the final third-wave worktree. Commands run from the repository root. Scratch outputs are local, git-ignored evidence, not shipped artifacts.

| Check | Result / evidence |
| --- | --- |
| Frontend suite | `bun run frontend:test`: 452 tests, 88 files, all pass (`.hyper/tmp/ehj/frontend-final.log`). |
| Frontend compilation | `bunx tsc -b frontend/tsconfig.json --pretty false` and `bun run frontend:build`: pass. |
| Focused backend, final combined run | 73 tests / 417 assertions, no failures across 16 files (`.hyper/tmp/ehj/combined-final.junit.xml`); includes dynamic `toResponse`, redirect, input compatibility, choices/confirms and draft fixtures. This is not claimed to be the original unidentified core-129 set. |
| Final native Canvas security gate | 35 tests / 152 assertions, no failures across eight files (`.hyper/tmp/ehj/final-security.junit.xml`). Includes actual `currentUser`/cookie-bound CSRF functions with isolated auth fixtures, rejection of other users (including another account owner), archived agents and forged/missing tokens, plus file navigation denial. |
| Middleware/catalogue follow-up | 7 tests / 15 assertions, no failures (`.hyper/tmp/ehj/middleware-final.junit.xml`). Middleware fixtures now supply the actual runtime contracts, retaining cross-origin rejection assertions. |
| Real Chrome fixture | `src/canvas/canvas.browser.it.test.ts`: 3 tests / 11 assertions, no failures or skips, two runs. Isolated server and Chrome; no live DB, real accounts or approval endpoints. Covers Applications filtering/theming, Canvas unsaved-tab identity and exact CSRF Save, and read-only People. |
| Live read-only smoke | Separate browser tab at `/?view=applications`: React surface present, 24 declared application buttons, no alert, no old nav overlay or dock. No account mutations or real confirmations. |
| DB-dependent draft/CSRF | Isolated DB tests pass with `--timeout 180000`: 4 tests / 37 assertions (`.hyper/tmp/ehu/long.junit.xml`, repeated in `profile.junit.xml`). Earlier 20–60s timeouts were cold bootstrap, not assertion failures. |
| Runtime validation | `ui.layout`, `sidebar.draft` and `canvas.authorizeHttp`: strict metadata + targeted typecheck pass after hot reload. Routes use targeted checks and route reload rather than function-doc validation. |
| Full project typecheck | Still fails outside the focused frontend gate (`.hyper/tmp/ehj/project-typecheck.log`), including missing private-plugin functions and unrelated backend/test type errors. Not reported as passing. |
| Indexed quality | The initial eight unresolved calls in private `.hyper` integrations remain; reindexing changed routes/draft removes stale references to deleted UI functions. No claim that the whole installation is clean. |

## Environment findings

The installed TypeScript 7.0.2 package exposed version metadata but no compiler API. Runtime reflection/indexing depends on that API. TypeScript is pinned to 5.9.3, with lockfile updated; frontend build/typecheck pass with this version. Runtime reload/validation was restored without restarting the service.

The isolated test context's first boot took roughly 90–103 seconds. CPU profiling found `procs.project.scan` canonicalizing ignored paths before its ignore check (about 89% of samples in `cachedRealpath`, with a large local `.hyper/tmp` tree). Increasing the test deadline allowed existing assertions to complete. No production data was deleted and no unrelated scanner refactor is part of this UI migration.

Broader legacy-adjacent checks also exposed four pre-existing transient-stream/coalescing expectation failures and one inspector typography expectation failure; those unrelated behaviors were not rewritten to make the suite green. The focused migration checks above are not a claim that every backend test passes.

## Safety boundaries

Browser tests use fixtures and exact allowlists, never real Redmine/bank approval. No generic submit has been substituted for Redmine confirmation. Canvas native file read/save and file navigation require cookie-bound CSRF; state/document/native operations verify the target's exact creator and reject archived targets. Legacy ownerless access is limited to ownerless agents, never another user's agent. File targets are pinned by the file kind's existing prepare step. Local Save checks the last-read content before writing; it is not a filesystem-wide atomic compare-and-swap against external editors. No database migration or user-data cleanup is required for shell removal. Local commit only: no push and no service restart.
