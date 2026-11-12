# Proposal

## Why

OpenSpec artifacts live in `<workspace>/.mauzcode/openspec`, so today the person can only follow a change by asking the agent or opening Markdown files one by one. A read-only Canvas view of the workspace's changes, specs and archive makes agreeing a proposal and tracking task progress visible beside the chat, without leaving MauzCode.

## What Changes

- Add a Canvas kind `openspec.workspace` to the official `plugins/openspec` plugin, pinned to the local workspace directory of the agent that opens it.
- Add a Canvas Start-page launcher "OpenSpec" that opens (or switches to) that tab.
- The tab shows:
  - **Changes** — active changes with task progress (completed/total), and for the selected change its artifacts (`proposal.md`, `design.md`, `tasks.md`, spec deltas) rendered as Markdown.
  - **Specs** — current specs under `specs/`, each rendered as Markdown.
  - **Archive** — archived changes with their artifacts, rendered as Markdown.
  - A "Validate" action that runs `openspec validate --all --strict` and shows the per-item result.
- The tab refreshes automatically when files under `.mauzcode/openspec` change.
- Own layout following `docs/skills/apple-design`: translucent top bar, segmented control "Changes / Specs / Archive", list on the left and document on the right, a single column on narrow widths; light and dark themes, keyboard navigation, ARIA semantics and reduced motion.
- Read-only: the only server action besides reading is running validation, which writes nothing.

Out of scope: writing or editing files, ticking tasks from the UI, `archive`/`init`/`new change` from the UI, SSH workspaces.

## Capabilities

### New Capabilities

- `openspec-workspace-viewer`: read-only Canvas presentation of a local workspace's OpenSpec state (changes with progress and artifacts, specs, archive), on-demand strict validation, live refresh on file changes, and its launcher, layout and accessibility contract.

### Modified Capabilities

None.

## Impact

- `plugins/openspec/package.json`: `procs.ui` with `entry`, `canvasKinds: ["openspec.workspace"]`, `canvasLaunchers: ["openspec"]`.
- New server files in `plugins/openspec/src/openspec/`: `$canvas_workspace.ts`, `$route__GET.ts`, `$route__POST.ts`, a request handler, a snapshot/document reader, a file watcher, and tests.
- New `plugins/openspec/ui/index.tsx` (+ styles) using only `react` and `@mauzcode/ui` (`requestJson`, `useLiveSubscription`).
- Reuses existing runtime functions: `canvas.authorizeHttp`, `canvas.show`, `canvas.list`, `auth.verifyCsrf`, `markdown.render`, `agent.sanitizeHtmlBody`, `procs.events.emit`, `openspec.run`.
- No new dependencies, no database migrations. Non-official plugin UI approval does not apply (official plugin), but the bundle is rebuilt at runtime.
