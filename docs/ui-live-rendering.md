# UI rendering and live updates

## Primary React UI

`frontend/src/LiveApp.tsx` owns the primary shell. New trusted extensions use `@mauzcode/ui`, not HTMX fragments or global DOM controllers. See [ui-architecture.md](ui-architecture.md) for registration and security boundaries.

1. Fetch canonical endpoint data on mount. Events are invalidation hints; never treat them as a complete state snapshot.
2. Use `subscribeLive` or `useLiveSubscription` from `@mauzcode/ui`. Supply `name`, optional event `types`, `onEvent`, **`resync` and `onError`**. Re-read authoritative data after reconnect/resume or recovery, and expose load failures rather than silently keeping stale data.
3. Return subscription cleanup from the owning effect and abort pending requests. Ignore stale responses after unmount or selection changes. The helper also supports cleanup while the transport script is still loading.
4. Declare required transport topics with `data-live-topic` on mounted content. `types` alone does not add topics. Keep topics narrow, such as `agents` or `agent:<id>`.
5. Use `requestJson` for JSON reads/writes. Writes need the existing cookie-bound CSRF token and server authorization; frontend grants are not authorization.

One shared topic-filtered SSE connection serves a tab. Over HTTP/2 hidden tabs can keep it open; over HTTP/1.1 hidden tabs release the connection and resync on return. Read [live-updates.md](live-updates.md) for gap recovery. Reads must not publish invalidations or create refresh loops. Do not add one-second polling as a substitute for publishing the relevant topic after a write.

## Compatibility: server-rendered regions

Shared SSR still serves compatibility surfaces, including inline approvals and Canvas content consumers. `/old-ui` redirects; that retired entry point is not proof that shared renderers and assets can be deleted.

Concrete consumers are mapped in [ui-architecture.md](ui-architecture.md#residual-compatibility-consumers): dynamic HTTP `ui.layout` dispatch, People `/auth/users`, `sidebar.draft`, built-in/plugin SSR pages, Canvas `kind.render` with assets, and secure input transports. Removing dead `legacyUi.rewriteResponse`/`navigationUrl` helpers does not retire these renderers. The SDK example is a dev/test fixture with its own test registry, not a production-mounted subscription consumer.

Where a server-rendered consumer still uses `ui.live`, it declares a canonical fragment URL, `data-live-topic`, and `hx-trigger="mauzcode-live from:body"` plus a watchdog. The shared client coalesces notifications and asks matching regions to fetch current markup through HTMX. Preserve region-local targets and swap modes. This is a compatibility contract, not the default for new extensions.

The older chat renderer/controller (`agent/chat.js`, `#chat-panel`, `#msg-head`, `#msg-tail`) has its own disposable lifecycle, offset-based paging, lazy tool-detail popup and scroll anchoring. Its HTMX cleanup/mount hooks and watchdogs apply only to consumers still using that renderer. Do not attach that controller to React-owned DOM or describe its markup as the primary chat contract.

## Verification

- Run focused SDK API/live and extension-registry tests plus frontend typecheck/build checks.
- Check navigation and repeated mounts/unmounts, error and pending states, and no duplicate subscriptions.
- Test disconnect/reconnect, server restart, and hidden/visible tabs: all state consumers must refetch after a gap.
- Test keyboard navigation, focus restoration, light/dark themes and reduced motion.
- For changed SSR consumers, also run their route/live-region/controller tests and verify served assets.
- Preserve ownership, authentication, CSRF and explicit confirmation tests for approvals; a React migration must not weaken them.
