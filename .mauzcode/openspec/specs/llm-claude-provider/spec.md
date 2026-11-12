# llm-claude-provider Specification

## Purpose
Connect a Claude subscription as a models connection: native PKCE login through the selected transport, encrypted rotating tokens, Claude Code-compatible requests, prompt caching, native compaction, usage and safe error classification.

## Requirements

### Requirement: Claude connection
The system SHALL provide a built-in `claude` provider for Claude subscriptions whose connections need only an account name, accept an optional client version override, and allow the direct, SOCKS proxy and SSH tunnel transports.

#### Scenario: Create through a proxy
- **WHEN** the owner creates a claude connection with a saved SOCKS proxy transport
- **THEN** the connection is stored without credentials and reports that login is required

#### Scenario: Invalid client version
- **WHEN** the client version override does not look like a version number
- **THEN** the connection is rejected with a validation error

### Requirement: Native PKCE login through the transport
Claude login SHALL use OAuth authorization code with PKCE and the same client, authorize URL, loopback redirect and scopes as the existing Claude login. The code SHALL arrive via an optional loopback callback or pasted input; a busy port MUST fall back to paste. The token exchange MUST use the connection transport. Login MUST NOT start a CLI or run SSH commands. A new start MUST cancel the previous pending login.

#### Scenario: Successful login over SOCKS
- **GIVEN** a claude connection with a SOCKS proxy transport
- **WHEN** the owner starts login, authorizes in the browser and submits the returned code
- **THEN** status becomes `succeeded`, tokens are stored, and the token exchange was sent through the proxy

#### Scenario: Loopback callback
- **GIVEN** MauzCode runs on the owner's machine and the callback port is free
- **WHEN** the browser is redirected to the callback with a valid code and state
- **THEN** login completes without pasting and status becomes `succeeded`

#### Scenario: Pasted callback URL
- **GIVEN** the callback port is busy or MauzCode runs remotely
- **WHEN** the owner pastes the callback URL from the browser address bar
- **THEN** the code and state are taken from the URL and login completes

#### Scenario: Waiting for the code
- **WHEN** login has started and no code was submitted yet
- **THEN** login status stays `pending`

#### Scenario: State mismatch
- **WHEN** the submitted code carries a state different from the pending flow
- **THEN** the submission is rejected, no exchange request is sent and the flow stays `pending`

#### Scenario: Expiry
- **WHEN** no valid code is submitted within 10 minutes
- **THEN** login status becomes `expired` and a later submission is rejected

#### Scenario: Cancel
- **WHEN** the owner cancels a pending login
- **THEN** status becomes `failed` with a cancelled reason, the verifier is discarded and no tokens are stored

#### Scenario: Exchange is never repeated
- **WHEN** the code-for-token exchange fails or times out
- **THEN** login fails without sending the exchange request again

### Requirement: Login secrecy
Login status and results MUST contain only the flow id, flow kind, authorization link, expiry and a safe status message. Tokens, the code verifier, the authorization code and the submitted redirect URL MUST NOT be returned, logged or shown.

#### Scenario: Status payload
- **WHEN** login status is read at any stage
- **THEN** the payload contains no token, code verifier, authorization code or submitted redirect URL

### Requirement: Token storage
Claude tokens SHALL be stored encrypted per connection. The stored expiry SHALL be the server `expires_in` minus 5 minutes. A login without a refresh token MUST fail. A stale stored revision MUST NOT overwrite a newer one.

#### Scenario: Logout
- **WHEN** the owner logs out
- **THEN** the stored tokens are deleted without any network request and the connection reports that login is required

#### Scenario: Missing refresh token
- **WHEN** the token exchange answers without a refresh token
- **THEN** login fails and nothing is stored

### Requirement: Rotating token refresh
An expired access token SHALL be refreshed through the connection transport before use. Concurrent refreshes of one connection MUST result in one refresh request. Because each refresh rotates the refresh token, the connection MUST be durably marked refresh-uncertain before the request is sent and cleared only after the new tokens are saved; a refresh whose outcome is unknown MUST NOT be retried and MUST require a new login.

#### Scenario: Concurrent refresh
- **WHEN** two requests need a refreshed token at the same time
- **THEN** one refresh request is sent and both use the new access token

#### Scenario: Refresh rejected
- **WHEN** the refresh request is rejected
- **THEN** the connection requires login and the test reports `unavailable` with reason `login-required`

#### Scenario: Refresh outcome unknown
- **WHEN** the refresh request was sent but the response was lost or unreadable
- **THEN** the request fails with code `OAUTH_OUTCOME_UNKNOWN`, no second refresh is sent, and the connection requires login

#### Scenario: Restart after an interrupted refresh
- **WHEN** the server restarts while a connection is marked refresh-uncertain
- **THEN** the next token request fails with `OAUTH_OUTCOME_UNKNOWN` without sending a refresh

### Requirement: Allowed Claude endpoints
The provider SHALL send requests only over https and only to `POST /v1/messages`, `POST /v1/messages/count_tokens`, `GET /api/oauth/usage`, `GET /api/oauth/profile` on the API base and `POST` to the OAuth token URL. Any other destination or method MUST be refused before sending. The API base SHALL default to `https://api.anthropic.com` and MAY be overridden by `CLAUDE_CODE_BASE_API_URL`.

#### Scenario: Unexpected destination
- **WHEN** a request to any other path or with another method is attempted
- **THEN** it fails with code `PROXY_CONFIG` and nothing is sent

### Requirement: Static model list
The provider SHALL return a static model list defined in code (the Claude ids of the existing subscription path) and MUST NOT call any API to list models. Availability on the owner's plan is checked only by inference.

#### Scenario: Model list
- **WHEN** models are listed for a claude connection, logged in or not
- **THEN** the catalogue from code is returned and no network request is sent

### Requirement: Usage and plan
The provider SHALL report the 5-hour and 7-day windows (`utilization` as used percent, `resets_at` as reset time) from the OAuth usage endpoint, and the plan (pro, max, team, enterprise) from the OAuth profile endpoint. A profile failure MUST NOT discard the usage windows. A usage answer without any window MUST be an error. The connection test SHALL check login via the usage endpoint.

#### Scenario: Usage windows
- **WHEN** usage is read for a logged-in connection
- **THEN** the report contains the 5-hour and 7-day windows with used percent, reset time and the plan

#### Scenario: Profile unavailable
- **WHEN** the profile request fails but usage succeeds
- **THEN** the windows are reported without a plan

#### Scenario: Not logged in
- **WHEN** a connection without tokens is tested
- **THEN** the result is `configured` with reason `login-required` and no network request is sent

### Requirement: Usage from response headers
After every successful inference response the provider SHALL record the `anthropic-ratelimit-unified-5h-*` and `anthropic-ratelimit-unified-7d-*` utilization and reset headers as the connection's current usage, without an extra request. A missing header MUST NOT be read as 0% used.

#### Scenario: Headers update usage
- **WHEN** a stream completes with unified rate-limit headers
- **THEN** the connection usage shows those windows without calling the usage endpoint

#### Scenario: Header missing
- **WHEN** a response lacks the 7-day utilization header
- **THEN** the 7-day window is not overwritten with 0%

### Requirement: Claude Code request headers
Every request SHALL carry bearer authorization and the user agent `claude-cli/<version> (external, sdk-cli)` (connection override or detected CLI version). Messages and compaction requests SHALL also carry `anthropic-version: 2023-06-01`, `x-app: cli`, `anthropic-dangerous-direct-browser-access: true`, a new `x-client-request-id` and the Claude Code betas. `x-api-key` MUST NOT be sent.

#### Scenario: Default betas
- **WHEN** no override is set
- **THEN** the betas are `claude-code-20250219`, `oauth-2025-04-20`, `fine-grained-tool-streaming-2025-05-14` and `interleaved-thinking-2025-05-14`

#### Scenario: User agent override
- **WHEN** `CLAUDE_CODE_USER_AGENT` is set
- **THEN** its value replaces the user agent

#### Scenario: Streamed request headers
- **WHEN** a stream request is sent for a claude connection
- **THEN** it carries all the headers above, a request id different from the previous request, and no `x-api-key` header

#### Scenario: Beta override
- **WHEN** `CLAUDE_CODE_ANTHROPIC_BETA` is set
- **THEN** its value replaces the default beta list

### Requirement: Claude Code system prompt
Requests SHALL place the system prompt exactly as the existing Claude subscription path does. For streaming, `system` SHALL be exactly `You are Claude Code, Anthropic's official CLI for Claude.` and the instructions (without a leading copy of that line) SHALL be sent as the first user message followed by the assistant acknowledgement `Understood. Ready to act.`. For compaction, `system` SHALL be a block list: the identity line, then the instructions as a second block when not empty.

#### Scenario: Streaming instructions in messages
- **WHEN** a stream request has instructions
- **THEN** `system` holds only the identity line and the first message is a user turn with the instructions

#### Scenario: Compaction instructions in system
- **WHEN** a compaction request has instructions
- **THEN** `system` has two text blocks: the identity line and the instructions

### Requirement: Compaction beta on replay
When the first content block of the first message is a compaction block, a stream request SHALL add the `compact-2026-09-04` beta.

#### Scenario: Replayed checkpoint
- **WHEN** a stream request starts with a compaction block
- **THEN** the beta list includes `compact-2026-09-04`

### Requirement: Native compaction
Compaction SHALL send a non-streaming messages request with betas `claude-code-20250219`, `oauth-2025-04-20` and `compact-2026-09-04`, `max_tokens` (default 32000) and `compaction: { type: "summarize" }`; a focus SHALL be wrapped into the handoff prompt as `compaction.instructions`. It SHALL return the signed block, stop reason and compaction-iteration usage, and MUST fail without a signed block.

#### Scenario: Compaction checkpoint
- **WHEN** compaction is requested for a transcript on a logged-in connection
- **THEN** the result contains the signed compaction block, stop reason and usage

#### Scenario: Focus
- **WHEN** compaction is requested with a focus
- **THEN** `compaction.instructions` holds the handoff prompt followed by the focus

#### Scenario: Empty result
- **WHEN** the response has no compaction block (cut off, refusal or overflow)
- **THEN** compaction fails with the stop reason in the message

### Requirement: Thinking and output limits
Messages requests SHALL set `max_tokens` to 16384 and `stream: true`. For reasoning effort `auto` no thinking field SHALL be sent. For low, medium, high or xhigh the request SHALL send `thinking: { type: "adaptive" }` and `output_config.effort` with xhigh mapped to `max`. For `off` the request SHALL send `thinking: { type: "disabled" }`, except for Claude 5 Opus and Sonnet models, where no thinking field is sent.

#### Scenario: High effort
- **WHEN** reasoning effort is `xhigh`
- **THEN** the body has adaptive thinking and effort `max`

#### Scenario: Off on Claude 5
- **WHEN** reasoning effort is `off` for a Claude 5 Sonnet or Opus model
- **THEN** the body has no thinking field

### Requirement: Prompt caching
Messages requests SHALL set two `cache_control: { type: "ephemeral" }` markers: on the last block of the instructions acknowledgement turn and on the last block of the transcript tail before transient guidance, so each request reuses the previous request's prefix.

#### Scenario: Cache markers
- **WHEN** a stream request with a transcript longer than the bootstrap is sent
- **THEN** exactly two content blocks carry an ephemeral cache marker

### Requirement: Stream parsing and usage
The provider SHALL emit text, thinking and tool argument deltas, collect tool calls, and map `end_turn`/`stop_sequence` to `stop` and `max_tokens` to `length`. Prompt tokens SHALL be input + cache read + cache creation tokens, preferring `message_delta` over `message_start`; cache read and write tokens SHALL be reported separately. Unparseable tool input SHALL become `{ __unparsed: <raw> }`.

#### Scenario: Streamed reply with a tool call
- **WHEN** the backend streams text deltas, a tool use block with partial JSON input and a message stop event
- **THEN** the result contains the text, the tool call with parsed arguments, usage with cache tokens and the finish reason

#### Scenario: Truncated tool input
- **WHEN** the stream ends with incomplete tool JSON
- **THEN** the tool call arguments are `{ __unparsed: <raw> }`

### Requirement: Stream failures
An `error` event inside the stream SHALL fail the request with the provider's classified error. A stream that ends without `message_stop` SHALL fail with a retryable connection-lost error. Malformed SSE data SHALL fail the request. Errors MUST NOT contain tokens.

#### Scenario: Stream cut off
- **WHEN** the transport closes before `message_stop`
- **THEN** the request fails with code `PROXY_CONNECTION_LOST` and is marked retryable

#### Scenario: Error event mid-stream
- **WHEN** the backend sends an `overloaded_error` event after some text
- **THEN** the request fails with the classified overload error, not as success

### Requirement: Error classification
HTTP errors SHALL be classified the same way as the existing Claude subscription path. Only an explicit quota signal (`usage_limit_reached`, `usage_not_included`, `quota_exceeded`, `credits_depleted` or a usage-limit message) SHALL produce a non-retryable `USAGE_LIMIT` with the reset time from the response or unified reset headers. A plain `rate_limit_error` SHALL be retryable throttling honoring `Retry-After`. 401 and 403 SHALL mark the connection as requiring login.

#### Scenario: Subscription exhausted
- **WHEN** the backend answers 429 with `usage_limit_reached`
- **THEN** the request fails with `USAGE_LIMIT`, not retryable, with the reset time

#### Scenario: Ordinary throttling
- **WHEN** the backend answers 429 with `rate_limit_error` and no quota signal
- **THEN** the request fails as retryable rate limiting with the `Retry-After` delay

#### Scenario: Unauthorized
- **WHEN** the backend answers 401
- **THEN** the connection requires login
