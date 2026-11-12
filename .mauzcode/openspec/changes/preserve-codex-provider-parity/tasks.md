# Tasks

All items below describe future implementation, not work completed by the specification commit. Do not switch production agents or invoke live services merely by applying the document scaffolding.

## 1. SDK contracts and independent protocol utilities

- [ ] 1.1 Inspect current SDK callers/types and delivered Claude contracts, and document an additive compatibility matrix for cache identity, run state, ordered input, checkpoint, reasoning and errors; verify existing consumers retain their fields and semantics.
- [ ] 1.2 Add SDK-owned types and validation for the new optional contracts using the normal authoring/type-generation workflow; verify type checks and contract tests including existing Claude/custom requests and compaction focus/budget/cache fields.
- [ ] 1.3 Implement SDK-owned Codex message/tool/attachment conversion and SSE parsing without legacy wrappers; add deterministic fixtures for ordering, attachments, tool results, malformed arguments, framing and terminal events and verify they pass with legacy namespaces unavailable.
- [ ] 1.4 Replace CLI version discovery with validated override/documented SDK default, pin the chosen compatible value and evidence, and verify version/model-discovery tests execute no shell or CLI/account-file lookup.
- [ ] 1.5 Document SDK ownership, allowed infrastructure and public request/result contracts in models provider documentation; verify examples typecheck without old agent or inference types.

## 2. Cache identity and scoped continuation

- [ ] 2.1 Pass independent promptCacheKey to Codex with sessionId fallback; verify exact request tests for ordinary sessions, shared-history identities, independent sessions and unchanged correlation headers.
- [ ] 2.2 Implement scoped state request/result validation and first-token replay; verify same-run tool continuation, later-token stability, new-run reset, absent tokens, calls without run identity and rejection of provider/connection/session/run mismatch before network.
- [ ] 2.3 Document caller-owned cache/run lifecycle and private opaque state handling; verify examples neither reference agent.cacheRoot nor add Codex headers to unrelated providers.

## 3. Reasoning and complete request parity

- [ ] 3.1 Supply validated SDK reasoning capabilities from model metadata or documented versioned profiles and implement opted-in normalization; verify omitted/auto/default/supported/off/fallback, invalid metadata/preferences, unknown model and missing-profile errors without legacy model routes.
- [ ] 3.2 Integrate normalized reasoning and request mapping into Codex streaming; verify URL, method, headers and body against independent golden fixtures, normalizing only genuinely variable fields, and preserve requested/applied diagnostics.
- [ ] 3.3 Document model-profile applicability, missing-capability behavior and other-provider opt-in compatibility; verify existing providers not opting in keep their current reasoning behavior.

## 4. Checkpoints, failures and observations

- [ ] 4.1 Implement typed compact output and ordered checkpoint input with identity validation and compatible old result fields; verify compact → JSON serialization/restoration → next stream entirely through SDK fixtures without agent/session storage.
- [ ] 4.2 Preserve native compaction metadata/trigger/tool/reasoning behavior and strict response checks; verify duplicate/missing/invalid checkpoint, missing response identity/completion, incompatible input and no opaque-content diagnostic leaks.
- [ ] 4.3 Implement SDK-native Codex failure classification with retry timing, acceptance certainty and replay safety; verify 401, exhausted quota versus throttling, 5xx, failed SSE, malformed/truncated stream, pre-abort and mid-stream cancellation, with no hidden inference retry.
- [ ] 4.4 Return token usage separately from quota observations and preserve credential secrecy; verify cache counters, absent metadata, no extra usage network request and no dependency on legacy telemetry.
- [ ] 4.5 Document checkpoint ordering/compatibility, unsupported focus/budget semantics where applicable, safe error examples and observation fields; verify examples use only SDK-owned contracts.

## 5. Architecture and offline integration acceptance

- [ ] 5.1 Remove all prohibited reachable dependencies from Codex, including auth/discovery/transport-helper paths where relevant; add static call/type/import checks plus SDK-only runtime tests with legacy namespaces unavailable, and review local helpers/dynamic accesses beyond the call index.
- [ ] 5.2 Run the full deterministic matrix across mock direct/SOCKS/SSH connection transports, asserting every network operation uses conn.fetch and disabled model/connection or invalid context makes no network call; record results without live credentials.
- [ ] 5.3 Run affected models, Claude/custom compatibility and existing legacy regression tests separately; verify the new SDK test suite does not require loading legacy and production agent routing remains unchanged.
- [ ] 5.4 Hot-reload implemented runtime functions, regenerate types when needed, run strict runtime documentation/type validation and relevant code-quality checks; record new failures versus pre-existing issues and verify changed SDK APIs are documented.

## 6. Separately authorized live acceptance

- [ ] 6.1 Discover safe existing credential references and obtain explicit account/connection, model and request/token budget approval before live traffic; record authorization scope without credential values and keep this task incomplete if unavailable.
- [ ] 6.2 Run approved isolated normal/tool-continuation/compact/checkpoint-replay sequences through independent legacy and SDK clients on the same model and comparable account conditions; verify correctness and SDK independence without changing user conversations.
- [ ] 6.3 Record sanitized versions, transport, request conditions, timing/order, input/output/cache-read tokens and quota observations; distinguish cache effectiveness evidence from wire parity, explicitly mark zero/missing cache metrics inconclusive and avoid a numerical hit-rate equality claim.
- [ ] 6.4 Verify the live evidence satisfies the approved budget and required scenarios, or record the blocker and leave acceptance unfinished; never replace missing live evidence with mock successes.

## 7. Final review

- [ ] 7.1 Run strict OpenSpec validation and review the acceptance report against every new requirement, including independence and live evidence; verify all completed task claims have evidence and unresolved implementation/live work remains unchecked.
- [ ] 7.2 Review final implementation diff for scope, credential safety and no production agent migration, and document rollout/revert instructions without a hidden legacy fallback; verify another provider's unrelated cleanup is not included.

## Workflow follow-up

- Archive only after implementation, required acceptance evidence and project review are complete; the current document-only task does not authorize archiving.
- Propose production agent migration separately; this change supplies a clean SDK rather than an old-runtime adapter.
