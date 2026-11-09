# UI architecture

## Current shell and migration boundary

The primary UI is the React/Vite frontend in `frontend/` (`LiveApp.tsx`), served at `/`. `/old-ui` is no longer an alternate application: its supported GET/HEAD root and agent links redirect to `/` with validated query state; other methods are rejected and unknown paths return 404. See `src/legacyUi/handle.ts`.

The former navigation/dock/chat shell in `ui.layout` is removed, not renamed. The function remains a small **document renderer** because `procs.http.toResponse` resolves it dynamically for strings and `{main}` responses. It supplies page-local styles, HTMX, CSRF, live updates and popup RPC, not a second application shell. Required built-in/plugin documents remain accessible from React's Applications page (`?view=applications`), using only explicitly registered `nav.items` destinations. They are trusted same-origin server documents, not remote extensions or Canvas HTML sandbox content.

People is a native React page (`?view=people`); `/auth/users` negotiates JSON and redirects HTML visits. Sidebar draft is a native React composer (`?sidebarDraft=<binding>`), retaining the existing atomic first-message claim and owner/origin/CSRF checks. No agent is created merely by opening the composer.

React Canvas owns tabs/state, native text-file editing and directory browsing, and host-reviewed plugin `canvasKinds`. Files too large or unsuitable for text editing and plugin kinds without a registered React view still use `canvas.itemDocument` and their existing kind renderers. HTML/URL sandbox nesting is preserved. Do not claim every plugin renderer is native React, and do not remove the item-document or secure-input transports.

`SecureInputHost` reads metadata from owner-only `/input/compat?agentId=…`. On explicit opening, supported secure kinds use the original card transports inside an isolated document; Redmine approval opens a separate top-level page, preserving its confirmation authority. No approval is inferred from generic form submission. Native React choice/confirm remain separate.

Postgres is authoritative. React owns presentation state; HTTP endpoints own access checks and durable changes. SSE carries invalidation hints, followed by canonical authorized reads, not a second domain-state store.

## Removed surfaces and native replacements

- Projects no longer has `renderPage`, `pages.js`, or the page-only reorder stylesheet. `/projects/view` and `/projects/archive` redirect into the existing React workspace filter; `workspaceProject` and `workspaceFilter` preserve deep links. Project reads do not mutate the stored active tab.
- Old inspector/meta fragments, `agentMetaSection`, `agentMetaSectionHtml`, `agentSettingsBlocks`, `parkedCard`, `planTaskRow`, and `meta.js` are removed. The native Meta panel reads an owner-authorized JSON snapshot, edits status injection/context thresholds, and uses the existing Goal CAS endpoint. Plan display is read-only: the old plan write also wakes an agent and is not a harmless settings update.
- The old chat header/lazy panel renderer chain and `/chat/:id/panel` are removed. Domain actions remain. The historical chat-card/badge registry is not a React extension slot; remaining declarations require migration, not new SSR renderers.
- `/canvas/:id/panel` and `panelHtml` are removed. The mobile endpoint is an authorized redirect to React, not a second Canvas shell. `canvas.js` retains item-document refresh/navigation and sandbox bridges, not tab/split-pane UI.
- Tasks list/detail/create/status/start are native React with owner-only JSON and cookie-bound CSRF. `/tasks` and task detail HTML visits redirect to `/?view=extension:tasks/overview`; GET never starts an agent. Global extension pages do not inherit the selected chat's archived/read-only state; server authorization remains authoritative.
- `/search` and `/functions` negotiate authorized JSON or redirect to native documentation pages. Transcript search retains BM25 and agent filters; function documentation retains schemas and source locations.
- `/sshInstance` and `/llms` redirect into native Settings. `settings=ssh-instances|llm-connections` opens the appropriate dialog. LLM policy, coding-instance and MiniMax controls have native JSON-backed controls; node add/edit/token workflows and remaining account fragments still need migration.
- Google/Humanizer `SKILL.md` endpoints serve original Markdown with `nosniff`, not an HTML page.

### Still to migrate (not claimed removed)

Built-in `/settings`, `/settings/declared`, `/controlPlane`, `/shared-agents`, file rich previews and remaining LLM/node fragments still have HTML consumers. Plugin Applications still hosts Knowledge, News/reader, RSS, Hacker News, Substack, Inbox, Calendar, Architecture, Flow gaps, Whisper and Telemetry documents, plus separately mounted user-plugin pages. Canvas plugin kinds without a granted React renderer still use `itemDocument`. These require capability-by-capability native migration before their renderers/assets can be deleted. Shared auth/OAuth pages, secure input documents and Redmine's independent approval authority must not be discarded as shell leftovers. Sber/TBank are outside this migration.

## Remaining HTML consumers

| Consumer | Live path / responsibility |
| --- | --- |
| HTTP SSR responses | `procs.http.toResponse` dynamically resolves `ui.layout` (with framework fallback) for HTTP strings and `{ main }` responses. Static `ctx.fns` call graphs alone do not prove the layout is unused. |
| React People and draft | `/auth/users` and `sidebar.draft` retain their authorized JSON/write contracts; HTML visits redirect to React. They no longer render the old page/composer shell. |
| Application documents | `/nav/items` with JSON Accept lists declared destinations without chats. React `ApplicationPages` hosts necessary built-in/plugin HTML pages; each destination still enforces its own authorization. Disabled banks are not installed or enabled. |
| Canvas item documents | Native file and granted React `canvasKinds` views take precedence. `canvas.itemDocument` still invokes `kind.render` for remaining kinds/previews, preserving their assets and nested HTML/URL sandboxes. |
| Secure input compatibility | `input.compatView` supplies owner-only metadata; isolated cards retain their secure transports. Redmine approval uses a separate top-level page; generic submit is never approval authority. |

The dead `legacyUi.rewriteResponse` and `legacyUi.navigationUrl` helpers were removed. This is not removal of the shared SSR pipeline. SSH settings opens the native `llm-connections` tab through a host callback, not a `/llms` link. Treat legacy navigation-asset cleanup separately from these live consumers.

## Public React extension contract

`frontend/src/sdk/index.ts` is the public `@hyper/ui` v1 entry. This is a local Vite alias, **not** a published npm package or remote module loader. Read the actual entry and `frontend/src/extensions/{types,registry,installed}.ts`, `ExtensionHost.tsx`, and `frontend/src/ui-plugins/sdk-example.tsx` before extending it.

`extensions/installed.ts` explicitly grants Tasks (`tasks/overview`), transcript search and function documentation (`documentation/search`, `documentation/functions`), and the agent Meta panel (`agent-meta/overview`). It has no SDK demonstration installed in production. `ui-plugins/sdk-example.tsx` remains a dev/test fixture, registered explicitly in the separate registry in `extensions/example.test.tsx`; its presence is not production navigation or action registration.

- Import UI primitives, API/live helpers and public types from `@hyper/ui`; use React from the host. Vite deduplicates React and React DOM. Do not bundle another React runtime, deep-import `@hyper/ui/*`, or import private host components. The Vite boundary restricts modules under `ui-plugins/` to React and the public entry.
- Export a `UiExtension` with a valid unique `id` and `apiVersion: 1`. It can declare `pages`, `navigation`, `panels`, `actions`, and `canvasKinds`. Canvas kinds require explicit host grants by kind, receive the authorized item's `args`/`state` and extension context, and must not replace backend authorization. Unregistered kinds retain the document renderer.
- Host code imports reviewed extensions in `extensions/installed.ts` and supplies explicit per-extension grants for page, panel and action IDs. Navigation must reference a declared, granted page. Backend plugin installation does not automatically install browser code.
- The registry validates IDs, duplicate entries, titles and navigation references. The host owns placement and supplies `ExtensionContext`: `agentId`, `theme`, and `readOnly`. Views receive `{ context }`; actions receive the context directly. Mark mutating actions with `mutates` so read-only host controls can disable them.
- `ExtensionHost` provides error containment and pending/error presentation. These are UI safeguards, **not** a security sandbox. Extensions execute as trusted code in the host origin. No remote module URLs, user-supplied HTML-to-module loading, or untrusted extensions.

Frontend grants control exposure only. Every backend endpoint must independently enforce authentication, authorization, ownership, CSRF and any explicit human approval. Hiding an action or setting `readOnly` cannot grant or revoke server access.

## Data, writes and live updates

Use `requestJson<T>` for same-origin JSON requests with safe root-relative paths. Writes require `X-CSRF-Token`: supply the endpoint's cookie-bound token via `csrfToken` (or the supported header); the helper can fall back to `meta[name="csrf-token"]`. Do not invent a token endpoint or fake an Origin header. It rejects redirects, does not retry writes, and reports errors through `ApiError`; handle 401 and 403 explicitly without claiming every 403 is a login failure. The generic type is not runtime response validation.

Use `subscribeLive` or `useLiveSubscription`, with **both** `resync` and `onError`. Refetch authoritative data on events and after stream gaps. Subscriptions reuse the shared transport; dispose them and abort pending requests on unmount. Event types filter delivery, not transport topics: declare the needed `data-live-topic` on the mounted surface. See [live-updates.md](live-updates.md).

## Navigation and presentation

The host owns sidebar entries, selected pages, secondary panels and action slots. An extension does not mutate the shell DOM or assume a `#main` target. Do not promise arbitrary pane placement, URL persistence or global search providers merely because the type supports a page; only the implemented host slots are public today.

Use the SDK's `Button`, `IconButton`, `Sheet`, `Stack`, `Panel`, `TextField` and `Dialog`. Preserve semantic light/dark tokens, visible labels, keyboard focus, focus restoration and reduced-motion behavior. For Hyper UI work first read [Apple Design](skills/apple-design/SKILL.md) and its [scope notes](skills/apple-design/README.md); this preference does not apply to unrelated projects.

## Compatibility only: SSR, HTMX and popup RPC

Necessary server documents still use the minimal `ui.layout`, `#main`, `ui.live`, page-specific `$script_*.js`, and the shared `app-popup` dialog. The old application shell, global nav menu, mobile inspector/message/usage shell scripts, navigation preload and press-feedback shell assets are removed. Retained page transports are not the primary extension contract. In these consumers keep navigation attributes off containers whose descendants own refreshes; self-refreshing fragments target themselves.

Existing `hx-popup="module.function"` triggers with optional `hx-popup-params` use the popup-RPC HTMX extension and `POST /rpc`. Popup functions return `ui.popupContent({ title, kind, html })`; an empty successful response closes the dialog. Preserve that contract where used, including confirmation/authentication flows, rather than mixing manual fetch/swaps into it. New React extensions use SDK components and authorized APIs, not popup RPC by default.
