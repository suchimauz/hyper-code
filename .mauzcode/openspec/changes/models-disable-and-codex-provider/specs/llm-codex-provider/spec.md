## ADDED Requirements

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
