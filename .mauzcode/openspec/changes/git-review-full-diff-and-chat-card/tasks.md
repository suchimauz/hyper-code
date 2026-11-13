# Tasks

These tasks are for the subsequent implementation stage, not the approved artifact-only stage.

## 1. Contracts and retrieval

- [ ] 1.1 Read repository guidance, Apple Design and UI SDK architecture; inspect affected runtime slices/callers and chat serialization/grouping; verify a recorded interface map covers ownership, message persistence and work association.
- [ ] 1.2 Add optional validated IDs filtering to authorized comment retrieval and the agent tool, preserving existing pagination and filters; verify tests cover exact sets, empty/invalid IDs, all statuses, foreign IDs, closed tabs, workspace mismatch and unchanged unfiltered calls.
- [ ] 1.3 Update tool schema and actionable runtime documentation; verify strict docs validation and typecheck after hot reload.

## 2. Durable references and chat presentation

- [ ] 2.1 Add versioned compact review-reference encoding/decoding through session APIs and event serialization; verify round-trip persistence and readable legacy full-text fallback without direct transcript mutation.
- [ ] 2.2 Add authorized on-demand card detail retrieval with missing-ID placeholders and current-version labels; verify edited/deleted comments, access denial and exclusion of unrelated newly created comments, and document live rather than snapshot semantics.
- [ ] 2.3 Render the accessible Git review count card outside tool-call groups and inside its associated work/Completed group; verify mixed form/tool/review grouping, completion, reload, themes, keyboard focus and reduced motion in frontend tests.
- [ ] 2.4 Switch commentsSend to reference-only delivery while retaining atomic scheduling and receipts; verify no bodies/quotes/diffs in model-facing delivery, concurrent/repeated Send, reopen eligibility and full rollback on failure. Update plugin workflow documentation and hot-reload/validate changed functions.

## 3. Aggregate diff review

- [ ] 3.1 Add reusable keyed aggregate file blocks with independent/default-expanded collapse and collapse/expand-all controls; verify target identity includes repository/scope/group/hash/path and controls expose keyboard/focus/expanded semantics.
- [ ] 3.2 Add Changes Full diff with three separate sections while retaining single-file viewing; verify a path shared by Staged and Unstaged keeps separate comments and targets, and document the new entry point.
- [ ] 3.3 Make History commit selection open the aggregate and file selection navigate to its block; verify root/merge comparison semantics, shallow-parent errors and collapse isolation across commits.
- [ ] 3.4 Add bounded near-viewport loading and stale-response protection; verify request concurrency, offscreen behavior, preserved size limits, per-file failures and live refresh retaining collapse state.
- [ ] 3.5 Reuse DiffView/comment actions in aggregate blocks; verify unified/split rendering, old/new-side range comments, outdated indicators, rename anchors and explicit binary/conflict/submodule/oversized states. Update review workflow docs alongside the tests.

## 4. Integrated acceptance

- [ ] 4.1 Exercise Changes and History through create/send/read/resolve with local and SSH targets; verify no local fallback or Git mutations and that the agent receives only references until it explicitly retrieves comments.
- [ ] 4.2 Run relevant backend/frontend tests, typechecks and code quality checks; verify changed runtime docs strictly, regenerate types/reload routes when applicable and record results without claiming unrun checks passed.
- [ ] 4.3 Verify legacy full-text history plus newly persisted reference cards survive reload and the documented rollback retains readable new history; record acceptance against both capability specs.

## Workflow follow-up

- Request a separate user instruction before beginning application-code implementation.
- Archive only after implementation and the applicable review requirements are satisfied; do not archive this artifact-only change now.
