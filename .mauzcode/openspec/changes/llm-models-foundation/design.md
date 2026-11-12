# Design

## Context

See proposal.md (Why). Relevant current state:

- Provider knowledge is a static `PROVIDERS` table plus special cases inside `llm.resolveEndpoint`; `llm.stream` dispatches on `endpoint.api`. Accounts come from `llm.listAccounts` (CLI credential files, OAuth rows, `sshAccount.registry` kv rows). Proxy bindings live in `llm_account_proxies`.
- Reusable building blocks already exist: `secrets.set/get/deleteLocal` (encrypted local store, `secret://` refs), `socksProxy.readSaved` + `socksProxy.request` (HTTPS over SOCKS5, remote DNS, no fallback), `sshProvider.tunnel` (pooled pinned SSH SOCKS tunnel lease), `sshInstance.list` (trusted instances).
- Declarative file kinds are loaded by `$loader_<kind>.ts` files (e.g. `$loader_compaction`, `$loader_input` with mounted-owner checks) and hot-reloaded through `HOT_KINDS` in `procs/repl/load.ts`.
- Plugin UIs are compiled at runtime; their surfaces are gated by `procs.ui` grants (`plugins/uiCompile.ts`, `UiGrants`, `uiManifest`) and registered in `frontend/src/extensions/registry.ts`.

## Goals / Non-Goals

**Goals:**
- One `models` namespace that every future provider (built-in or plugin) goes through for configuration, testing, model discovery, usage and outbound HTTP.
- Plugin authors add a provider with one backend file and, optionally, one UI component.

**Non-Goals:**
- Inference/streaming through new connections, agent model routes, fallback chains, compaction, parking — later changes.
- Migrating Codex, Claude, Kimi, Z.ai, MiniMax, OpenCode, xAI, Asoft LLM Gate or node routes.
- Remote-execution SSH mode (CLI credentials living on the SSH host); a provider may add it later through its own actions.

## Decisions

### D1. New `models` namespace, not an extension of `llm`/`llms`
`llm` is the live inference path and must stay untouched. A separate namespace makes the "build beside, switch later" rule enforceable and reviewable (no diff in `src/llm`, `src/llms`). Alternative — sub-folder inside `llm` — rejected: one namespace per directory in this runtime, and reloads of `llm` would touch live inference.

### D2. Declarative `$modelProvider_<id>.ts` kind
Each file default-exports a `types.models.ProviderDefinition`. `models/$loader_modelProvider.ts` registers into `ctx.state.models.providers[id]` recording the mounted owner, using the same owner resolution as `$loader_input` (entry root must be a mounted module/plugin; core ids `custom` protected). Added to `HOT_KINDS`. Alternatives: a `models.register()` call at plugin boot (imperative, loses hot reload and ownership metadata); one fn per provider operation (`acme.test`, `acme.usage`) — too many files and no single contract object to validate.

Definition shape (types in `src/models/`):
- `id, label, description?, icon?` (lucide name or data URL)
- `fields: FieldSpec[]` — `{ key, label, type: 'text'|'url'|'select'|'secret'|'number'|'boolean', required?, default?, options?, help?, placeholder? }`
- `transports: ('direct'|'socks'|'ssh-tunnel')[]`
- `test(ctx, conn) → TestResult` (required)
- optional `listModels(ctx, conn) → ModelInfo[]`, `usage(ctx, conn) → UsageReport`, `validate(ctx, config) → void`, `actions: Record<name, { label, run(ctx, conn, input) }>`
- `conn` passed to providers is a `ResolvedConnection`: id, provider, accountName, config, `secret(key)` accessor (lazy decrypt), and `fetch(url, init)` bound to the connection's transport. Providers never see other connections or secret refs.

### D3. Storage
Migration creates `llm_connections(id uuid pk, provider text, account_name text not null, config jsonb, secrets jsonb /* field key → secret ref */, transport jsonb, enabled bool, created_at, updated_at)`. Secrets go to `secret://models/<connection-id>.<field>` via `secrets.set`; removal deletes them via `secrets.deleteLocal`. Config validation is done in core against `fields` (types, required, unknown keys, select options, url shape), then provider `validate`. Alternatives: kv JSON (as `sshAccount.registry`) — no indexes, races; storing keys in config — violates secret handling.

### D4. Transport: `models.fetch`
`models.fetch({ connectionId | transport, url, init, signal, timeoutMs }) → Response`.
- `direct`: global `fetch` with abort + timeout.
- `socks`: `socksProxy.readSaved({id})` → `socksProxy.request`.
- `ssh-tunnel`: `sshProvider.tunnel({instance})` → `socksProxy.request` to `127.0.0.1:<port>`; `release()` in `onDone`.
Proxied transports require https (constraint of `socksProxy.request`). Errors are thrown with `code: 'TRANSPORT'` and never retried directly. Validation at save time checks proxy existence and instance trust (`pinnedHostKey`).

### D5. Status fallback and caching
`models.usage` calls provider `usage` if present; otherwise returns `{ status, reason, checkedAt }` from `models.test`. Results are cached in `ctx.state.models.health` keyed by `Bun.hash(connection id + updated_at)` for 60 s with in-flight de-duplication, like `llm.gatewayHealth`.

### D6. Custom provider as a regular provider file
`src/models/$modelProvider_custom.ts` uses only the public contract (dogfooding the SDK). Protocol helpers live in one `models/customProtocol.ts` function: models endpoint per protocol (`GET {base}/models` for both OpenAI protocols, `GET {base}/v1/models` for Anthropic when base lacks `/v1`, `GET {base}/v1beta/models` for Gemini) and minimal generation (`max_tokens: 1`-style) request. Old `llm.stream*` are not reused, to keep `llm` untouched and because they are bound to agent objects.

### D7. HTTP API
`src/models/$route_api_GET.ts` / `$route_api_POST.ts` delegating to `models.api({ req })`, modelled on `frontendBridge.llmConnections`: owner check, same-origin, cookie-bound CSRF, JSON, 64 KiB limit. Actions: `providers`, `list`, `create`, `update`, `remove`, `test`, `models`, `usage`, `action`. Responses are secret-free (`secrets: { apiKey: true }`).

### D8. UI slot `modelProviders`
- Backend: `plugins/uiCompile.ts` accepts `procs.ui.modelProviders: string[]`; `UiGrants` and `uiManifest` comparison include it (absent in older approvals → empty).
- Frontend: `UiExtension.modelProviders?: { provider, component }[]`, component props `{ context, provider, connection?: ConnectionView, onSaved, onCancel }`; registry checks grant + duplicates; SDK exports the types.
- `frontend/src/components/settings/ModelsPanel.tsx` + `frontend/src/lib/models.ts`; tab `{ id: 'models', label: 'Models', icon: Boxes }` added to `SETTINGS_TABS`. Shared `UsageView` renders `UsageReport`. Follows existing settings CSS tokens and Apple Design guidance.

## Risks / Trade-offs

- [Two parallel connection systems confuse users until the switch] → "Models" tab note that it does not yet affect agents.
- [Plugin provider code runs in-process with full ctx] → same trust model as other plugins; ownership prevents overriding, approval gates UI only. Documented.
- [Generation test costs tokens] → only when a test model is set; minimal output tokens.
- [`socksProxy.request` requires https] → custom http endpoints allowed only with `direct` transport; validated at save.
- [Contract may need changes when migrating real providers] → keep optional members additive; document as v0.

## Migration Plan

Additive only: new table via migration (down drops it and deletes `secret://models/*` refs created by it), new files, new tab. Rollback = revert files and run migration down. No data migration from existing accounts.
