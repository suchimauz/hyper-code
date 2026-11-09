# Native busy-tool receipt

`acceptMessage` persists `tool_busy` as structured data (runId, name, subject, elapsedSec, timeoutMs); it no longer calls the legacy HTML renderer. The events JSON projection preserves these fields, and React `ToolBusyRow` renders waiting/aborted receipts. The stop button is an explicit click, sends exactly the receipt's run ID through the SDK cookie-bound CSRF transport, disables while pending, and reports errors without automatic retries. Stale run receipts may return 404 and never cancel a different run.

The existing `/agent/:id/tool/:runId/abort` route now independently verifies a current nonlegacy user, cookie CSRF, durable creator ownership and nonarchived target before looking up the exact tool in that agent's live runs. A successful receipt includes `runId`. Mock tests do not abort real tools.

## Remaining renderer boundary

Indexed production callers of `agent.renderEventHtml` are now only `input.request` and `planning.propose`, both for protected input events. `input.card` and Redmine confirmation transports were not modified. Stored `event.html` and model `respondHtml` content were not rewritten or removed.

The third-wave source removes the ordinary `renderEventHtml` branches and `ui.chatEventCard`; only the protected input-card adapter remains. Native `LifecycleRow` and `ToolBusyRow` consume structured event fields instead of generating ordinary transcript HTML. Historical `event.html` and assistant `respondHtml` output remain distinct compatibility data. Author/display parity follow-up (worker elg) and the parent's final checks are still pending; source removal is not a claim of completed visual verification.

Validation: mocked abort route tests (5), native receipt tests (3), frontend TypeScript check, acceptMessage strict runtime-doc/typecheck validation, route-table hot reload. No real abort, send, restart, commit or push.
