# Tasks

## 1. Model availability

- [x] 1.1 Add migration `disabled_models TEXT[]` on `llm_connections` (up/down) and verify the column exists after `migrate.up`
- [x] 1.2 Expose `disabledModels` in `ConnectionView` and the `disabled` flag in `listModels`, and verify with a connections test
- [x] 1.3 Implement `models.setModelEnabled` and `models.assertModelEnabled`, and verify idempotence, validation, the exact error and no caching in `availability.test.ts`
- [x] 1.4 Add the `setModelEnabled` op to `/models/api` and verify the owner/CSRF path with an api test

## 2. Inference SDK

- [x] 2.1 Add `StreamRequest`/`StreamResult`/`CompactRequest`/`CompactResult` types and optional `stream`/`compact` on `ProviderDefinition` with loader validation, and verify that `providers.test.ts` passes
- [x] 2.2 Implement `models.stream` and `models.compact` (assert → resolve → provider, `UNSUPPORTED`), and verify a disabled model never triggers fetch in `availability.test.ts`

## 3. Codex provider

- [x] 3.1 Implement `models.codexAuth` (encrypted CAS store, refresh with de-duplication, needsLogin) and verify concurrent refresh, CAS conflict and 401 in `codex.test.ts`
- [x] 3.2 Implement `models.codexLogin` (device-code start/poll/exchange/cancel/expiry) and verify the request shapes, pending/expired/cancel, the non-retried exchange, the account id claim and secrecy in `codex.test.ts`
- [x] 3.3 Add `$modelProvider_codex.ts` (test, listModels, usage, stream, compact, actions login/loginStatus/cancelLogin/logout) and verify the mapping, SSE events and that only `conn.fetch` is used in `codex.test.ts`
- [x] 3.4 Document the inference operations and the Codex provider in the models SDK docs page, and verify the docs mention the device login and stream/compact

## 4. Settings UI

- [x] 4.1 Add per-model switches in ModelsPanel and verify aria, toggle and error in `settings-models.test.tsx`
- [x] 4.2 Add the Codex login panel and logout confirmation, and verify code/status/cancel in `settings-models.test.tsx`

## 5. Integration

- [x] 5.1 Run `code.quality`, strict `runtime.docs.validate` for the new functions, the models and frontend tests, and `openspec validate --strict`, and verify that all pass

## 6. Model cache and UI polish

- [x] 6.1 Add migration `models_cache`/`models_cached_at`, cache-first `models.listModels({refresh})` with `cachedAt`, and `models.refreshAll`; verify cache hits, failed refresh keeping the cache and refreshAll in `connections.test.ts` and `custom.test.ts`
- [x] 6.2 Add `models/$start`/`$stop` hourly refresh (`MODELS_REFRESH=off`) and list `models` in `procs.prod`
- [x] 6.3 Make model rows clickable with a draft, `Save (N)` and `Reset`, row spacing, and verify no request before Save in `settings-models.test.tsx`
- [x] 6.4 Add the Update models button with last-update time, and verify cache read on open and refresh on click
- [x] 6.5 Show human-readable reason labels with the raw code as a tooltip, and verify in `settings-models.test.tsx`
- [x] 6.6 Return `providerLogos` from `models.api` GET, render brand logos for known providers and always a plug icon for custom connections, and verify in `settings-models.test.tsx`
- [x] 6.7 Document the model cache in `docs/models-providers.md`

## Workflow follow-up

- Archive the change after review.
