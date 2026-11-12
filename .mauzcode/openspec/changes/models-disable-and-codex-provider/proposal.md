# Proposal

## Why

The Models settings tab can create and test provider connections, but the owner cannot switch off individual models of a connection, and there is no provider for the ChatGPT subscription (Codex). The legacy Codex path depends on the `codex` CLI and its `auth.json` files, and SSH accounts run the CLI on the remote instance. That CLI makes its own network requests, so a saved SOCKS proxy cannot be guaranteed for login. A native Codex provider that does every request through the connection's transport fixes this. It also gives the new models stack its first inference-capable provider.

## What Changes

- Per-connection model disabling: the owner can disable or re-enable any model of a connection in the Models tab. Disabled models stay listed and are marked. Every inference request through the new models entry point re-checks the stored state, so a session already using the model fails on its next request with `Model <model> is disabled by user`, and nothing is sent to the provider.
- Provider SDK gains optional streaming and compaction operations. The models module gains inference entry points that enforce the connection and model enabled state before calling the provider.
- New built-in `codex` provider:
  - device-code login implemented natively over HTTP (no CLI, no commands on SSH instances), with every request sent through the connection transport (direct, SOCKS proxy or SSH tunnel)
  - encrypted token storage with safe refresh rotation
  - model discovery and usage windows
  - Responses API streaming and native compaction
- Models tab: per-model switches, a Codex login panel (link, one-time code, live status, cancel) and logout with confirmation.
- Persistent model list cache per connection: the list is stored in Postgres, never expires, is served without network access, and is refreshed only by the **Update models** button, an hourly background refresh, or when nothing is cached yet. A failed refresh keeps the previous list.
- Models tab polish: the whole model row toggles the switch, toggles are a local draft saved with one **Save (N)** button (with **Reset**), rows have vertical spacing, test/usage reason codes are shown as human-readable text, and connection cards show the provider's brand logo, while custom connections always show a generic plug icon.
- Agents keep using the existing LLM routes. This change does not route agents through models connections.

## Capabilities

### New Capabilities

- `llm-model-availability`: per-connection disabling of individual models, and enforcement on every inference request through the models entry point.
- `llm-codex-provider`: the built-in Codex (ChatGPT subscription) provider: native device-code login through the connection transport, token storage and refresh, model discovery, usage, streaming and compaction.

- `llm-model-cache`: persistent per-connection model list cache with manual and hourly refresh.

### Modified Capabilities

- `llm-provider-sdk`: the provider contract adds optional streaming and compaction operations.
- `models-settings-ui`: per-model enable switches with a draft and Save button, the provider login panel, Update models, readable reason labels and provider logos.

## Impact

- `src/models/`: a migration adding `llm_connections.disabled_models`, new functions (`setModelEnabled`, `assertModelEnabled`, `stream`, `compact`), types (`StreamRequest`, `StreamEvent`, `StreamResult`, `CompactRequest`, `CompactResult`), `ConnectionView.disabledModels`, `ModelInfo.disabled`, the API op `setModelEnabled`, and `$modelProvider_codex.ts` with helper functions.
- `frontend/src/components/settings/ModelsPanel.tsx`, `frontend/src/lib/models.ts`, settings CSS and tests.
- Reuses `llm.toCodexInput`, `llm.parseSSE` and `llm.codexCliVersion` through `ctx.fns`. `src/llm`, `src/llms`, `sshAccount`, `codexTunnel` and `sshInstance` are not changed.
