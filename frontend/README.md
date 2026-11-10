# MauzCode frontend

The primary React interface for MauzCode, maintained in the same repository and using the existing authenticated APIs. Supported `/old-ui/` entry links redirect to `/`; it is not a second application.

## Run

From the repository root:

```sh
bun install
bun run start                  # MauzCode starts Vite automatically
bun run frontend:storybook     # optional component playground
bun run frontend:test
bun run frontend:build         # optional typecheck and bundle verification
STORYBOOK_DISABLE_TELEMETRY=1 bun run frontend:build-storybook
```

Open `/` or `/?agent=<id>` on your normal signed-in MauzCode origin. Vite runs inside MauzCode on internal loopback port 5174, and HTTP/HMR are proxied by the integrated `src/frontendBridge/` module. No separate frontend process or private plugin is required. Source edits use Fast Refresh immediately. Do not expose Vite publicly or run `frontend:dev` alongside MauzCode.

`/?demo` opens the mock playground. `/ui-lab/` remains the internal asset/HMR base and a compatibility URL. Direct port 5174 has no cross-origin API proxy or credentials.

## Commands and planning

The live composer loads slash suggestions from `GET /commands`. Type `/`, choose with arrows/Enter, Tab or a pointer, then submit explicitly. Escape closes suggestions. A failed catalogue request or unknown command never falls back to a model prompt; rejected submissions keep the draft and attachments.

- `/plan` enters planning without starting a model turn; `/plan <task>` enters and submits the task; `/plan off` leaves without approving or executing a proposal.
- Mode belongs to one session and comes from `GET /agent/:id/planning`. It is separate from MauzCode's existing task checklist. The UI refreshes after commands, focus/run changes and every eight seconds while visible.
- A pending plan is rendered as Markdown with **Начать реализацию** and **Продолжить обсуждение**. Decisions use `POST /agent/:id/planning/review` with the exact proposal ID, revision and CSRF token; chat text is not approval.
- This is **advisory planning, not a sandbox**: instructions do not technically prohibit tool mutations. Mode changes and review decisions require an idle agent; stop a running agent first. Slash commands currently reject attachments.
- The first message in a new session supports the same commands through the existing creation/acceptance pipeline. No separate agent runtime is introduced. Other native approval/secret cards remain outside this integration.


## Integration

- List: `GET /api/v1/agents`.
- History and partial response: `GET /api/v1/agents/:id/events?limit=80`, older pages via `before`.
- Send: existing `POST /agent/:id`, FormData, JSON response and stable idempotency key. Failed submissions preserve draft/key in sessionStorage for an identical retry, including after page reload. No automatic send retries.
- Stop: `POST /api/v1/agents/:id/stop`.
- Live: existing `/procs/events/client.js` + `mauzCodeLive.subscribe` with reconnect resync; 2.5-second visible-page refresh fallback also reads partial responses (15 seconds while hidden). List refreshes every 15 seconds.
- Authentication and agent visibility follow existing MauzCode API policies, not a new ACL. Send requests stay on the authenticated same origin.
- Secure inputs: `SecureInputHost` reads owner-only `/input/compat` metadata. Supported cards retain their original secure transports in isolated documents; Redmine approval opens a separate top-level page. Generic submit and chat text never confer approval.
- Canvas: React owns tabs via `/canvas/:id/state` and hosts `/canvas/:id/item/:itemId/document`, not the `/mobile` shell. `canvas.itemDocument` retains kind renderers and compatibility assets, including nested HTML/URL sandboxing; this is not a migration of every kind to native React.
- No REPL endpoint, API key or database credential is exposed to this frontend.

## Component layers

- `src/styles/tokens.css`: Medeo Sans/Mono pinned to MauzCode's version; semantic themes, spacing, typography, radii, control sizes and reduced motion.
- `src/components/ui`: domain-independent controls.
- `src/components/layout`: AppShell, Sidebar, Toolbar, controlled SplitPane, accessible Base UI Sheet.
- `src/components/mauzcode`: reusable agent rows, demo Composer, live transport-aware Composer and safe Transcript.
- `src/lib`: typed HTTP and existing live transport adapter.
- `src/hooks/useMauzCode.ts`: read lifecycle, race cancellation, history paging, invalidation and resync.
- `src/LiveApp.tsx`: working server composition. `src/App.tsx`: isolated mock playground.
- `*.stories.tsx`: component catalogue with theme selection. Use a narrow viewport to inspect responsive behavior.

Desktop: sidebar, chat, optional real Canvas on the right. dsh-style 38px tab strip, 28px tabs and a 1px divider; width persists locally, independently of the legacy API's chatWidth. Below 1000px: Chat/Canvas views, modal agent navigation. Divider supports pointer input, arrow keys, Home and End. Base UI owns Sheet focus management and Escape behavior.

## Live workspace navigation

`WorkspaceSidebar` uses the current dsh shell measurements (280px expanded, 56px compact rail, 28px desktop rows), with existing MauzCode tokens and a fresh React implementation. The top field filters agents and projects locally. Cmd+/ (Ctrl+/) focuses it and selects the current query; compact navigation expands, and mobile navigation opens its sheet. There is no separate Search button or global search menu. Compact state and workspace disclosure persist locally.

Navigation and search use the authenticated integrated `/ui-lab-api/navigation` and `/ui-lab-api/search?q=&tab=` adapters. Project identity includes host. The profile uses `/auth/session`; People links to the live SSR `/auth/users` page for owners, and Sign out remains an explicit native POST form to `/auth/logout`. HTML-only plugin pages retain their own SSR routes. SSH settings opens the native `llm-connections` tab through a host callback instead of linking to `/llms`.


## Attachments

Existing and new chats accept files through the picker, clipboard paste, or drag & drop anywhere in the chat panel. Files stay local until Send. Ordered draft thumbnails and file cards match dsh; saved messages use the authenticated MauzCode attachment endpoint, with an in-chat image viewer (Escape/backdrop to close). SVG/HTML are not rendered as image previews. Limits follow native MauzCode: 10 files, 40 MiB each, 80 MiB total.

First-message uploads use the owner/CSRF-protected bridge and native message acceptance with a durable request key. Uncertain retries retain the exact file snapshot in memory; after a reload, missing files block retry rather than silently submitting only text. Review the created chat in navigation in that case.

## Design rules

Apple-inspired hierarchy and restraint with Medeo typography, semantic colors, subtle borders, immediate pressed feedback and visible focus. Compact desktop controls; 44px controls on narrow/coarse-pointer screens. All motion respects reduced motion; never make a gesture the only way to perform an action. Use shared tokens and add new states to Storybook. Custom CSS is the initial styling layer; Tailwind/shadcn generation and Motion are not installed yet.

Do not let HTMX and React own the same DOM subtree. The primary shell is React, but compatibility consumers remain: `procs.http.toResponse` dynamically resolves `ui.layout` for HTTP strings/`{ main }`, People `/auth/users`, `sidebar.draft` and built-in/plugin SSR pages remain live, as do Canvas kind renderers/assets and secure input transports. Removed dead `legacyUi.rewriteResponse`/`navigationUrl` helpers do not imply complete legacy removal. See the [residual consumer map](../docs/ui-architecture.md#residual-compatibility-consumers).

Trusted extensions use the public `@mauzcode/ui` entry and explicit grants: built-ins in `src/core-ui/` + `src/extensions/installed.ts`, plugin UIs in `plugins/<name>/ui/` loaded at runtime via `src/extensions/pluginRuntime.ts`. The SDK example in `src/test/fixtures/sdk-example.tsx` is retained as a dev/test fixture with a separate registry in `src/extensions/example.test.tsx`; it is absent from production `src/extensions/installed.ts`. Frontend grants never replace backend authentication, ownership, CSRF or explicit human approval.
