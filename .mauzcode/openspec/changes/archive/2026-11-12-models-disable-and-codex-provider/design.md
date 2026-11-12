# Design

## Context

The `models` module (change `llm-models-foundation`) stores provider connections in `llm_connections` and resolves each one into a `ResolvedConnection`. That object's `fetch` is bound to the saved transport (direct, SOCKS or SSH tunnel) and has no direct fallback. Inference still goes through `llm.*`. Legacy Codex reads `~/.codex/auth*.json` and needs the `codex` CLI to log in. SSH accounts run the CLI on the instance. A CLI process cannot be forced through our SOCKS proxy, so a proxied login cannot be guaranteed.

The device-code flow was checked against `openai/codex` `codex-rs/login/src/device_code_auth.rs`, `server.rs` and `oauth/client.rs` (commit 672e99f):
- issuer `https://auth.openai.com`, client id `app_EMoamEEZ73f0CkXaXp7hrann`
- `POST {issuer}/api/accounts/deviceauth/usercode` with JSON `{client_id}` → `{device_auth_id, user_code|usercode, interval}`. `interval` is a string of seconds; a 404 means device login is disabled.
- verification URL: `{issuer}/codex/device`
- `POST {issuer}/api/accounts/deviceauth/token` with JSON `{device_auth_id, user_code}`. A 403 or 404 means pending; 15 minutes maximum. Success → `{authorization_code, code_challenge, code_verifier}`.
- `POST {issuer}/oauth/token`, form-encoded: `grant_type=authorization_code, client_id, code, redirect_uri={issuer}/deviceauth/callback, code_verifier` → `{id_token, access_token, refresh_token}`. The CLI never retries this request once it may have reached the server.
- Refresh: `POST {issuer}/oauth/token`, form-encoded: `grant_type=refresh_token, client_id, refresh_token`.
- The account id is the `https://api.openai.com/auth`.`chatgpt_account_id` claim.

## Goals / Non-Goals

**Goals:**
- Per-model disable stored on the connection and enforced on every request through `models.stream`/`models.compact`.
- A Codex provider whose login, refresh, discovery, usage, streaming and compaction all go through `conn.fetch`.
- Owner UI for both.

**Non-Goals:**
- Routing agents through models connections; legacy `llm.modelPolicy` integration.
- Importing existing `~/.codex` accounts; reset credits; running anything on SSH instances.
- Persisting login flows across server restarts.

## Decisions

- **Storage of disabled models**: a `disabled_models TEXT[]` column on `llm_connections`. Changes use `array_append`/`array_remove` in single statements, so concurrent toggles cannot lose updates. A column was chosen over kv rows because the set belongs to the connection and is removed together with it.
- **Enforcement point**: `models.assertModelEnabled` runs a fresh `SELECT` on each call with no cache. `models.stream`/`compact` call it before `resolve`, so a disabled model never reaches provider code. The error shape matches `llm.modelPolicy` (`code`, `retryable:false`, `replaySafe:false`), which lets the worker treat it as final when agents move over later.
- **SDK**: `ProviderDefinition.stream?(ctx, conn, req)` and `compact?(ctx, conn, req)`. The request carries already-built `instructions`, `messages`, wire `tools`, `reasoningEffort`, `sessionId`, `signal` and `onEvent`. The result shape matches `llm.streamCodex` (`text`, `thinking`, `finishReason`, `usage`, `toolCalls`), so agents can switch later without adapters. The loader validates these as optional functions.
- **Codex secret**: one JSON secret `local_secrets(models, "<id>.codex-auth")` with a monotonically increasing `version`. Saves are compare-and-swap on `version` (`UPDATE … WHERE version = ?`). `models.remove` already deletes every `<id>.*` secret. It is not a declared field, so it never appears in forms or `ConnectionView.secrets`.
- **Refresh de-duplication**: an in-memory promise per connection id in `ctx.state.models.codexRefresh`. After a CAS conflict the stored value is re-read. If it is fresh, it is used without another refresh.
- **Login flows**: `ctx.state.models.loginFlows[connectionId]` holds the flow state and an AbortController. Polling runs in a background task that uses a `conn` resolved with a 5-minute per-request timeout. Starting a new login cancels the previous one. Status exposes only `{flowId, status, verificationUri, userCode, expiresAt, message}`.
- **Helpers as runtime functions**: `models.codexAuth` (`read`/`save`/`token`/`clear`) and `models.codexLogin` (`start`/`status`/`cancel`) keep the provider file small and testable. Internal functions take `conn` and use only `conn.fetch`.
- **Login required**: the `loginStatus` action reports `loggedIn`. The `test` operation reports `configured`/`login-required` without contacting the network when no tokens are stored. A 401, or a rejected refresh, clears nothing but marks `needsLogin` in the stored secret.

- **Model cache**: columns `models_cache JSONB` and `models_cached_at BIGINT` on `llm_connections` (migration `20370402120000`). `models.listModels({id, refresh?})` returns the cache without network access; it asks the provider only with `refresh: true` or when nothing is cached. Success replaces the cache, failure keeps it and adds a safe `error`. Writing the cache does not bump `updated_at`, so health caches stay valid. The result carries `cachedAt`.
- **Hourly refresh**: `models/$start` starts a `setInterval` calling `models.refreshAll` every hour (sequential, enabled connections whose provider supports discovery); `models/$stop` clears it; `MODELS_REFRESH=off` disables it. `models` is listed in `procs.prod`. A process timer, not a declared `$cron_` task, because core code must not ship workspace cron declarations.
- **Switch draft**: per-model toggles change a local draft; one Save button sends `setModelEnabled` once per changed model, Reset restores the stored state. No request happens on a click.
- **Reason labels**: the UI maps reason codes (`models-ok`, `unknown-provider`, `login-required`, …) to plain text and keeps the raw code in `title`; unknown codes are shown as-is.
- **Provider logos**: the GET payload of `models.api` adds `providerLogos` (by provider id) produced by `frontendBridge.iconData`, the same inert data-URL marks used by LLM Connections. The `custom` provider gets null and its connections always show a lucide `Plug` icon; the connection's protocol is not used to guess a vendor. Known providers render their mark with `NavigationChatIcon`, others fall back to their declared icon.

## Risks / Trade-offs

- A cached list can lag behind the provider by up to an hour → the owner can press Update models at any time.

- The upstream device-auth endpoints are private and may change → isolated in `codexLogin` and covered by mocked tests; failures produce a clear message.
- Login flows are lost on restart → the user simply starts login again; no secret is written before the exchange succeeds.
- A non-retried exchange can force a fresh login after a network blip → this is intentional, because a consumed authorization code cannot be reused safely.
