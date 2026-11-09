# UI architecture

## Current shell and migration boundary

The primary UI is the React/Vite frontend in `frontend/` (`LiveApp.tsx`), served at `/`. `/old-ui` is no longer an alternate application: its supported GET/HEAD root and agent links redirect to `/` with validated query state; other methods are rejected and unknown paths return 404. See `src/legacyUi/handle.ts`.

This does **not** mean all server-rendered UI has been removed. Shared SSR renderers, route assets, Canvas content renderers and inline approval surfaces still have compatibility consumers. React Canvas now reads tab metadata from `/canvas/:id/state` and displays `/canvas/:id/item/:itemId/document`; it no longer reads the `/mobile` shell DOM or embeds `ui.layout`. The item document still uses existing kind renderers and compatibility assets, with nested HTML/URL sandboxing intact. Do not delete these shared renderers or claim every kind is native React.

`SecureInputHost` reads metadata from owner-only `/input/compat?agentId=…`. On explicit opening, supported secure kinds use the original card transports inside an isolated document; Redmine approval opens a separate top-level page, preserving its confirmation authority. No approval is inferred from generic form submission. Native React choice/confirm remain separate.

Postgres is authoritative. React owns presentation state; HTTP endpoints own access checks and durable changes. SSE carries invalidation hints, followed by canonical authorized reads, not a second domain-state store.

## Residual compatibility consumers

| Consumer | Live path / responsibility |
| --- | --- |
| HTTP SSR responses | `procs.http.toResponse` dynamically resolves `ui.layout` (with framework fallback) for HTTP strings and `{ main }` responses. Static `ctx.fns` call graphs alone do not prove the layout is unused. |
| People and SSR pages | `/auth/users`, `sidebar.draft`, and built-in/plugin SSR pages still use shared rendering and assets. React navigation does not make these endpoints obsolete. |
| Canvas item documents | `canvas.itemDocument` invokes `kind.render` and assembles compatibility assets for `/canvas/:id/item/:itemId/document`; React owns tabs, not every kind's content. |
| Secure input compatibility | `input.compatView` supplies owner-only metadata; isolated cards retain their secure transports. Redmine approval uses a separate top-level page; generic submit is never approval authority. |

The dead `legacyUi.rewriteResponse` and `legacyUi.navigationUrl` helpers were removed. This is not removal of the shared SSR pipeline. SSH settings opens the native `llm-connections` tab through a host callback, not a `/llms` link. Treat legacy navigation-asset cleanup separately from these live consumers.

## Public React extension contract

`frontend/src/sdk/index.ts` is the public `@hyper/ui` v1 entry. This is a local Vite alias, **not** a published npm package or remote module loader. Read the actual entry and `frontend/src/extensions/{types,registry,installed}.ts`, `ExtensionHost.tsx`, and `frontend/src/ui-plugins/sdk-example.tsx` before extending it.

`extensions/installed.ts` has no SDK demonstration installed in production. `ui-plugins/sdk-example.tsx` remains a dev/test fixture, registered explicitly in the separate registry in `extensions/example.test.tsx`; its presence is not production navigation or action registration.

- Import UI primitives, API/live helpers and public types from `@hyper/ui`; use React from the host. Vite deduplicates React and React DOM. Do not bundle another React runtime, deep-import `@hyper/ui/*`, or import private host components. The Vite boundary restricts modules under `ui-plugins/` to React and the public entry.
- Export a `UiExtension` with a valid unique `id` and `apiVersion: 1`. It can declare `pages`, `navigation`, `panels`, and `actions`.
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

Existing SSR consumers may still use `ui.layout`, `#main`, `ui.live`, `$script_*.js`, and the shared `app-popup` dialog. These are not the primary extension contract. In these consumers keep navigation attributes off containers whose descendants own refreshes; self-refreshing fragments target themselves.

Existing `hx-popup="module.function"` triggers with optional `hx-popup-params` use the popup-RPC HTMX extension and `POST /rpc`. Popup functions return `ui.popupContent({ title, kind, html })`; an empty successful response closes the dialog. Preserve that contract where used, including confirmation/authentication flows, rather than mixing manual fetch/swaps into it. New React extensions use SDK components and authorized APIs, not popup RPC by default.
