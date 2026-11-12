## 1. Types and auth

- [x] 1.1 Extend `models.LoginFlow` with `kind` and optional `authorizationUrl`, make `userCode` optional; update codex login to set `kind: "device-code"`
- [x] 1.0 Extend `models.StreamRequest` with `cacheableMessageCount`, `models.StreamResult.usage` with `cache_write_tokens`, `models.CompactRequest` with `focus` and `maxTokens`; pass them through `models.stream` / `models.compact`
- [x] 1.2 Add `models.claudeAuth` (status, token, store, markLogin, clear) with encrypted per-connection secret, CAS revision, single-flight refresh through `conn.fetch`, expiry minus 5 min, durable refresh-uncertain mark and `OAUTH_OUTCOME_UNKNOWN`
- [x] 1.3 Add `models.claudeLogin` (start, status, submit, cancel) with the legacy OAuth constants, PKCE, best-effort loopback listener, paste fallback, state check, 10-minute expiry and a single exchange through `conn.fetch`

## 2. Provider

- [x] 2.1 Add `src/models/$modelProvider_claude.ts`: metadata, `clientVersion` field and validation, transports, test, actions (login, loginStatus, submitLogin, cancelLogin, logout)
- [x] 2.2 Implement the endpoint allow-list request helper and Claude Code headers (all headers, betas, env overrides, request id)
- [x] 2.2a Port the legacy system prompt placement: identity-only `system` + instructions/ack turns for streaming, two-block `system` for compaction
- [x] 2.2b Implement body rules: max_tokens, thinking/effort mapping, two cache markers, compaction beta on replay
- [x] 2.3 Implement the static model list from code (no network) and usage windows from `/api/oauth/usage` plus plan from `/api/oauth/profile`; record usage from unified rate-limit headers after each response
- [x] 2.4 Implement streaming (text, thinking, tool calls, cache-aware usage, stop mapping, `__unparsed`, error events, missing `message_stop`) and error classification via `llm.classifyError` with login marking on 401/403
- [x] 2.5 Port `llm.compactAnthropic`: betas, max_tokens 32000, focus handoff prompt, block and iteration usage, empty-block error
- [x] 2.6 Run `procs.dev.genTypes`, reload `models`, validate docs of new functions (strict, typecheck)

## 3. UI

- [x] 3.1 Make the login panel flow-aware: authorization link, paste field, submit, safe error, cancel; keep the device-code panel unchanged
- [x] 3.2 Add the Claude logo to the provider logo map
- [x] 3.3 Frontend tests for the authorization-code panel and rejected code

## 4. Tests and checks

- [x] 4.1 Backend tests with a mocked transport: login over SOCKS, loopback callback, busy port falls back to paste, pasted callback URL, state mismatch, expiry, cancel, no repeated exchange, secrecy of status payloads
- [x] 4.2 Tests: concurrent refresh, rejected refresh, unknown refresh outcome not retried, uncertain flag after restart, missing refresh token, logout without network, not-logged-in test without network
- [x] 4.3 Tests: all request headers and env overrides, unique request id, no `x-api-key`, refused destination, system placement for stream and compaction, compaction focus and empty block, thinking cases, cache markers, compaction beta on replay, stream with tool call and cache usage, truncated tool input, error event, cut-off stream, usage and profile, header usage without 0% for missing headers, model list sends no request, usage_limit vs rate_limit_error vs 401
- [x] 4.3a Compare request bodies and headers byte-for-byte with legacy `llm.streamAnthropic` and `llm.compactAnthropic` for the same input (except transport and request id)
- [x] 4.4 Run `code.quality({})`, record unrelated baseline failures, and pass `openspec validate add-claude-provider --strict`.

## Verification notes

- Backend: `bun script/test.ts fast src/models src/ui/modelLogo.test.ts` — 110 passed, 0 failed, 721 assertions.
- Frontend: `bun run frontend:test frontend/src/test/settings-models.test.tsx` — 13 passed; `bunx tsc -b frontend/tsconfig.json` passed.
- Generated types and hot-reloaded models; strict documentation/typecheck validation passed for all changed runtime functions and new Claude procedures.
- OpenSpec strict validation passed. Global `code.quality` still reports the same 8 pre-existing unresolved references in myhealthGaps, skill.circlebackMeetingReady and tunnel.ensure. Full repository TypeScript check also has unrelated existing errors; new Claude files have no scoped errors.
- Manual subscription verification was removed from this change's completion scope at the owner's request; the owner will perform it separately. No live login or external inference was performed.
- Authorization submission action is named `submitLogin`, matching the implemented frontend contract.
