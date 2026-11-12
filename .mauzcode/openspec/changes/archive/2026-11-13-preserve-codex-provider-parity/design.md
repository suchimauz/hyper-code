# Design

## Context

See proposal.md for motivation. The baseline now includes the archived Claude provider change; preserve its SDK extensions. Production agents still dispatch through `llm.stream`, not `models.stream`. Existing Codex SDK code calls `llm.toCodexInput`, `llm.parseSSE` and `llm.codexCliVersion`. The audit found equal basic wire requests but different fork cache keys, missing sticky headers and unresolved reasoning preferences. Native compaction is close at the wire level; end-to-end SDK checkpoint replay is not established.

The initial audit ran 34 Codex/availability/legacy tests and 12 connection tests successfully, and compared eight mock cases (18 captured requests). These are historical observations, not acceptance results for this unimplemented change. Scratch harnesses are not committed dependencies; reconstruct durable fixtures from reviewed protocol behavior.

## Goals / Non-Goals

**Goals:** portable SDK-owned behavior, explicit input/state contracts, independent tests, safe additive adoption and separately authorized live evidence.

**Non-goals:** production agent migration, agent/session persistence adapters, deleting old inference, refactoring Claude/custom internals, changing discovery cache refresh, guaranteed server cache-hit ratios, or live execution while authoring this change.

## Decisions

### 1. SDK ownership rather than legacy adapters

Codex provider operations and their reachable inference utilities own protocol behavior under `models`. Suggested one-function-per-file responsibilities are Codex request conversion, SSE parsing, version policy, reasoning normalization and safe failure normalization. SDK request/result/checkpoint/capability types live under `models`; no old Agent, reasoning or worker types.

Use `ctx.fns` for project procedure calls, not cross-file imports. Shared framework and existing independent transport/database/secrets utilities remain permitted. Prohibit direct or transitive calls into `llm`, `llms`, legacy account/endpoint/SSH inference dispatch, old compaction or agent/session context machinery. Trace actual dependencies of `models.resolve`, `conn.fetch`, auth and helpers; a thin new helper that calls legacy is still a violation. Do not prohibit ordinary transport networking merely because SSH is a supported connection transport.

SDK version selection is connection override, otherwise a documented constant/profile maintained with the provider. No CLI lookup or shell execution. Select the concrete compatible default during implementation and confirm it live; its numeric value is not an architectural choice.

Rejected: reuse old helpers behind new names. It saves code but preserves the dependency the user explicitly excludes. Also rejected: migrate every provider now; boundary enforcement is scoped to Codex and new common utilities.

### 2. Explicit cache identity and scoped state

Add optional `promptCacheKey` independently of `sessionId`; Codex falls back to sessionId. Session ownership decides related-history identity. The provider cannot compute ancestry and never substitutes a root key into session headers.

Use an additive `runId` and optional scoped continuation envelope in stream request/result. The envelope binds provider id, connection id, session id and run id to opaque provider data. Core verifies all binding fields before dispatch. A run id is required when state is submitted; calls without run id/state remain valid but cannot persist routing state across calls. Codex returns state when a run identity is available, preserving the first token even if later responses propose another. Callers own run lifecycle and clear the envelope on a new run. State is not a credential but is private operational data: no ordinary logs or UI output, no global map.

Rejected: run-scoped mutable ctx fields as the SDK API (implicit ownership), a process-global token map (leaks/lifetime), or using promptCacheKey as sessionId (breaks correlation). Tests use explicit logical sessions/runs without Agent instances.

### 3. Reasoning normalization belongs to SDK inference

Extend SDK-owned model metadata with a provider opt-in reasoning profile: supported ordered levels, default, and applicability to a native model id. Codex supplies validated discovery metadata or an explicit versioned SDK profile; no legacy model identifiers. Core resolves a requested preference before dispatch: omitted/auto → default, supported → unchanged, otherwise nearest supported lower-or-equal level, else lowest higher level. Preserve requested/applied/fallback reason separately. Invalid preferences/metadata fail validation; missing trustworthy metadata fails capability-unavailable rather than guessing or sending auto.

Codex maps normalized off to `none`. Other providers do not opt in automatically and retain existing behavior. Profile reads may use the existing model catalogue, but this change does not alter its cache policy; inference gating remains before provider network operations. Add fixture coverage for stale/absent metadata and profile applicability.

Rejected: require callers to invoke old reasoning resolution, or have provider silently forward arbitrary strings. Explicit SDK metadata makes normalization usable without legacy installation.

### 4. Ordered SDK input and portable checkpoints

Introduce a typed ordered SDK input union for messages and native checkpoints, with an optional new input field. Existing `messages` remains the compatibility path; reject ambiguous requests that explicitly supply both histories rather than silently merging them. Keep existing fields available to current callers; the exact TypeScript union should allow the new input path without dummy legacy messages.

A checkpoint envelope contains provider, connection and model identity plus a validated opaque payload. Codex payload holds the native compaction item; it is never prose. New compact results add the envelope while preserving existing item/responseId/usage fields for consumers. The mapper serializes checkpoint entries in their supplied position; clients select retained history and persist the envelope. Identity checks reject cross-provider/connection/model reuse conservatively. More permissive checkpoint migration can be a later explicit capability.

Compaction retains manual standalone memento metadata, trigger placement, empty tools, disabled parallel tools and medium reasoning. Require one nonempty string checkpoint plus completed response identity. Input and output validation failures do not expose encrypted payloads. Focus/maxTokens retain the current SDK contract; do not claim Codex supports provider semantics it does not implement.

Rejected: reuse `message_type: codex_compaction` from session storage as the public SDK format, or add a production session adapter here. Tests serialize/restore an SDK envelope in an isolated fixture and then capture the next SDK stream request.

### 5. Failure and observation semantics, not worker coupling

Define an SDK-owned failure shape carrying classification, safe message, optional HTTP status/retry timing, acceptance certainty and replay safety separately from transient retryability. Preserve existing documented error codes where already consumed (including login-required/disabled/unsupported behavior); richer metadata is additive. Codex opts in; unrelated providers are not silently converted.

Map auth rejection, exhausted quota, transient throttling, invalid input, provider failures, cancellation and ambiguous transport. Prefer structured backend codes over message guessing; an unclassified 429 is throttling/unknown quota, not asserted exhausted quota. Never turn a possibly accepted interrupted inference into an internal retry. Pre-aborted requests send nothing. Auth refresh remains its existing separate flow and does not justify repeating an accepted inference.

Token counters and optional quota observations are separate result fields. Capture quota data already present on responses without legacy recording calls or an extra usage request. A failed observation consumer must not invalidate completed inference. Public errors must not echo tokens, opaque state or checkpoints; raw upstream body is not a safe public message.

Rejected: return legacy worker FailureInfo or invoke recordUsage/classifyError. Downstream migration may later map SDK failures into application policy explicitly.

### 6. Test independence and live acceptance

Durable offline fixtures describe expected URL, method, headers, JSON and parsed outcomes; normalize only variable values such as UUIDs. Assertions must not erase cache identity, reasoning or state differences. Include message attachments and tool arguments, malformed arguments, exact compaction metadata, native checkpoint boundaries, auth/quota/429/5xx distinctions, cancellation and missing terminal events. Verify enabled model/connection gates before all network effects.

Use static dependency/call/type inspection plus an SDK-only runtime harness with forbidden namespaces unavailable. Include provider declaration local helpers, dynamic accesses, imports and transitive utilities: the call index alone does not capture all of them. Test no CLI/account-file discovery and all requests through conn.fetch. Existing Claude/custom tests protect additive contract compatibility; their unrelated dependency cleanup is deferred.

Live comparison is an explicit later task using independent clients, not a test-time dependency of the SDK. Before any outbound call, discover safe secret references and obtain exact authorization for account/connection, model and budget. Run isolated ordinary/tool/compact/replay sequences on the same model and comparable account conditions. Record versions, transport, normalized request conditions, order/timing and usage counters without credentials or opaque payloads. Avoid attributing warm-cache contamination to parity. Exact output text and cache-hit ratios need not match; correctness and metric limitations are reported separately. Missing approval/environment leaves acceptance incomplete, not skipped as success.

## Risks / Trade-offs

- **Duplicated protocol logic during coexistence** → intentionally independent ownership, shared behavioral fixtures and reviewed updates, not legacy wrappers.
- **New SDK fields collide with provider extensions** → additive optional contracts, provider opt-in, preserve current Claude fields and test callers.
- **State is explicitly caller-managed** → binding validation and documented fresh-run lifecycle; provider cannot infer reuse safety from a cache key.
- **Capability metadata is unavailable or stale** → validated profiles with explicit applicability and explicit failure when no safe profile exists.
- **Backend caching is nondeterministic** → assert wire-level invariants and report live measurements without promising hit ratios.
- **Checkpoint compatibility is conservative** → reject cross-identity reuse before network; add broader portability only with evidence.
- **Architecture checks miss indirect coupling** → combine indexed/static review and runtime operation with legacy unavailable.

## Migration Plan

1. Add SDK contracts and independent helpers, with compatibility tests and no agent routing changes.
2. Adopt them in the Codex provider; remove every prohibited reachable dependency and document the SDK version/profile policy.
3. Run deterministic/architecture/provider tests, strict docs/type checks and OpenSpec validation.
4. Conduct the separately approved live sequence and publish a sanitized acceptance report; retain incomplete status until required evidence exists.
5. No database migration or production transcript conversion is planned. Production agents remain on legacy. If new SDK behavior fails validation, stop rollout to SDK consumers and revert the isolated implementation changes; never silently fall back to legacy inside the provider. Agent migration/rollback belongs to a later change.

## Open Questions

- The exact SDK client-version default and model capability profile values will be pinned from reviewed protocol evidence and authorized live acceptance during implementation. This does not change the ownership, failure policy or task breakdown.
