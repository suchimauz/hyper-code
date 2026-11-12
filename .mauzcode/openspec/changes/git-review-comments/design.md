## Context
`plugins/git` (namespace `gitUi`) renders a read-only Canvas tab (`gitUi.repository`) pinned to `{ dir, host }`. `gitUi.handle` authorizes every HTTP request by agent ownership and an open owned Canvas item, and dispatches `op=snapshot|commit|diff`. The UI (`ui/index.tsx`) uses `react-diff-view` + `refractor` and fetches on demand without live updates. The OpenSpec plugin already implements the live pattern we reuse: `openspec.watch` (shared, debounced, idle-expiring watcher emitting `openspec.changed { key }`) and `useLiveSubscription` with a Live / Connecting / Not live pill.

Archival is centralized in `session.archive` (route, `agent.archiveMember`, `agent.archiveCompleted`, `agent.delegateTask`, compaction cleanup all call it). Deletion is `session.delete`. The hook system (`procs.hooks.run`, `$hook_<name>.ts` files) already supports fan-out to plugin handlers, e.g. `session.taskDone`.

## Goals / Non-Goals
Goals:
- Live repository data with an explicit live status and manual refresh.
- Line-range review comments on commit diffs and uncommitted diffs, owned by one agent and one repository.
- Explicit batched delivery to the owning agent, agent tools to read and resolve, resolved history with reopen.
- Irreversible deletion of an agent's comments when the agent is archived or deleted.
- A polished Apple-design-aligned UI delivered as a separable task block.

Non-Goals:
- Comments on arbitrary ref ranges (A..B) or on unchanged lines outside a diff.
- Threads or multi-party discussion; only a single resolution note from the resolver.
- Automatic delivery on every new comment.
- Any repository writes (stage, commit, branch, fetch, push), blame or graph.
- Sharing comments across agents of the same repository.

## Decisions

### Storage
Plugin migration creates `git_review_comments`:

| column | type | notes |
|---|---|---|
| id | uuid PK | `Bun.randomUUIDv7()` |
| agent_id | text NOT NULL | FK `agents(id) ON DELETE CASCADE` |
| host | text NOT NULL | `local` or SSH alias, from Canvas item |
| dir | text NOT NULL | absolute repository dir, from Canvas item |
| scope | text NOT NULL | `commit` \| `worktree` (CHECK) |
| commit_hash | text NULL | required iff scope = commit, 40/64 hex |
| worktree_group | text NULL | `staged` \| `unstaged` \| `untracked`, required iff scope = worktree |
| path | text NOT NULL | repository-relative, validated like `gitUi.checkPath` |
| old_path | text NULL | rename source |
| side | text NOT NULL | `old` \| `new` |
| line_start, line_end | int NOT NULL | 1-based, start ≤ end |
| line_text | text NOT NULL | snapshot of the anchored lines, ≤ 2 KiB |
| body | text NOT NULL | markdown, 1..8 KiB |
| status | text NOT NULL | `open` \| `resolved` |
| resolution_note | text NULL | ≤ 2 KiB |
| resolved_by | text NULL | `user` \| `agent` |
| sent_at, resolved_at | bigint NULL | epoch ms |
| created_at, updated_at | bigint NOT NULL | epoch ms |

Index `(agent_id, host, dir, status)`. Limit: at most 500 open comments per (agent, host, dir).

Alternative considered: storing comments in agent scratchpad — rejected because it cannot be queried by repository, cannot cascade and is not visible to SQL sweeps.

### Outdated detection
Commit anchors are immutable. For worktree anchors the server compares `line_text` with the corresponding lines of the current diff for the same group and side when the file diff is loaded or the list is built; a mismatch or a missing file yields `outdated: true`. Outdated is computed, never stored, and never deletes a comment.

### Authorization
Every comment operation resolves `{ agentId, itemId }` exactly like existing `gitUi.handle` reads, then derives `host` and `dir` from the owned open Canvas item. All SQL joins `agents` with `archived_at IS NULL`, so an archived agent's comments are invisible and cannot be created even before cleanup. Browser POST operations require the CSRF token. Agent tools derive the agent from the calling session and the repository from the agent's workspace (or an explicit `dir`/`host` that must match an open owned `gitUi.repository` item); an agent can only read or resolve its own comments.

### Delivery
`gitUi.commentsSend` selects open comments with `sent_at IS NULL` for the (agent, host, dir) in a transaction with `FOR UPDATE`, renders one message and delivers it to the owning agent through the existing server-side agent messaging path (`ui.sendToAgent`; verify during implementation that it appends a user turn and schedules a run; otherwise use the documented session append + worker wake API). `sent_at` is set in the same transaction as the claim; on delivery failure the transaction rolls back so the comments remain unsent. A second send with nothing new returns `{ sent: 0 }` and sends nothing.

Message format (plain markdown, stable for agents):
```
Git review comments for <host>:<dir> (<n>)
Use gitResolveComment({ id, note }) after addressing each one.

1. <path>:<start>-<end> (<side>, commit <short> | <group>) — id <uuid>
   > <quoted line_text>
   <body>
```

### Agent tools
Native tools declared through `$tool_*.md` in the plugin:
- `gitReviewComments({ status?: "open"|"resolved"|"all" = "open", path? })` → compact list with ids, anchors, quoted lines, body, outdated, sent.
- `gitResolveComment({ id, note? })` → sets `status=resolved`, `resolved_by=agent`, `resolved_at`, `resolution_note`; idempotent for already resolved comments.
Tool results are untrusted-content-free (only the person's comment text) and bounded.

### Live updates
`gitUi.watch({ host, dir })` mirrors `openspec.watch`: shared entry per `key = sha256(host + dir)[:16]`, touched by each authorized snapshot request, idle-closed after 10 minutes.
- Local: recursive `fs.watch` on the working tree, ignoring `.git/objects` and `.git/logs`, plus `.git/HEAD`, `.git/index`, `.git/refs`, `.git/packed-refs`; debounce 300 ms; on native watcher failure fall back to the same fingerprint polling used for SSH.
- SSH: every 3 s run `git rev-parse HEAD` and `git status --porcelain=v2 -z --untracked-files=all` through `gitUi.command` (existing bounds), hash the output, emit on change. SSH errors set the entry state to `error` and never fall back to local execution.
- Events: `gitUi.changed { key }` for repository data; `gitUi.comments.changed { key }` after any comment mutation, including agent resolution and archive cleanup. The snapshot response includes `liveKey`.

### Archive and delete cleanup
- Core: `session.archive` runs `procs.hooks.run({ name: "session.archived", opts: { agentId } })` after the successful `UPDATE` and before returning. Handler errors are caught and logged; archival is never rolled back. Idempotent re-archival (already archived) does not re-run the hook.
- Plugin: `$hook_session.archived.ts` deletes every row for `agent_id` (open and resolved) and emits `gitUi.comments.changed` for each affected key.
- Sweep: `gitUi.sweepArchived` runs at plugin start and hourly, deleting rows whose agent has `archived_at IS NOT NULL`, covering crashes between archive and hook.
- Delete: the foreign key cascade removes rows when `session.delete` removes the agent.
- `session.unarchive` does not restore anything.

### HTTP surface
Existing `$route__GET` / `$route__POST` delegate to `gitUi.handle`. New ops:
- GET `op=comments&status=&path=` → `{ comments, openCount, unsentCount }`.
- POST `op=commentCreate|commentUpdate|commentResolve|commentReopen|commentDelete|commentsSend` with JSON body.
Errors are JSON `{ error }` with 400 (validation), 403 (ownership/CSRF), 409 (limit); all responses `Cache-Control: no-store`.

### UI
React only, through `@mauzcode/ui` and the plugin's declared dependencies. Layout: translucent header (repository, branch, short HEAD, segmented Changes / History / Comments with open-count badge, live pill, Refresh, primary "Send to agent (N)"); list pane left, diff pane right; single column with back control on narrow widths. Diff gutters get a hover "+" affordance and click/shift-click/drag range selection that opens an inline composer; existing comments render as inline widgets via `react-diff-view` widgets. Live refreshes preserve selection and scroll. Full details are in tasks section 6.

## Risks / Trade-offs
- Recursive local `fs.watch` on large repositories can be noisy → debounce, ignore `.git/objects`, idle close, polling fallback.
- SSH polling costs one round trip per 3 s per open repository → only while the watcher is touched by an open tab; idle close after 10 minutes.
- Hook after archive is not transactional → JOIN on `archived_at IS NULL` hides data immediately; sweep guarantees eventual deletion.
- Core change to `session.archive` → minimal, failure-isolated, covered by existing lifecycle tests plus new hook tests.
- Line anchors drift as the working tree changes → computed outdated badge instead of silent loss.

## Migration Plan
1. Add the migration and run `procs.migrate.up`.
2. Ship backend, tools, hook and sweep; reload the `gitUi` and `session` namespaces and HTTP routes.
3. Ship the UI; the host rebuilds the plugin bundle, which requires person approval of the new bundle hash when policy demands it.
Rollback: revert the plugin and the core hook call; the `down` migration drops the table (comments are lost, which is acceptable for this feature).

## Open Questions
None blocking. `ui.sendToAgent` suitability is verified in task 3.1 with a documented fallback.
