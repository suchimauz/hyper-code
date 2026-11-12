## ADDED Requirements

### Requirement: Explicit inference cache identity
The SDK stream request SHALL accept an optional prompt cache key independently of its session correlation identifier. Omission SHALL preserve existing callers through a session-identifier fallback for providers using cache keys. The SDK MUST NOT derive session ancestry or require agent-runtime objects. Existing cacheable-message-count and cache read/write usage fields SHALL retain their semantics.

#### Scenario: Separate identity and correlation
- **WHEN** a caller supplies a cache key different from the session identifier
- **THEN** a cache-key-capable provider receives both values distinctly without changing session correlation

#### Scenario: Existing caller
- **WHEN** a caller supplies no new cache field
- **THEN** the operation remains supported without requiring an agent, parent lookup or legacy inference runtime

### Requirement: Scoped provider continuation state
The SDK SHALL support optional opaque provider continuation state in stream request and result, bound to provider, connection, session and logical run. The caller SHALL explicitly carry it between requests and discard it at the end of the run. Context mismatches MUST fail before inference. Providers that do not support continuation state SHALL continue to work without it and MUST NOT receive another provider's protocol headers.

#### Scenario: Return and replay
- **WHEN** a state-capable provider returns continuation state and the caller supplies it for the next request in the same context
- **THEN** the SDK validates its scope and makes it available only to that provider

#### Scenario: Foreign state
- **WHEN** any bound provider, connection, session or run identifier differs
- **THEN** the SDK rejects the state without a network request

#### Scenario: Provider without state support
- **WHEN** an existing provider is invoked without continuation state
- **THEN** no Codex-specific header or requirement is imposed on it

### Requirement: SDK-owned reasoning capabilities
The SDK SHALL define provider-owned supported reasoning levels, a supported default and requested/applied preference diagnostics. Opted-in providers SHALL receive normalized preferences before inference, without legacy routes, accounts or types. Automatic or omitted preference SHALL use the default; unsupported levels SHALL use the nearest supported lower-or-equal level, otherwise the lowest higher level. Providers not opting in MUST retain their existing behavior.

#### Scenario: Capability-backed normalization
- **GIVEN** a provider participating in SDK reasoning normalization and validated capabilities
- **WHEN** a caller submits a preference
- **THEN** the SDK resolves it before provider inference and retains the requested value for diagnostics without mutating caller settings

#### Scenario: Missing capabilities
- **WHEN** an opted-in provider has neither validated capabilities nor an applicable documented SDK profile
- **THEN** inference fails explicitly with a capability-unavailable classification before the inference request
- **AND** the SDK does not discover legacy model routes to fill the gap

#### Scenario: Invalid metadata or preference
- **WHEN** supported levels are empty, a default is unsupported, or the preference is outside the SDK enumeration
- **THEN** the SDK reports a validation failure rather than sending an invalid effort downstream

#### Scenario: Provider not opted in
- **WHEN** an existing provider without SDK capability normalization receives its existing reasoning input
- **THEN** its established behavior is preserved and no new capability lookup is forced on it

### Requirement: Typed portable native checkpoints
The SDK SHALL define a serializable native checkpoint contract with provider, connection and model compatibility identity and opaque payload. A compact result SHALL expose this checkpoint, and stream input SHALL accept it in an explicitly ordered position alongside retained messages. The contract MUST NOT require legacy message types, agent storage or transcript mutation. Existing compact result fields and optional focus/output-budget input SHALL remain supported during additive adoption.

#### Scenario: Storage-independent round trip
- **WHEN** a client serializes a compact result checkpoint, restores it and submits it as ordered stream input
- **THEN** the provider can replay it without accessing any legacy transcript store

#### Scenario: Unsupported or incompatible checkpoint
- **WHEN** the selected provider lacks checkpoint replay support or the checkpoint identity differs from the selected connection/model
- **THEN** the SDK fails before inference with an explicit unsupported or incompatible-checkpoint error

#### Scenario: Existing compact consumer
- **WHEN** a consumer reads previously supported compact result fields and does not use the new checkpoint input
- **THEN** those fields retain their meaning and are not removed as part of this change

### Requirement: SDK-native failure and observation contracts
The SDK SHALL expose credential-safe failures independently of legacy worker types, distinguishing auth, quota, throttling, invalid input, unsupported capability, provider failure, cancellation and transport ambiguity. Metadata SHALL separate retry eligibility from replay safety and preserve available HTTP status and retry timing. Token counters SHALL remain separate from quota observations. Codex adoption MUST NOT silently change unrelated providers' contracts.

#### Scenario: Potentially accepted request is interrupted
- **WHEN** transport fails after provider acceptance is possible
- **THEN** the SDK reports uncertain acceptance and unsafe automatic replay, even when the underlying cause is transient

#### Scenario: Pre-request cancellation
- **WHEN** cancellation is already signaled before inference dispatch
- **THEN** no inference network request occurs and the failure is classified as cancelled

#### Scenario: Provider observations
- **WHEN** a provider supplies token counters and quota information in its response
- **THEN** the SDK exposes them as separate optional observations without requiring a legacy telemetry sink

#### Scenario: Credential-safe failure
- **WHEN** upstream error content includes authentication material or opaque checkpoint/state data
- **THEN** public failure data and diagnostics do not expose those values
