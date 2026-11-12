## MODIFIED Requirements

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
