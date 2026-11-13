## Context

See proposal.md for motivation and scope. plugins/git/ui/index.tsx currently renders a selected target through DiffView. gitUi.commentsSend locks the agent and eligible comments, appends a typed user message, schedules work and records sent_at in one transaction. Its message currently includes bodies and quoted lines. gitReviewComments returns pages of ten and requires an owned open tab matching the calling workspace. No canonical Git review spec currently exists.

## Goals / Non-Goals

Preserve precise review targets, bounded loading, delivery atomicity and existing access controls while changing navigation and chat presentation. This stage produces specifications only. Git writes, automatic fixes, PR/MR integrations, historical comment snapshots and replacing the plugin UI architecture are out of scope.

## Decisions

### Reuse per-file diff rendering in an aggregate container

Build whole-review containers around the existing DiffView and comment actions, rather than concatenate patches into an unstructured text view. Changes retains single-file selection and gains Full diff. History selects the aggregate by default and its file list navigates to blocks. Keys include pinned repository identity, scope/group, full commit hash and path; oldPath remains available for rename anchors. Collapse all/expand all affects the current aggregate only. Default expanded state does not imply immediate fetching: load near-viewport expanded blocks with a small bounded request queue, retaining existing backend output limits. Invalidate stale requests on target changes. Live refresh preserves collapse state for retained keys and recalculates outdated anchors.

### Preserve existing comparison and exceptional-state semantics

Keep root empty-tree and merge first-parent behavior, existing non-text states and SSH targeting. Each block owns its load/error state so one failure does not blank the aggregate. Do not raise diff limits to simulate complete coverage: explicitly indicate unavailable/truncated content.

### Persist references rather than full content

Retain the typed git_review_comments user message and transaction boundaries. Store a versioned compact reference payload containing host, dir, count and the ordered sent IDs in durable message data, through session APIs only. Its model-facing text contains those references and instructions to call gitReviewComments with IDs and status all, then follow pagination. No comment bodies or code quotes are included. Reference-only delivery is preferred over duplicating mutable comment content or introducing a new snapshot table.

Extend gitReviewComments and the authorized listing path with an optional validated UUID-array IDs filter; filters intersect with ownership/repository and existing status/path filters. Keep the ten-item agent page limit and unchanged behavior when IDs is absent. An explicitly empty IDs list matches nothing, not all comments. Follow pagination with unchanged filters. Document how deleted IDs may be absent. Card reads preserve unavailable placeholders using the original sent list. Schema/tool documentation and call sites must change together.

### Render a distinct durable chat event

Classify new review deliveries before generic user-message and tool-call grouping. Render a dedicated expandable review row using the same presentation principles as form history, without forging role=tool messages. Associate the initiating review with its work group using durable event/run identity, not current component position; retain it when the work completes and the outer group collapses. Legacy messages without structured references retain readable text fallback.

Card expansion fetches authorized current details for the exact sent IDs; it does not append messages or events carrying those details to the agent context. Display current status and mark post-send edits as current versions, with unavailable placeholders for removed records. Do not claim a historical snapshot. Keep all plugin review UI in the plugin; core changes are restricted to the chat contract, classification and rendering integration. Use the public UI SDK, existing authenticated/CSRF-aware transport and existing session persistence APIs. Do not loosen target authorization to make old cards appear available.

## Risks / Trade-offs

- Many files or IDs can be large → lazy bounded diff loading, existing limits and paginated comment retrieval; IDs remain proportional to the sent set.
- Delayed responses can cross targets → target-key checks, request cancellation or generation guards.
- The same path appears in multiple scopes → scope/group/hash-aware identity, never path-only comment matching.
- Live details differ from sent-time content → explicit current-version labels; historical body snapshots are intentionally not promised.
- Closed tabs or changed workspaces prevent retrieval → clear unavailable guidance, never silently change target or bypass ownership.
- Chat grouping can regress forms or ordinary tools → dedicated classification and mixed-history regression tests.

## Migration Plan

1. In the later implementation stage, read AGENTS.md, Apple Design guidance, docs/ui-architecture.md and SDK extension contracts; inspect relevant code.slice/callers before interface changes.
2. Add optional retrieval filters and compatible durable reference decoding, then chat rendering/grouping, then enable compact sends. Existing full-text messages remain readable; no historical rewrite or new table is required.
3. Implement aggregate diff views and accessibility using current tokens and components.
4. Run targeted backend/UI tests, typechecks and quality checks, hot-reload modified functions and strictly validate runtime docs; reload routes or regenerate types if required.
5. Rollback disables new aggregate entry points and compact sending while retaining the reference-message reader so newly persisted review messages stay readable. Never delete comments or rewrite history as rollback.

No application code is changed by the current artifact-only stage. Implementation requires the user's subsequent request.
