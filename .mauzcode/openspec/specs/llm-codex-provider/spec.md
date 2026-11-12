# llm-codex-provider Specification

## Purpose
Define the built-in Codex (ChatGPT subscription) model provider: native device-code login sent through the connection transport, encrypted token storage and refresh, model discovery, usage windows, streaming and compaction.

## Requirements

### Requirement: Codex connection
The system SHALL provide a built-in `codex` provider whose connections need only an account name, accept an optional client version override, and allow the direct, SOCKS proxy and SSH tunnel transports.

#### Scenario: Create through a proxy
- **WHEN** the owner creates a codex connection with a saved SOCKS proxy transport
- **THEN** the connection is stored without credentials and reports that login is required

### Requirement: Native device-code login through the transport
Codex login SHALL use the OpenAI device-code flow: request a user code, show the verification link and code, poll for authorization, then exchange the code for tokens. Every request in the flow MUST go through the connection transport. Login MUST NOT start a local CLI or run commands on an SSH instance.

#### Scenario: Successful login over SOCKS
- **GIVEN** a codex connection with a SOCKS proxy transport
- **WHEN** the owner starts login, confirms the code in the browser and polls status
- **THEN** status becomes `succeeded`, tokens are stored, and every login request was sent through the proxy

#### Scenario: Waiting for confirmation
- **WHEN** the authorization poll answers 403 or 404
- **THEN** login status stays `pending` and polling continues at the server-provided interval

#### Scenario: Device login not available
- **WHEN** the user-code request answers 404
- **THEN** login fails with a message that device-code login is not enabled

#### Scenario: Expiry
- **WHEN** the code is not confirmed within 15 minutes
- **THEN** login status becomes `expired` and polling stops

#### Scenario: Cancel
- **WHEN** the owner cancels a pending login
- **THEN** polling stops, status becomes `failed` with a cancelled reason, and no tokens are stored

#### Scenario: Exchange is never repeated
- **WHEN** the code-for-token exchange fails or times out
- **THEN** login fails without sending the exchange request again

### Requirement: Login secrecy
Login status and results MUST contain only the flow id, verification link, one-time user code, expiry and a safe status message. Tokens, the device authorization id, the code verifier and the authorization code MUST NOT be returned, logged or shown.

#### Scenario: Status payload
- **WHEN** login status is read at any stage
- **THEN** the payload contains no token, device authorization id, code verifier or authorization code

### Requirement: Token storage and refresh
Codex tokens SHALL be stored encrypted per connection. An access token expiring within 60 seconds MUST be refreshed through the connection transport before use. Concurrent refreshes of one connection MUST result in one refresh request. A stale stored revision MUST NOT overwrite a newer one. A rejected refresh or a 401 MUST mark the connection as requiring login.

#### Scenario: Concurrent refresh
- **WHEN** two requests need a refreshed token at the same time
- **THEN** one refresh request is sent and both use the new access token

#### Scenario: Refresh rejected
- **WHEN** the refresh request is rejected
- **THEN** the connection test reports `unavailable` with reason `login-required`

#### Scenario: Logout
- **WHEN** the owner logs out
- **THEN** the stored tokens are deleted without any network request and the connection reports that login is required

### Requirement: Codex models and usage
The provider SHALL list visible models from the Codex models endpoint and SHALL report usage windows (used percent and reset time) from the Codex usage endpoint. The connection test SHALL report `available`, `unavailable` or `configured` with reason `login-required`.

#### Scenario: Usage windows
- **WHEN** usage is read for a logged-in connection
- **THEN** the report contains the primary and secondary windows with used percent and reset time

#### Scenario: Not logged in
- **WHEN** a connection without tokens is tested
- **THEN** the result is `configured` with reason `login-required` and no network request is sent

### Requirement: Codex streaming and compaction
The provider SHALL stream Responses API output as text, reasoning summary and tool call events. It SHALL create native compaction checkpoints. Both MUST go through the connection transport and the models inference entry point.

#### Scenario: Streamed reply with a tool call
- **WHEN** the backend streams text deltas, a function call item and a completed event
- **THEN** the result contains the text, the tool call with parsed arguments, usage and the finish reason

### Requirement: Independent Codex SDK execution
The Codex connection provider SHALL operate without legacy inference namespaces, legacy account routing or storage, agent-runtime types, or an installed Codex CLI. This independence MUST include its transitive protocol dependencies. Requests SHALL use only the resolved connection transport. Client version SHALL use a validated connection override or a documented SDK default, never local CLI discovery.

#### Scenario: Legacy runtime is unavailable
- **GIVEN** an authorized Codex SDK connection and no legacy inference namespaces or CLI
- **WHEN** the client lists models, reads usage, streams or compacts through the SDK
- **THEN** the operations use only SDK-owned behavior and independent infrastructure, with network requests through the connection transport

#### Scenario: Client version selection
- **WHEN** a connection has a valid client version override
- **THEN** requests use that override
- **AND** a connection without an override uses the documented SDK version without executing local commands

### Requirement: Codex request behavior parity
For equivalent prepared SDK inputs, the Codex provider SHALL preserve the established Responses protocol behavior for instructions, messages, attachments, tool schemas, tool results, reasoning and native checkpoints. Session context construction SHALL remain the caller's responsibility. Behavioral fixtures MUST be executable without loading the legacy runtime.

#### Scenario: Prepared tool conversation
- **WHEN** a client streams prepared instructions, user messages, a function call, its result and tool schemas
- **THEN** the request preserves their ordering and identifiers, uses the Responses function format, disables storage, enables streaming and enables parallel tool calls when tools are present

#### Scenario: Malformed tool arguments
- **WHEN** a completed function call contains invalid JSON arguments
- **THEN** its arguments are represented as an explicit parse failure for downstream validation rather than silently treated as valid empty arguments

### Requirement: Independent prompt cache identity
Codex streaming SHALL use an explicit prompt cache key when supplied, otherwise the current session identifier. Correlation headers MUST identify the current session independently of that key. The provider MUST NOT discover lineage or read agent state. This requirement does not change model-discovery caching.

#### Scenario: Related sessions share a prefix
- **GIVEN** two sessions with inherited history and the same caller-supplied prompt cache key
- **WHEN** they stream
- **THEN** their requests share the prompt cache key while retaining distinct session correlation identifiers

#### Scenario: Independent session and backwards-compatible omission
- **WHEN** a session omits the prompt cache key
- **THEN** its own session identifier is used for the cache key and correlation, without looking up a parent

### Requirement: Turn-scoped sticky routing
Codex streaming SHALL capture the first nonempty `x-codex-turn-state` response header of a logical run and expose it as opaque scoped SDK state. Subsequent requests in that run SHALL replay it. State MUST NOT leak across runs, sessions or connections or be stored in an unbounded global provider cache.

#### Scenario: Tool continuation within one run
- **GIVEN** the first request returned a turn-state token
- **WHEN** the caller submits a tool result with that scoped state in the same run
- **THEN** the next request includes the token in `x-codex-turn-state`
- **AND** a later response token does not replace the run's first token

#### Scenario: Fresh run or absent token
- **WHEN** a new run begins, or no response token has been received
- **THEN** no previous run's turn-state header is sent

#### Scenario: State belongs to another context
- **WHEN** a client submits state bound to a different connection, session or run
- **THEN** the SDK rejects the mismatch before network access

### Requirement: Capability-aware Codex reasoning
Codex requests SHALL use SDK-resolved reasoning capabilities rather than legacy model routing. Automatic or omitted preference SHALL resolve to the declared model default; supported preferences SHALL be preserved. Unsupported preferences SHALL fall back to the nearest supported level at or below the requested level, otherwise the lowest supported level above it. A resolved off preference SHALL become wire effort `none`; unresolved `auto` MUST NOT be sent.

#### Scenario: Automatic reasoning
- **GIVEN** a model with SDK default medium
- **WHEN** the caller omits effort or requests auto
- **THEN** Codex receives medium reasoning and automatic reasoning summary

#### Scenario: Off is supported
- **GIVEN** a model supporting off
- **WHEN** off is requested
- **THEN** the request uses wire effort none

#### Scenario: Off is unsupported
- **GIVEN** a model whose lowest supported level is low
- **WHEN** off is requested
- **THEN** low is applied without overwriting the caller's original preference

#### Scenario: No trustworthy capability information
- **GIVEN** neither validated model metadata nor a documented SDK profile defines reasoning behavior
- **WHEN** reasoning normalization is required
- **THEN** the SDK returns an explicit capability-unavailable failure before inference rather than sending auto or guessing a level

### Requirement: Portable native compaction checkpoints
Codex compaction SHALL return a typed SDK-native encrypted checkpoint that can be serialized, restored and supplied in subsequent SDK input at the intended history boundary without legacy transcript metadata. Requests SHALL retain the native compaction trigger, manual standalone memento metadata, disabled parallel tools and medium reasoning. The caller owns persistence and selection of retained history; the provider MUST NOT read or mutate agent transcripts.

#### Scenario: Compact and continue
- **WHEN** a client compacts a transcript, serializes and restores the returned SDK checkpoint, and supplies it before retained messages to streaming
- **THEN** the request contains the native compaction item at that boundary followed by retained messages
- **AND** encrypted content is not converted into visible prose or legacy session records

#### Scenario: Invalid checkpoint response
- **WHEN** compaction returns multiple checkpoint items, no item, empty or non-string encrypted content, or lacks completed response identity
- **THEN** compaction fails without exposing an apparently successful checkpoint

#### Scenario: Invalid checkpoint input
- **WHEN** a client supplies a malformed checkpoint or one bound to an incompatible provider, connection or model
- **THEN** the SDK rejects it before inference without echoing encrypted content into diagnostics

### Requirement: Codex failures and observations
Codex operations SHALL return SDK-native failure classifications and token usage independently of legacy workers and telemetry. Token usage and quota-window observations MUST remain distinct. A 401 SHALL require login; quota exhaustion, transient throttling and transport ambiguity MUST be distinguishable. An incomplete or failed stream MUST NOT be represented as a successful completed reply. Provider inference MUST NOT retry internally after uncertain acceptance.

#### Scenario: Usage and quota are both returned
- **WHEN** a response reports input, output and cached-input tokens together with quota observations
- **THEN** token counters are preserved separately from quota windows without an additional usage request or a legacy recording call

#### Scenario: Authentication rejection
- **WHEN** the backend returns 401
- **THEN** the SDK reports login required, marks the connection accordingly and does not repeat inference

#### Scenario: Quota versus temporary throttling
- **WHEN** structured backend information identifies either exhausted quota or transient throttling
- **THEN** the SDK preserves that distinction and available retry timing without treating every 429 as exhausted quota or automatically retrying

#### Scenario: Ambiguous interrupted stream
- **WHEN** a connection closes before a terminal response after request acceptance is possible
- **THEN** the SDK reports uncertain acceptance and unsafe automatic replay, without making a second inference request

### Requirement: Codex parity acceptance evidence
Acceptance of Codex SDK parity SHALL include deterministic protocol and architecture tests and a separately authorized live comparison of independent old and new clients. Offline results alone MUST NOT establish full acceptance. Live comparison MUST use isolated sessions and explicitly approved account or connection, model and request or token budget, without changing user conversations or exposing credentials.

#### Scenario: Required live sequence
- **WHEN** an authorized live comparison is performed
- **THEN** both clients are exercised for a normal response, tool continuation, native compaction and a response after checkpoint restoration on the same model and comparable account conditions
- **AND** the report records request conditions, input tokens and reported cached-input tokens separately from correctness findings

#### Scenario: Cache metrics are inconclusive
- **WHEN** cached-input counters are absent or zero
- **THEN** the report states that cache effectiveness is unconfirmed rather than claiming a cache-hit improvement or requiring numerical equality between nondeterministic backend runs

#### Scenario: Live environment is unavailable
- **WHEN** authorization, credentials or the permitted test environment are unavailable
- **THEN** the live acceptance task remains incomplete and offline test success is not reported as full parity acceptance
