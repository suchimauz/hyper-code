# Tasks

## 1. Canvas kind and tab opening

- [x] 1.1 Add `plugins/openspec/src/openspec/$canvas_workspace.ts` (`prepare` pins `{ dir }` from the agent's local workspace, throws for SSH hosts or non-absolute dirs) and verify with a unit test that a local agent gets `{ dir }` and an SSH agent is refused
- [x] 1.2 Add `procs.ui` (`entry: ui/index.tsx`, `canvasKinds: ["openspec.workspace"]`, `canvasLaunchers: ["openspec"]`) to `plugins/openspec/package.json` and verify the plugin reloads with the grants listed by `plugins.read({ name: "openspec" })`

## 2. Read model

- [x] 2.1 Implement `openspec.snapshot({ dir })` returning initialized flag, watch key, active changes with task progress and artifact ids, specs and archive (newest first); verify with tests on a temp fixture covering progress "3/8", a change without `tasks.md`, a missing `design.md`, two spec deltas, and an uninitialized workspace that is left unchanged
- [x] 2.2 Implement `openspec.document({ dir, id })` mapping opaque ids to files with segment validation and realpath confinement, rendering via `markdown.render` + `agent.sanitizeHtmlBody` with a 1 MB cap; verify with tests for a rendered proposal, `..` and symlink escapes rejected, and a missing document error
- [x] 2.3 Implement `openspec.validateAll({ dir })` running `openspec.run` with `validate --all --strict --json --no-interactive` and normalizing to `{ ok, items }`; verify with tests for a passing fixture and one with a scenario lacking THEN, and that no files change

## 3. HTTP API

- [x] 3.1 Implement `openspec.handle` plus `$route__GET.ts`/`$route__POST.ts`: `canvas.authorizeHttp` on every request, CSRF on POST, POST opens the tab, GET `op=snapshot|doc|validate` resolves `dir` only from an owned open `openspec.workspace` item; verify with tests for unauthorized agent, foreign/unknown item, missing CSRF, and unsupported op

## 4. Live refresh

- [x] 4.1 Implement `openspec.watch({ dir })` (recursive `fs.watch`, 300 ms debounce, `openspec.changed` broadcast with opaque key, idle close after 10 minutes, parent-folder watch when uninitialized, polling fallback) and call it from the snapshot op; verify with a test that writing `tasks.md` emits one debounced event with the key and no path

## 5. React UI

- [x] 5.1 Create `plugins/openspec/ui/index.tsx` and scoped styles: launcher (POST open, SSH error message), translucent top bar, segmented Changes/Specs/Archive, list + document panes, artifact switcher, progress bars, empty/error states, Validate with result panel; verify the plugin UI builds at runtime and the tab renders the current workspace
- [x] 5.2 Wire `useLiveSubscription` (`openspec.changed`, resync, onError) and Canvas item state (`section`, `selected`, `doc`) so selection survives refresh and a removed doc shows "no longer available"; verify by ticking a task on disk and seeing progress update without reload
- [x] 5.3 Implement keyboard and ARIA (tablist with arrow keys and roving tabindex, listbox navigation, progressbar values, `role="status"` for validation, focus-visible), light/dark theme tokens, `@container` single-column layout with back control, and reduced-motion; verify with a frontend test for tablist/listbox keyboard behavior and a manual check in both themes and at narrow width

## 6. Documentation and integration

- [x] 6.1 Update `plugins/openspec/SKILL.md` with the Canvas tab (`canvas.show({ kind: "openspec.workspace" })`, read-only, local-only) and verify `plugins.read({ name: "openspec" })` shows it
- [x] 6.2 Run plugin tests, `code.quality({})` for the plugin files, and `openspec validate add-openspec-canvas-viewer --strict`; verify all pass

## Workflow follow-up

- Archive the change after review once all tasks are checked.
