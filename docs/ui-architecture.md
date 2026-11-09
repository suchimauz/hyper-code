# UI architecture

## Current shell and migration boundary

The primary UI is the React/Vite frontend in `frontend/` (`LiveApp.tsx`), served at `/`. `/old-ui` is no longer an alternate application: its supported GET/HEAD root and agent links redirect to `/` with validated query state; other methods are rejected and unknown paths return 404. See `src/legacyUi/handle.ts`.

The former navigation/dock/chat shell in `ui.layout` is removed, not renamed. The function remains a small **document renderer** because `procs.http.toResponse` resolves it dynamically for strings and `{main}` responses. It supplies page-local styles, HTMX, CSRF and live updates, not a second application shell. React's Applications page (`?view=applications`) reads explicitly registered `nav.items` destinations. Its host-owned native destination map opens migrated pages in React; unmatched destinations can still open necessary built-in/plugin documents. They are trusted same-origin server documents, not remote extensions or Canvas HTML sandbox content.

People is a native React page (`?view=people`); `/auth/users` negotiates JSON and redirects HTML visits. Sidebar draft is a native React composer (`?sidebarDraft=<binding>`), retaining the existing atomic first-message claim and owner/origin/CSRF checks. No agent is created merely by opening the composer.

React Canvas owns tabs/state, native text-file editing and directory browsing, and host-reviewed plugin `canvasKinds`. Files too large or unsuitable for text editing and plugin kinds without a registered React view still use `canvas.itemDocument` and their existing kind renderers. HTML/URL sandbox nesting is preserved. Do not claim every plugin renderer is native React, and do not remove the item-document or secure-input transports.

`SecureInputHost` reads metadata from owner-only `/input/compat?agentId=…`. On explicit opening, supported secure kinds use the original card transports inside an isolated document; Redmine approval opens a separate top-level page, preserving its confirmation authority. No approval is inferred from generic form submission. Native React choice/confirm remain separate.

Postgres is authoritative. React owns presentation state; HTTP endpoints own access checks and durable changes. SSE carries invalidation hints, followed by canonical authorized reads, not a second domain-state store.

## Removed surfaces and native replacements

- Projects no longer has `renderPage`, `pages.js`, or the page-only reorder stylesheet. `/projects/view` and `/projects/archive` redirect into the existing React workspace filter; `workspaceProject` and `workspaceFilter` preserve deep links. Project reads do not mutate the stored active tab.
- Old inspector/meta fragments, `agentMetaSection`, `agentMetaSectionHtml`, `agentSettingsBlocks`, `parkedCard`, `planTaskRow`, and `meta.js` are removed. The native Meta panel reads an owner-authorized JSON snapshot, edits status injection/context thresholds, and uses the existing Goal CAS endpoint. Plan display is read-only: the old plan write also wakes an agent and is not a harmless settings update.
- The old chat header/lazy panel renderer chain and `/chat/:id/panel` are removed. Domain actions remain. The historical chat-card/badge/button registry and its declarations are removed. Ordinary user, peer, command and planning events use structured native fields; historical event HTML is retained as data, not rewritten.
- `/canvas/:id/panel` and `panelHtml` are removed. The mobile endpoint is an authorized redirect to React, not a second Canvas shell. `canvas.js` retains item-document refresh/navigation and sandbox bridges, not tab/split-pane UI.
- Tasks list/detail/create/status/start are native React with owner-only JSON and cookie-bound CSRF. `/tasks` and task detail HTML visits redirect to `/?view=extension:tasks/overview`; GET never starts an agent. Global extension pages do not inherit the selected chat's archived/read-only state; server authorization remains authoritative.
- `/search` and `/functions` negotiate authorized JSON or redirect to native documentation pages. Transcript search retains BM25 and agent filters; function documentation retains schemas and source locations.
- `/sshInstance` and `/llms` redirect into native Settings. `settings=ssh-instances|llm-connections` opens the appropriate dialog. LLM policy, coding-instance, MiniMax and node add/edit/refresh controls are JSON-backed. `NodeSettings` also provides reviewed client-token issuance/revocation and transient display of newly issued credentials; this does not imply every retained account transport is removed.
- Settings overview/declared settings, shared agents, control-plane instances, Knowledge, News/RSS, Hacker News/Substack/Inbox readers, Calendar/Architecture, Whisper, Telemetry/Flow gaps, Autotext/Update and Telegram have native extension pages. See `extensions/installed.ts` for the actual host grants, rather than treating these as remaining Applications HTML pages.
- Login/setup use the separate React auth entry (`auth.reactDocument` and `/auth/ui.js`, `/auth/ui.css`) with public presentation JSON. Existing password/OIDC/Google/setup endpoints retain their server-side session and redirect responsibilities; React presentation does not replace authentication.
- Files has a native `FilesPage` and JSON browser/edit contracts, including host selection and conflict-aware text saves. Browser-native/raw rich previews remain distinct from text editing and must preserve their active-content sandbox.
- Source messages use an ownership-checked JSON reader; legacy message URLs redirect to the granted `agent-source/overview` page. New-session links preserve advanced title/workspace/preset/system-instruction fields in the native composer; opening it does not create a session.
- Plugin source inventory, provider filtering, declared configuration and reviewed update/rollback are native `PluginsPage` controls. The old plugin catalog/configuration renderers and cron panel are removed. Source inventory does not itself mount or install a plugin.
- Calendar, architecture map/turbulence, test reports and icons use granted native Canvas kinds. Browser live uses a native page with explicit connection and remote-control opt-in. Backend authorization and cookie-bound CSRF remain required independently of frontend grants.
- Global extension write capability comes from the server's `/auth/session` `canManage` field, including supported open/legacy modes; archive-aware chat panels keep their own read-only state.
- Google/Humanizer `SKILL.md` endpoints serve original Markdown with `nosniff`, not an HTML page.

### Residual boundary (not claimed removed)

Native page replacement is not proof that every HTML producer or compatibility route is dead. Canvas kinds without a granted React renderer still use `itemDocument`; file/media previews, user HTML/URL documents, protected input cards and separately mounted user-plugin documents remain. Framework module skill pages and small compatibility fragments also still produce HTML. Retained producers require consumer-by-consumer review before deletion, not a blanket removal of SSR or HTMX. OAuth callbacks and Redmine's independent approval authority must not be discarded as shell leftovers. Sber/TBank are outside this migration. Source-only optional plugins are not evidence that those plugins are mounted in this instance.

Third-wave source also supplies native lifecycle receipts, Push settings, People presence, initial-prompt inspection, project-icon editing and transient `SecureInputDialog`. Mentions widgets consume `mentions.rowsData`, not the removed HTML alias. Native human author attribution and transient-dialog lifecycle coverage are now implemented. The third-wave production build and 584 frontend tests across 115 files pass; focused backend verification is documented separately in `ui-migration-verification.md`, not claimed as a whole-backend green run. Transient `/secureInput/current` and `/secureInput/submit` are distinct from the protected `input.compatView` card/Redmine transports described above.

## Remaining HTML consumers

| Consumer | Live path / responsibility |
| --- | --- |
| HTTP SSR responses | `procs.http.toResponse` dynamically resolves `ui.layout` (with framework fallback) for HTTP strings and `{ main }` responses. Static `ctx.fns` call graphs alone do not prove the layout is unused. |
| React People and draft | `/auth/users` and `sidebar.draft` retain their authorized JSON/write contracts; HTML visits redirect to React. They no longer render the old page/composer shell. |
| Application documents | `/nav/items` with JSON Accept lists declared destinations without chats. `ApplicationPages.nativePages` maps migrated destinations to granted React pages; unmatched destinations retain the document fallback. Each endpoint still enforces its own authorization. A backend plugin installation is not a frontend grant. |
| Auth documents and callbacks | Login/setup return the dedicated React mount document through `auth.reactDocument`, not the old shell. OAuth callbacks remain server transports. `/auth/online` is owner-only JSON (`onlineIds` only, active accounts); HTML visits redirect to native People. People subscribes to presence with reconnect resync and abort/unsubscribe cleanup. The orphan avatar HTML/live-region helpers are removed. |
| Framework and compatibility fragments | `procs/modules/$route_skill_GET.ts` still returns `{ main }`; project-not-found responses can do so too. Input cards/parts and remaining directory-picker/status fragments retain HTML producers. Push preferences now use native `PushSettingsPanel` and JSON contracts; the old settings HTML renderer is removed. The obsolete mentions/gap badge routes, shell dock declarations and their orphan scripts are removed. Their existence is not a second shell, nor proof that every old caller still exists. |
| Canvas item documents | Native file and granted React `canvasKinds` views take precedence. `canvas.itemDocument` still invokes `kind.render` for remaining kinds/previews, preserving their assets and nested HTML/URL sandboxes. |
| Event and Flow compatibility | Ordinary event producers no longer generate chat cards. `renderEventHtml` is now an input-only adapter to `input.card`; ordinary branches and `ui.chatEventCard` are removed. Busy-tool and lifecycle receipts use native structured renderers. Flow submits return structured, idempotently replayable receipts; old stored HTML receipts remain inert compatibility data. |
| Secure input compatibility | `input.compatView` supplies owner-only metadata; isolated cards retain their secure transports. Redmine approval uses a separate top-level page; generic submit is never approval authority. |

The dead `legacyUi.rewriteResponse` and `legacyUi.navigationUrl` helpers were removed. This is not removal of the shared SSR pipeline. SSH settings opens the native `llm-connections` tab through a host callback, not a `/llms` link. Treat legacy navigation-asset cleanup separately from these live consumers.

## Migration verification checkpoint

The second-wave checkpoint passed the frontend production build and 518 tests in 104 files. Focused backend verification includes 206 isolated route/security tests, 95 agent/source/code tests with a cold-start allowance, and 13 Files/privacy tests after fixing private-result symlink aliases in directory listings. These are bounded selections, not a claim that the entire backend suite is green. Cold test-context startup on this host took roughly 97 seconds; five-second timeouts were not sufficient evidence of a regression.

Read-only browser checks covered the native Files Markdown view, source-message redirect/reader, advanced new-session fields, plugin source inventory and disconnected Browser Live controls, alongside the settings/readers/architecture pages. No real sends, source installation, remote-control actions, medication writes or configuration changes were used for verification. Telemetry still reports the missing local DuckDB executable. The graph audit still reports eight unresolved calls in unrelated private integrations; it is not globally green.

At that second-wave checkpoint, presence, web-push preferences, `tool_busy` and remaining fragments still required migration. The third-wave replacements and retained protected transports are described above; the historical checkpoint alone was not completion evidence. The tracked workspace-local Flow medication declaration now returns structured receipts; its external health-data capability was not exercised outside mocks. The committed receipt contract preserves opaque legacy outputs.

## Public React extension contract

`frontend/src/sdk/index.ts` is the public `@hyper/ui` v1 entry. This is a local Vite alias, **not** a published npm package or remote module loader. Read the actual entry and `frontend/src/extensions/{types,registry,installed}.ts`, `ExtensionHost.tsx`, and `frontend/src/ui-plugins/sdk-example.tsx` before extending it.

`extensions/installed.ts` is the authoritative production allowlist. Alongside Tasks, documentation and the agent Meta panel, it grants Settings, shared agents, instances, readers, News/RSS, visualizations, Whisper, Knowledge, operations, utilities, Telegram, agent-source and browser-live pages. Native Canvas grants currently cover `gcal.calendar`, `architectureMap.map`, `architectureMap.turbulence`, `code.tests` and `icons.browser`. These grants do not cover every plugin renderer or every backend capability. It has no SDK demonstration installed in production. `ui-plugins/sdk-example.tsx` remains a dev/test fixture, registered explicitly in the separate registry in `extensions/example.test.tsx`; its presence is not production navigation or action registration.

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

## Compatibility only: SSR and HTMX; generic RPC retired

Necessary server documents still use the minimal `ui.layout`, `#main`, `ui.live`, and page-specific `$script_*.js`. The old application shell, global nav menu, mobile inspector/message/usage shell scripts, navigation preload and press-feedback shell assets are removed. Retained page transports are not the primary extension contract. In these consumers keep navigation attributes off containers whose descendants own refreshes; self-refreshing fragments target themselves.

Generic browser popup RPC is retired. `POST /rpc` is an unconditional 410 tombstone: it neither reads the payload nor resolves a runtime function. Generic popup/inplace helpers, host and browser scripts are removed. Native React capability endpoints replace ordinary controls; transient secureInput uses its owner/CSRF-protected Request-only routes. `input.compatView` and Redmine independent confirmation transports remain unchanged.
