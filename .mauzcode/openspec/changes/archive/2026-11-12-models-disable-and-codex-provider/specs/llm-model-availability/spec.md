## ADDED Requirements

### Requirement: Per-connection model disabling
The owner SHALL be able to disable and re-enable an individual model id of a connection. The disabled set MUST be stored durably with the connection, MUST be idempotent per model, and MUST NOT remove the model from the connection's model list. Model ids MUST be non-empty, at most 200 characters and contain no whitespace.

#### Scenario: Disable a model
- **WHEN** the owner disables model `gpt-5` of a connection
- **THEN** the connection reports `gpt-5` among its disabled models and the model list still contains `gpt-5` marked as disabled

#### Scenario: Disable twice
- **WHEN** the owner disables the same model twice
- **THEN** the model appears once in the disabled set and no error is raised

#### Scenario: Re-enable a model
- **WHEN** the owner re-enables a disabled model
- **THEN** the model is no longer in the disabled set and is no longer marked as disabled

#### Scenario: Invalid model id
- **WHEN** the model id is empty, contains whitespace or is longer than 200 characters
- **THEN** the request fails with a validation error and nothing is stored

### Requirement: Enforcement on every inference request
Every streaming or compaction request through the models inference entry point SHALL read the current stored state before contacting the provider. A disabled model MUST fail with the message `Model <model> is disabled by user`, code `MODEL_DISABLED_BY_USER`, marked not retryable. A disabled connection MUST fail with code `CONNECTION_DISABLED`. In both cases no provider request MUST be sent.

#### Scenario: Session already using the model
- **GIVEN** a session that has already made requests with a model
- **WHEN** the owner disables that model and the session makes its next request
- **THEN** the request fails with `Model <model> is disabled by user` and no provider request is sent

#### Scenario: Disabled connection
- **WHEN** a request targets a model of a disabled connection
- **THEN** it fails with code `CONNECTION_DISABLED` and no provider request is sent

#### Scenario: Re-enabled model
- **WHEN** the model is re-enabled and the session makes another request
- **THEN** the request is passed to the provider

### Requirement: Isolation from legacy model policy
Disabling a model of a connection SHALL NOT change the legacy disabled-model policy, existing model routes or agents.

#### Scenario: Legacy route unaffected
- **WHEN** the owner disables a model in a models connection
- **THEN** the legacy model list and legacy disabled-model policy remain unchanged
