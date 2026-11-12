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
A provider definition MAY declare streaming and compaction operations that receive the resolved connection and a request, and send network traffic only through the connection's transport. The stream request SHALL carry the number of leading messages that form the cacheable prefix, and the stream result SHALL report cache read and cache write tokens when the provider returns them. The compaction request SHALL carry an optional focus and output token budget. The core inference entry point SHALL refuse a request with code `UNSUPPORTED` when the provider declares no such operation, without contacting the network.

#### Scenario: Provider without streaming
- **WHEN** a stream request targets a connection whose provider declares no streaming operation
- **THEN** it fails with code `UNSUPPORTED` and no request is sent

#### Scenario: Provider with streaming
- **WHEN** a stream request targets an enabled model of an enabled connection whose provider declares streaming
- **THEN** the provider's streaming operation receives the request and its normalized result is returned

#### Scenario: Cacheable prefix
- **WHEN** a caller passes the cacheable message count
- **THEN** the provider receives it unchanged and may place cache markers before transient guidance

#### Scenario: Compaction focus
- **WHEN** a caller passes a compaction focus and token budget
- **THEN** the provider's compaction operation receives them unchanged

#### Scenario: Cache write tokens
- **WHEN** a provider reports cache creation tokens
- **THEN** the stream result includes them as cache write tokens
