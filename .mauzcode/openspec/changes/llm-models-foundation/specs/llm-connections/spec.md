## Purpose

Stores and manages LLM connections — configured accounts of a registered provider — with stable identity, display names, secret handling, testing, model discovery and usage reporting.

## ADDED Requirements

### Requirement: Connection identity and account name
Each connection SHALL have a system-generated unique identifier and a required, non-empty display account name of at most 100 characters; account names MUST NOT be required to be unique.

#### Scenario: Two connections with the same name
- **WHEN** the owner creates two connections of the same provider both named `work`
- **THEN** both are stored with different identifiers and both are listed

#### Scenario: Empty account name
- **WHEN** the owner creates a connection with a blank account name
- **THEN** creation fails with a validation error and nothing is stored

### Requirement: Connection creation and validation
The system SHALL create a connection only for a registered provider, after validating fields against the provider schema and the provider's own validation, and only with a transport the provider allows.

#### Scenario: Unknown provider
- **WHEN** the owner creates a connection for a provider id that is not registered
- **THEN** creation fails with an unknown-provider error

#### Scenario: Missing required field
- **WHEN** a required field of the provider schema is missing
- **THEN** creation fails with an error naming that field

#### Scenario: Unknown field
- **WHEN** the submitted configuration contains a key not in the provider schema
- **THEN** creation fails with a validation error

### Requirement: Secret storage
Secret field values SHALL be stored in the encrypted secret store and referenced from the connection; connection reads MUST expose only whether each secret is set, never its value.

#### Scenario: Reading a connection with an API key
- **WHEN** a client lists connections
- **THEN** each secret field is reported as set or not set and no secret value appears in the response

#### Scenario: Keeping an existing secret on update
- **WHEN** the owner updates a connection without supplying a secret field
- **THEN** the stored secret is kept unchanged

#### Scenario: Clearing a secret
- **WHEN** the owner updates a connection explicitly clearing an optional secret field
- **THEN** the stored secret is deleted and the field reports not set

### Requirement: Connection removal
Removing a connection SHALL delete its record and all secrets it owns.

#### Scenario: Remove connection
- **WHEN** the owner removes a connection
- **THEN** it disappears from the list and its secrets no longer exist in the secret store

### Requirement: Enable and disable
A connection SHALL have an enabled flag; disabled connections MUST stay listed but MUST NOT perform network requests for tests, model listing or usage.

#### Scenario: Testing a disabled connection
- **WHEN** the owner tests a disabled connection
- **THEN** the result is status `disabled` and no network request is made

### Requirement: Connection test
The system SHALL test a connection by calling its provider's test operation and return a status of `available`, `unavailable` or `configured` with a machine-readable reason, a short safe message and the check time.

#### Scenario: Provider test fails
- **WHEN** the provider test throws or reports failure
- **THEN** the result is `unavailable` with a reason and a message that contains no secret values

### Requirement: Model listing
The system SHALL return a connection's models from the provider's model listing when it is implemented, and otherwise the models stored in the connection's configuration.

#### Scenario: Provider without model listing
- **WHEN** the provider does not implement model listing
- **THEN** the models configured manually on the connection are returned

### Requirement: Usage report with status fallback
The system SHALL return a standard usage report per connection: status, optional quota windows (label, used percent, remaining, reset time), optional balance and check time. When the provider does not implement usage, the report MUST contain only the connection status from a cached test.

#### Scenario: Provider implements usage
- **WHEN** the provider returns quota windows
- **THEN** the usage report contains those windows in the standard shape

#### Scenario: Provider without usage
- **WHEN** the provider does not implement usage
- **THEN** the usage report contains only status, reason and check time

#### Scenario: Cached status
- **WHEN** usage is requested twice within the cache period for an unchanged connection
- **THEN** the second request reuses the cached result without a new network request

### Requirement: Owner-only management API
Connection management over HTTP SHALL be available only to the authenticated owner; mutating requests MUST require same-origin, a valid CSRF token, a JSON content type and a bounded body size.

#### Scenario: Non-owner request
- **WHEN** an authenticated non-owner user calls the management API
- **THEN** the request is rejected with 403 and nothing changes

#### Scenario: Missing CSRF token
- **WHEN** a mutating request lacks a valid CSRF token
- **THEN** the request is rejected and nothing changes

### Requirement: Isolation from existing LLM routing
Creating, changing or removing connections SHALL NOT change existing model routes, accounts, agents or the existing LLM Connections settings.

#### Scenario: Existing agents keep working
- **WHEN** connections are created or removed
- **THEN** existing agents keep their models and their requests are routed exactly as before
