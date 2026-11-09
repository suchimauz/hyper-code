# Generic popup/RPC retirement

The generic browser dispatcher is retired. `POST /rpc` is a 410 tombstone, not an active API: no payload parsing, runtime function resolution, or invocation occurs. Authentication middleware may reject requests before they reach the tombstone.

## Replaced consumers

- Model selection, full prompt inspection, project icon editing and ordinary event/tool detail presentation use native React surfaces and capability-specific APIs.
- Widgets return structured data; mentions uses `mentions.rowsData` without a legacy HTML alias.
- The workspace-local `ui.previewFile` override opens native Canvas, resolves local/remote paths and denies legacy RPC access before file resolution.
- Transient `secureInput` prompts use the native SecureInputDialog and narrow Request-only owner/CSRF-protected current/submit routes. The old secureInput renderer is removed.

## Removed transport

Removed `ui.popup`, `ui.popupContent`, popup/RPC browser scripts, obsolete renderer tests, the uncalled `agent.toolDetails` HTML endpoint, and the uncalled workspace-local popup smoke procedure `htmxcheck.run`. Inplace helpers were already absent. Deleted runtime functions are explicitly unloaded and route/script tables rebuilt without restarting.

`ui.layout` remains the dynamic standalone document renderer for `procs.http.toResponse`; it keeps styles, HTMX, live updates, theme/accessibility and CSRF metadata but no popup host or RPC scripts. Canvas item documents likewise retain their security headers, sandbox nesting and HTMX without loading RPC.

## Protected independent consumers

`input.compatView`, existing secure input-card transports and Redmine's separate confirmation authority are not retired. Canvas HTML/URL sandbox behavior and plugin kind documents remain. This removal does not claim all SSR is gone. No external extension consumer was found that justified preserving arbitrary internal runtime dispatch.

## Verification status

Reported intermediate evidence: 550 frontend tests across 111 files before the last deletions, plus 22 mocked RPC tests. Author/display parity follow-up (elg) and parent final checks remain pending. These counts do not certify the final combined worktree. This documentation pass performs no runtime reload, real credential submission or external action.

## Regression checks

The RPC test asserts 410 for former secure and ordinary method names and malformed JSON, with a throwing context proxy proving no runtime lookup and an unread request body. Source guards assert removed helpers/assets stay absent and standalone documents retain HTMX and CSRF metadata. Native secureInput test sources separately target owner/CSRF checks, cancellation and secret-free metadata; the secret-dialog UI test follow-up (eli) is still in progress, not certified complete here. No real secret submission, Redmine action or external write is needed for these mocked tests.
