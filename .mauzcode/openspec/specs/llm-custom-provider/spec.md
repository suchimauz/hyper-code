# llm-custom-provider Specification

## Purpose
Defines the built-in `custom` provider that connects any endpoint speaking one of the supported wire protocols, given an API URL, an optional API key and an optional network transport.

## Requirements

### Requirement: Custom connection fields
The `custom` provider SHALL accept an API base URL, an optional secret API key, a protocol (`openai-chat`, `openai-responses`, `anthropic` or `gemini`) and an optional manual model list, and SHALL allow every transport.

#### Scenario: Custom connection through a proxy
- **WHEN** the owner creates a custom connection with an https URL, protocol `openai-chat` and a saved SOCKS proxy
- **THEN** the connection is stored and all its requests go through that proxy

#### Scenario: Unsupported protocol
- **WHEN** the protocol value is not one of the four supported values
- **THEN** creation fails with a validation error

#### Scenario: Invalid base URL
- **WHEN** the base URL is not an absolute http or https URL or contains credentials, a query or a fragment
- **THEN** creation fails with a validation error

### Requirement: Protocol-specific authentication
The custom provider SHALL send the API key in the protocol's standard form: bearer authorization for both OpenAI protocols, the `x-api-key` header with an API version header for Anthropic, and the `x-goog-api-key` header for Gemini.

#### Scenario: Anthropic headers
- **WHEN** a request is made for a custom connection with protocol `anthropic` and an API key
- **THEN** it carries `x-api-key` and `anthropic-version` headers and no bearer authorization

### Requirement: Custom model discovery
The custom provider SHALL list models from the protocol's models endpoint and merge them with the manual model list; when discovery fails or is unsupported, the manual list MUST still be returned.

#### Scenario: Discovery succeeds
- **WHEN** the models endpoint returns a model catalogue
- **THEN** the listed models include the discovered ids and the manual ids without duplicates

#### Scenario: Discovery fails
- **WHEN** the models endpoint returns an error
- **THEN** the manual model list is returned with a discovery error flag

### Requirement: Custom connection test
The custom provider test SHALL request the models endpoint and, when the connection has a test model configured, send one minimal generation request in the selected protocol; the result MUST report `available` only when every attempted request succeeds.

#### Scenario: Models endpoint reachable, generation fails
- **WHEN** the models request succeeds and the minimal generation request returns an error
- **THEN** the test result is `unavailable` with reason `generation-failed`

#### Scenario: No test model
- **WHEN** no test model is configured and the models request succeeds
- **THEN** the test result is `available` with reason `models-ok`

### Requirement: Custom usage is status only
The custom provider SHALL NOT report quota windows or balance; its usage report MUST contain only the connection status.

#### Scenario: Usage of a custom connection
- **WHEN** usage is requested for a custom connection
- **THEN** the report contains status, reason and check time only
