# Proposal

## Why

LLM access in MauzCode grew provider by provider: endpoints are hard-coded in `llm.resolveEndpoint`, wire protocols are picked by an if-chain in `llm.stream`, and accounts, credentials, quotas, SOCKS proxies and SSH routes are stored and surfaced in different ways (kv rows, CLI credential files, OAuth tables, `sshAccount`). There is no single entry point and no way for a user plugin to add a provider with its own backend logic and settings UI. A unified foundation is needed before existing providers can be migrated to it.

## What Changes

- Add a new `models` core module that owns LLM connections: a provider contract, a provider registry, connection storage, and a single network transport entry point.
- Add a declarative `$modelProvider_<id>.ts` file kind (with its own loader) so core modules, official plugins and user plugins can register providers; ownership rules prevent a plugin from overriding another owner's provider id.
- Store connections in a new `llm_connections` table: UUID identity, provider id, required non-unique display account name, secret-free config, secret references through the existing `secrets` module, and a network transport choice (direct, saved SOCKS proxy, or SSH instance tunnel).
- Provide core functions to list providers, create/update/remove connections, test a connection, list its models and read its usage. When a provider does not implement usage, the core reports connection status only (available / unavailable / configured with a reason), as the current Asoft LLM Gate health check does.
- Add a built-in `custom` provider: API URL, optional API key, protocol (OpenAI Chat Completions, OpenAI Responses, Anthropic Messages, Gemini), model discovery via the protocol's models endpoint with manual entry as fallback, any transport, and status-only usage.
- Add a new "Models" settings tab in the React shell that lists connections and creates/edits/tests/removes them. Forms are generated from the provider's field schema by default; a plugin may contribute its own React component through a new `modelProviders` UI extension slot and grant.
- Document the provider SDK.
- No existing behaviour changes: `llm.*`, `llms.*`, `sshAccount`, `sshProvider`, model routes, agents and the "LLM Connections" tab stay as they are. Agents do not use the new connections in this change.

## Capabilities

### New Capabilities

- `llm-provider-sdk`: the provider contract (metadata, field schema, allowed transports, test, optional model listing, usage and provider-owned actions) and how providers are declared, registered, owned and hot-reloaded.
- `llm-connections`: durable connection records, account naming and identity, secret handling, and the management operations (create, update, remove, test, list models, usage with status fallback).
- `llm-network-transport`: how outbound provider HTTP is routed directly, through a saved SOCKS proxy or through an SSH instance tunnel, without silent fallback to direct access.
- `llm-custom-provider`: the built-in custom provider for OpenAI-compatible, Responses, Anthropic and Gemini endpoints.
- `models-settings-ui`: the "Models" settings tab, schema-driven forms, and the plugin UI extension slot for provider-specific components.

### Modified Capabilities

None.

## Impact

- New: `src/models/` (functions, types, loader, migration, built-in custom provider, owner-only JSON route), frontend settings tab and components, `frontend/src/extensions` types/registry and `@mauzcode/ui` type exports for the `modelProviders` slot, plugin `package.json` `procs.ui.modelProviders` grant, docs page.
- Small additive touch points: `procs/repl/load.ts` hot-reload kind set, settings dialog tab list.
- Reuses `secrets`, `socksProxy.request`, `socksProxy` registry and `sshProvider.tunnel` without changing them.
- No database changes to existing tables; one new table.
