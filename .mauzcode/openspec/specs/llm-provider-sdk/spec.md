# llm-provider-sdk Specification

## Purpose
Defines the contract every LLM provider implements and how core modules, official plugins and user plugins declare and register providers, so that new connection types can be added without changing the core.

## Requirements

### Requirement: Provider declaration
The system SHALL let any mounted source (core module, official plugin or user plugin) declare an LLM provider through a dedicated declarative file kind identified by a lowercase kebab-case provider id.

#### Scenario: Plugin declares a provider
- **WHEN** a mounted user plugin contains a provider declaration with id `acme`
- **THEN** the provider `acme` appears in the provider catalogue with its label, icon, description, field schema and allowed transports

#### Scenario: Invalid provider id
- **WHEN** a provider declaration uses an id that is not lowercase kebab-case
- **THEN** registration of that declaration fails with an error naming the file, and other providers stay registered

### Requirement: Provider ownership
The system SHALL bind each provider id to the mounted source that first declared it and MUST reject a declaration of the same id from a different owner; built-in provider ids are owned by the core.

#### Scenario: Plugin tries to override a built-in provider
- **WHEN** a user plugin declares a provider with id `custom`
- **THEN** that declaration is rejected and the built-in `custom` provider remains unchanged

#### Scenario: Same owner redeclares
- **WHEN** the owning plugin reloads its own provider declaration
- **THEN** the registered provider is replaced by the new definition

### Requirement: Provider contract
A provider definition MUST include metadata, a field schema, the list of allowed transports and a connection test operation, and MAY include model listing, usage reporting, configuration validation and provider-owned actions such as login and logout.

#### Scenario: Minimal provider
- **WHEN** a provider declares only metadata, fields, transports and a test operation
- **THEN** it is accepted and connections of that provider can be created, tested and shown with status-only usage

#### Scenario: Missing test operation
- **WHEN** a provider declaration has no test operation
- **THEN** registration of that provider fails with an error

### Requirement: Field schema
The field schema SHALL describe each configuration field with a key, label, type (text, url, select, secret, number or boolean), required flag, optional default, options for select fields and optional help text.

#### Scenario: Secret field is declared
- **WHEN** a provider declares a field of type `secret`
- **THEN** its value is stored as a secret and never returned to clients, which only see whether it is set

### Requirement: Provider-owned authorization
The core SHALL NOT implement provider-specific authorization; login, logout, token refresh and other provider-specific flows MUST be performed by the provider through its declared actions.

#### Scenario: Provider action invoked
- **WHEN** the owner invokes a declared action of a provider on one of its connections
- **THEN** the core calls that provider's action with the connection and returns the action's secret-free result

#### Scenario: Undeclared action
- **WHEN** a client invokes an action that the provider did not declare
- **THEN** the request fails with an unknown-action error and nothing is called

### Requirement: Hot reload of providers
The system SHALL re-register provider declarations when their module or plugin is reloaded, without a server restart.

#### Scenario: Provider file edited
- **WHEN** a provider declaration file changes and its module is reloaded
- **THEN** the provider catalogue reflects the new definition

### Requirement: Optional inference operations
A provider definition MAY declare streaming and compaction operations that receive the resolved connection and a request, and send network traffic only through the connection's transport. The core inference entry point SHALL refuse a request with code `UNSUPPORTED` when the provider declares no such operation, without contacting the network.

#### Scenario: Provider without streaming
- **WHEN** a stream request targets a connection whose provider declares no streaming operation
- **THEN** it fails with code `UNSUPPORTED` and no request is sent

#### Scenario: Provider with streaming
- **WHEN** a stream request targets an enabled model of an enabled connection whose provider declares streaming
- **THEN** the provider's streaming operation receives the request and its normalized result is returned

### Requirement: Inference cache and compaction fields
The stream request SHALL carry the number of leading messages that form the cacheable prefix, and the stream result SHALL report cache read and cache write tokens when the provider returns them. The compaction request SHALL carry an optional focus and output token budget.

#### Scenario: Cacheable prefix
- **WHEN** a caller passes the cacheable message count
- **THEN** the provider receives it unchanged and may place cache markers before transient guidance

#### Scenario: Compaction focus
- **WHEN** a caller passes a compaction focus and token budget
- **THEN** the provider's compaction operation receives them unchanged

#### Scenario: Cache write tokens
- **WHEN** a provider reports cache creation tokens
- **THEN** the stream result includes them as cache write tokens

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
