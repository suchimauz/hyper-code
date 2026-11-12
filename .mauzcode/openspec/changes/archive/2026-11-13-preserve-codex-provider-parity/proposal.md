# Proposal

## Why

The new Codex connection provider reproduces basic streaming and native compaction, but lacks legacy cache-lineage identity, turn-scoped sticky routing and capability-aware reasoning behavior. It also still calls legacy protocol helpers; migration readiness requires preserving the proven behavior inside the independent models SDK, not wrapping the old implementation.

## What Changes

- Remove direct and transitive legacy dependencies from the Codex SDK path, including input conversion, SSE parsing and CLI version discovery; implement SDK-owned protocol utilities and a documented client-version default.
- Separate prompt cache identity from session correlation and carry scoped opaque continuation state explicitly through SDK contracts.
- Resolve reasoning preferences using SDK-owned model capabilities, preserving default/off/fallback behavior without legacy model routes.
- Define a typed SDK checkpoint input/output and validate compaction-to-next-request round trips without legacy transcript storage.
- Define SDK-native failures, retry safety, token usage and quota observations; preserve transport-only requests, cancellation, enabled gates and credential secrecy.
- Add deterministic wire fixtures, negative tests and architecture-boundary tests, followed by separately authorized live comparison against the legacy client.
- Keep production agents on the existing route. Do not change model-discovery cache policy or refactor unrelated providers.

## Capabilities

### New Capabilities

None; this change extends the existing SDK and Codex capabilities.

### Modified Capabilities

- `llm-codex-provider`: SDK independence, request parity, cache identity, sticky routing, reasoning, checkpoint replay, error/usage behavior and live acceptance evidence.
- `llm-provider-sdk`: additive inference context, scoped provider state, reasoning metadata/normalization, typed native checkpoints and SDK-owned failure/observation contracts.

## Impact

Future implementation affects `src/models/$modelProvider_codex.ts`, SDK request/result/model types, inference entry points, SDK-owned helpers, tests and `docs/models-providers.md`. New procedures follow the one-function-per-file convention and call each other through `ctx.fns`; no cross-project imports or legacy wrappers. Shared framework transport/storage/secrets infrastructure remains usable when independent of legacy inference.

The recently archived `add-claude-provider` change is already part of the baseline (HEAD observed as `18421c59`). Preserve its cacheable-prefix, cache-write usage and compaction focus/budget contracts. Codex-specific state must not impose Codex headers on Claude or custom providers. This change does not clean up their existing legacy dependencies.

This commit contains specifications and unchecked implementation tasks only. It does not execute live requests, switch agent routing, change runtime code or archive this change. Live acceptance later requires explicit account/model/budget authorization; offline successes alone do not complete the change.
