## Why

The models stack now has a provider SDK, per-connection transports and a native Codex provider, but Claude subscriptions (Pro/Max) still live only on the legacy LLM path (`anthropic-oauth`, `claude-code` CLI credentials, SSH accounts). Owners cannot create a Claude connection in the Models tab, route its login and traffic through a saved SOCKS proxy or SSH tunnel, disable its models, or see its usage there. A native built-in `claude` provider closes this gap the same way `codex` did.

## What Changes

- New built-in `claude` model provider for Claude subscriptions:
  - native OAuth authorization-code login with PKCE, implemented over HTTP without the `claude` CLI and without commands on SSH instances; same client, authorize URL, loopback redirect (`localhost:53692`) and scopes as the existing working login; an optional loopback listener completes login automatically, otherwise the owner pastes the callback URL; the token exchange and every later request go through the connection transport (direct, SOCKS proxy or SSH tunnel)
  - encrypted per-connection token storage with single-flight refresh rotation and stale-revision protection; logout without network access
  - a static model list defined in code (the same Claude model ids the legacy subscription path exposes); no models API request
  - rotating refresh with a durable refresh-uncertain mark: an unknown refresh outcome is never retried and requires a new login
  - an https allow-list of Claude endpoints (messages, count_tokens, usage, profile, token URL)
  - usage windows (5-hour and 7-day) and plan from the OAuth usage and profile endpoints, plus usage recorded from unified rate-limit headers of every response
  - Messages API streaming and native server-side compaction with the exact wire contract of the legacy subscription path: Claude Code headers and betas, system prompt placement as in legacy (identity-only `system` for streaming, identity plus instructions blocks for compaction), compaction beta on replay, adaptive thinking/effort rules, two prompt-cache markers, cache-aware token usage, stream failure detection and the same error classification (quota vs. throttling)
- Models tab: the provider login panel becomes flow-aware — besides the device-code flow (Codex) it supports the authorization-code flow (link, paste-code field, live status, cancel). Claude connections show the Anthropic/Claude logo.
- Agents keep using the existing LLM routes. This change does not route agents through models connections and does not migrate or remove legacy `anthropic-oauth` / `claude-code` accounts.
- Out of scope: Anthropic API keys (already covered by the `custom` provider with protocol `anthropic`), importing credentials from the `claude` CLI, and agent routing through models connections.

## Capabilities

### New Capabilities

- `llm-claude-provider`: the built-in Claude subscription provider: native PKCE login through the connection transport, token storage and refresh, static model list, usage, streaming and compaction.

### Modified Capabilities

- `llm-provider-sdk`: the stream request carries the cacheable prefix length, the stream result reports cache write tokens, and the compaction request carries focus and token budget.

- `models-settings-ui`: the provider login panel supports the authorization-code flow with a paste-code field in addition to the device-code flow; Claude connections show their brand logo.

## Impact

- `src/models/`: `$modelProvider_claude.ts` plus helper functions (`claudeAuth`, `claudeLogin`) mirroring `codexAuth` / `codexLogin`; `LoginFlow` gains a flow kind and optional fields for the authorization-code flow; provider actions `login`, `loginStatus`, `submitCode`, `cancelLogin`, `logout`.
- `frontend/src/components/settings/ModelsPanel.tsx`, `frontend/src/lib/models.ts`, the provider logo map, settings CSS and tests.
- Reuses through `ctx.fns`: `llm.anthropicOAuthConstants`, `llm.parseAnthropicAuthorizationInput`, `llm.toAnthropicMessages`, `llm.parseSSE`, `llm.claudeCodeCliVersion`, `llm.classifyError`, `llm.resolveReasoningEffort`. `models.StreamRequest` gains `cacheableMessageCount`, `models.StreamResult.usage` gains `cache_write_tokens`, `models.CompactRequest` gains `focus` and `maxTokens`. `src/llm`, `src/llms`, `sshAccount`, `sshProvider` and legacy Claude accounts are not changed.
- No new dependencies. One secret per connection in the existing encrypted secret store; no new tables.
