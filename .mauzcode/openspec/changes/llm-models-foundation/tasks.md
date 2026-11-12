# Tasks

## 1. Provider SDK and registry

- [x] 1.1 Add `types.models` contract files (`ProviderDefinition`, `FieldSpec`, `ResolvedConnection`, `TestResult`, `ModelInfo`, `UsageReport`, `TransportSpec`, `State`) under `src/models/` and verify `procs.dev.genTypes` and typecheck pass
- [x] 1.2 Implement `models/$loader_modelProvider.ts` with id validation, required `test`, mounted-owner checks and protected core ids; add `modelProvider` to `HOT_KINDS`; verify unit tests for registration, invalid id, missing test, foreign override rejection and same-owner reload
- [x] 1.3 Implement `models.providers` (secret-free catalogue for UI) and verify a unit test lists a fixture provider with fields and transports
- [x] 1.4 Write `docs/models-providers.md` (SDK contract, minimal provider example, ownership, UI slot) and verify the example matches the test fixture provider

### Block 1 verification

- Targeted SDK, boot/reload, classifier and ownership tests: 32 passed, 0 failed. The documentation example is executed and compared with the fixture catalogue.
- `procs.dev.genTypes` succeeded; typecheck has no diagnostics in `src/models/` or the changed framework files. Full-project `tsc --noEmit` remains failing: final diagnostics exactly match the HEAD baseline with equivalent generated declarations (593 log lines); no new diagnostics remain.
- Full fast suite: 3485 passed, 15 skipped, 2 failed outside this block. Mobile model-policy failure reproduces on HEAD; the HMR bridge failure passes in isolation on HEAD and current code, but its full-suite cause remains unresolved.
- Strict runtime documentation validation passes for `models.providers` and the changed framework functions. Declarative loaders are not runtime-doc function entries; the loader is checked by TypeScript and boot/reload tests.
- OpenSpec strict validation passes. Global `code.quality` still reports 8 unresolved calls outside this block; the new catalogue has no production caller until later blocks.
- Scope: block 1 only. No migration, network execution, Custom provider, UI slot, or existing LLM routing changes.

## 2. Network transport

- [x] 2.1 Implement `models.fetch` for `direct`, `socks` (`socksProxy.readSaved` + `socksProxy.request`) and `ssh-tunnel` (`sshProvider.tunnel` + `socksProxy.request`, lease released on done/abort) with URL safety, timeout and abort; verify unit tests with mocked proxy/tunnel, including no direct fallback on proxy failure and https-only for proxied transports
- [x] 2.2 Implement transport validation (provider allows kind, proxy exists, SSH instance trusted) and verify unit tests for each rejection

Verification (block 2): `bun test src/models src/socksProxy src/sshProvider/tunnel.test.ts src/sshProvider/lease.test.ts` — 98 passed, including 25 transport/validation tests (setup/body timeout, abort, tunnel exit and late lease cleanup). Both runtime functions pass strict documentation/typecheck validation; strict OpenSpec validation passes. Full repository typecheck remains red outside `src/models`; code quality reports 8 existing unresolved calls in private `myhealthGaps`, `skill`, `tunnel` modules. New helpers intentionally await consumers in block 3; no existing LLM routing changed.

## 3. Connection storage and management

- [x] 3.1 Add `$migration_<ts>_llm_connections.ts` creating `llm_connections` (down drops it) and verify `procs.migrate.up` applies and the schema matches via `information_schema.columns`
- [x] 3.2 Implement config validation against field schema plus provider `validate`; verify unit tests for missing required, unknown key, bad select value, bad url
- [x] 3.3 Implement `models.create/update/remove/list/get` with secrets in `secret://models/<id>.<field>` (keep on omit, clear on explicit null, delete on remove) and required non-unique account name; verify tests that no secret value appears in any list/get result and secrets are deleted on remove
- [x] 3.4 Implement `models.test`, `models.listModels` (provider or manual fallback), `models.usage` (provider report or cached status fallback, disabled → `disabled` without network) and `models.action`; verify unit tests including cache reuse and unknown action
- [x] 3.5 Implement owner-only `models.api` with GET/POST routes (same-origin, CSRF, JSON, 64 KiB limit, secret-free responses); verify route tests for 401/403, missing CSRF, oversize body and each action
- [x] 3.6 Validate all new functions with `runtime.docs.validate({ strict: true, typecheck: true })`

Verification (block 3): migration `20370201120000_llm_connections` applied; `information_schema.columns` matches D3 (id uuid, provider, account_name, config/secrets/transport jsonb, enabled, created_at/updated_at bigint, all NOT NULL). `bun test src/models` — 51 passed, including 12 connection tests (validation errors per field, secret-free list/get/API bodies, keep/replace/clear secrets, secrets deleted on remove, disabled without provider calls, status-only usage fallback with cache reuse and revision invalidation, unknown action, API 401/403/CSRF/origin/415/413 and every action). All 15 new runtime functions pass `runtime.docs.validate({ strict: true, typecheck: true })`; `GET /models/api` answers 401 unauthenticated on the live server. `code.quality` reports only the same 8 pre-existing unresolved calls outside this block. No changes under `src/llm`, `src/llms`, `src/sshAccount`, `src/sshProvider`.

## 4. Custom provider

- [x] 4.1 Implement `models.customProtocol` (models endpoint + minimal generation per `openai-chat`, `openai-responses`, `anthropic`, `gemini`, protocol-specific auth headers) and verify unit tests against a local mock server for all four protocols
- [x] 4.2 Implement `src/models/$modelProvider_custom.ts` (fields, all transports, url validation, discovery merged with manual models, test reasons `models-ok`/`generation-failed`, no usage) and verify unit tests for each spec scenario

Verification (block 4): 10 custom tests passed in an isolated Bun subprocess executing the test bodies with `bun:test` assertions and a local HTTP mock for all four protocols; 25 existing transport tests passed with the same harness. Stock `bun test` currently exits 0 after its version banner even for a trivial test, so its exit code is not claimed as a successful test run. Harnesses and outputs are in `.mauzcode/tmp/eb/`. `models.customProtocol` created through createFunction, hot-reloaded and strict docs/typecheck validated. Custom declaration registered through the standard modelProvider loader and appears in the live catalogue. Existing live scanner retains a stale static classify import and misclassifies camelCase modelProvider declarations on namespace reload; fresh test contexts classify/load the declaration correctly. No framework changes or restart. Whole-project tsgo still fails on existing files, with no errors in the three new files; quality retains 8 pre-existing unresolved errors and a stale-index dead warning for this declaration. Strict OpenSpec validation passes. No legacy LLM or UI files changed by this block.

## 5. UI SDK slot

- [x] 5.1 Accept `procs.ui.modelProviders` grants in `plugins/uiCompile.ts`, `UiGrants` and `uiManifest`; verify plugin tests that grants compile and change detection includes the new key
- [x] 5.2 Add `modelProviders` to `UiExtension`, registry (grant check, duplicates) and `@mauzcode/ui` exports; verify frontend registry tests for granted, ungranted and duplicate entries

Verification (block 5): `procs.ui.modelProviders` accepted by `uiCompile` (kebab-case ids, `custom` rejected), stored in `UiGrants` and included in `uiManifest` approval equality (older approvals without the key → `changed`). `bun test src/plugins/ui.test.ts` — 6 passed. Frontend: `UiExtension.modelProviders`, registry grant/duplicate checks, SDK exports `ExtensionModelProvider(Props)`, `ModelProviderView`, `ModelConnectionView`, `ModelFieldSpec`, `ModelTransportSpec`; registry tests 10 passed. `docs/models-providers.md` and plugins SKILL.md document the slot; doc example test still passes.

## 6. Models settings tab

- [x] 6.1 Add `frontend/src/lib/models.ts` client and `ModelsPanel` (list, usage view, add/edit with schema-driven form and write-only secrets, transport picker with saved proxies and trusted SSH instances, test, enable/disable, remove with confirmation, plugin component when granted)
- [x] 6.2 Add the "Models" tab (lucide `Boxes`) to `SETTINGS_TABS` keeping "LLM Connections"; verify frontend tests for tab presence, schema form, secret edit behaviour, remove confirmation and plugin component use
- [x] 6.3 Check accessibility (labels, keyboard, focus, theme, reduced motion) and verify with frontend tests and a manual screenshot of the tab

Verification (block 6): client is `frontend/src/lib/modelConnections.ts` (`lib/models.ts` already holds the chat model picker). `ModelsPanel` + `UsageView`, tab `models` (Boxes) after LLM Connections, also `?settings=models`. `frontend/src/test/settings-models.test.tsx` — 8 passed (tab presence, schema form + CSRF create, write-only secret keep/clear, remove confirmation with focus, test/enable, quota windows vs status-only, granted vs ungranted plugin component, owner-only error). `tsc -b frontend` clean. Full vitest: 693 passed, 2 failed (live-navigation, quota-matrix) — both fail identically on HEAD. Accessibility: every control labelled (labelledby), native buttons/inputs for keyboard, visible focus rings for select/checkbox/radio/textarea, theme tokens only, no animations added (reduced-motion rule covers the modal). Manual screenshot: `.mauzcode/tmp/ee/models-tab.png`. `code.quality` unchanged (8 pre-existing unresolved).

## 7. Integration checks

- [ ] 7.1 Verify `code.quality({})` is ok and no files under `src/llm`, `src/llms`, `src/sshAccount`, `src/sshProvider` changed (`git diff --stat`)
- [ ] 7.2 Run existing llm/llms/sshProvider/plugins/frontend test suites and verify they pass unchanged
- [ ] 7.3 End-to-end: create a Custom connection against a local mock endpoint (direct) and with a SOCKS proxy, see status and models in the Models tab; load a fixture plugin provider with its own component and see it in the catalogue
- [ ] 7.4 Run `openspec validate llm-models-foundation --strict` and verify it passes

## Workflow follow-up

- Archive the change after review and acceptance.
