# Design

## Context

See proposal.md for motivation and specs/openspec-workspace-viewer/spec.md for behavior. The plugin today has one function, `openspec.run`, and no UI. The official `plugins/git` plugin is the reference for the mechanics (not the look) of a plugin Canvas kind: a `$canvas_*.ts` kind with `prepare` pinning args, a `$route__GET.ts`/`$route__POST.ts` pair delegating to one handler that calls `canvas.authorizeHttp`, verifies CSRF on POST and resolves every read from an owned open Canvas item, and a React `ui/index.tsx` with `canvasKinds` and `canvasLaunchers` granted in `package.json` `procs.ui`. The live transport (`useLiveSubscription`) delivers untopiced broadcast events filtered by `type`.

## Goals / Non-Goals

**Goals:**
- One fixed, server-owned read API; the browser never sends filesystem paths, argv or hosts.
- Cheap refresh: one watcher per open workspace, debounced, shared by tabs.
- Rendering reuses the runtime Markdown renderer and sanitizer instead of a new client dependency.

**Non-Goals:**
- No generic file browser, no caching layer, no database state.
- No reuse of Git UI components or styles.

## Decisions

1. **Read files directly, not via the CLI, for lists and documents.** The snapshot walks `changes/` (except `archive/`), `changes/archive/` and `specs/` with `node:fs`, counting `- [ ]`/`- [x]` lines in `tasks.md`. Alternative: `openspec list --json` / `show --json` — slower (process spawn per refresh), no archive listing, and not the raw Markdown we want to show. The CLI is used only for validation: `openspec.run({ dir, args: ["validate", "--all", "--strict", "--json", "--no-interactive"] })`, parsed into `{ ok, items: [{ id, type, valid, issues[] }] }`.
2. **Document addressing by opaque ids.** The snapshot returns ids such as `change:<name>:proposal`, `change:<name>:spec:<capability-path>`, `archive:<name>:tasks`, `spec:<capability-path>`. The server maps an id to a path by validated segments (kebab/slug pattern, no `..`), then checks `realpath` stays inside `realpath(<dir>/.mauzcode/openspec)`. Alternative: relative paths from the browser — rejected by the spec's confinement requirement.
3. **Server-side Markdown.** `op=doc` returns `{ id, title, html, mtime }` where `html = agent.sanitizeHtmlBody(markdown.render(source))`. Alternative: client Markdown library — adds dependencies and a second sanitizer path.
4. **Tab pinning.** `$canvas_workspace.ts` `prepare` reads `workspace_dir/workspace_host` of the agent (like Git) and throws when the host is not local or the dir is not absolute; args are `{ dir }`, so `canvas.show` dedupes per directory. The POST route opens the tab for the authorized agent only.
5. **Watching.** `openspec.watch({ dir })` keeps `ctx.state.openspec.watchers[dir]` with `fs.watch(root, { recursive: true })`; events are debounced (300 ms) and emitted as `procs.events.emit({ event: { type: "openspec.changed", key } })` where `key` is a short hash of the dir (no paths on the wire). Each snapshot request touches the watcher; a watcher idle for 10 minutes without snapshot requests is closed. If `.mauzcode/openspec` is missing, the parent `.mauzcode` is watched so initialization is noticed. Alternative: polling mtimes — simpler but wasteful; kept only as fallback if `fs.watch` throws.
6. **Client.** `ui/index.tsx` exports `{ id: "openspec", canvasKinds: [{ kind: "openspec.workspace" }], canvasLaunchers: [{ id: "openspec", title: "OpenSpec" }] }`. The tab stores `{ section, selected, doc }` in Canvas item state. `useLiveSubscription({ name: "openspec-workspace", types: ["openspec.changed"], onEvent, resync, onError })` refetches snapshot and the open doc when `event.key` matches the snapshot's key. Styles are a scoped CSS string using host theme tokens (CSS variables, `color-scheme`) with `backdrop-filter` on the top bar, `@container` query for the single-column breakpoint (~640px), `:focus-visible` rings, and `@media (prefers-reduced-motion: reduce)` disabling transitions. Segmented control is a `role="tablist"` with roving tabindex and arrow keys; lists are `role="listbox"`/`option` with arrow navigation; progress uses `role="progressbar"` with `aria-valuenow/max`; validation status uses `role="status"`.

## Risks / Trade-offs

- [`fs.watch` recursive behavior differs by platform/Bun version] → debounce, fallback to 2 s mtime polling on error, and the manual refresh via resync.
- [Large Markdown files] → cap document size (1 MB) and return an error state above it.
- [Validation can be slow] → disable the button while running, 60 s timeout from `openspec.run`.
- [Broadcast events reach all tabs] → payload carries only an opaque key; clients ignore foreign keys.

## Migration Plan

Additive plugin change; no data migration. Rollback is reverting the plugin files; existing `openspec.run` behavior is unchanged.
