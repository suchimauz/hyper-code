## ADDED Requirements

### Requirement: Optional inference operations
A provider definition MAY declare streaming and compaction operations that receive the resolved connection and a request, and send network traffic only through the connection's transport. The core inference entry point SHALL refuse a request with code `UNSUPPORTED` when the provider declares no such operation, without contacting the network.

#### Scenario: Provider without streaming
- **WHEN** a stream request targets a connection whose provider declares no streaming operation
- **THEN** it fails with code `UNSUPPORTED` and no request is sent

#### Scenario: Provider with streaming
- **WHEN** a stream request targets an enabled model of an enabled connection whose provider declares streaming
- **THEN** the provider's streaming operation receives the request and its normalized result is returned
