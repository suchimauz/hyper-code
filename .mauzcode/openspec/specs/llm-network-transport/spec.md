# llm-network-transport Specification

## Purpose
Provides one outbound HTTP entry point for providers that routes each connection's traffic directly, through a saved SOCKS5 proxy or through an SSH instance tunnel, reusing the existing proxy and SSH infrastructure.

## Requirements

### Requirement: Transport choice per connection
Each connection SHALL have exactly one transport: `direct`, `socks` with a saved proxy reference, or `ssh-tunnel` with a trusted SSH instance name; the transport MUST be one the provider allows.

#### Scenario: Transport not allowed by provider
- **WHEN** the owner selects `ssh-tunnel` for a provider that allows only `direct`
- **THEN** the connection is rejected with a validation error

#### Scenario: Unknown proxy reference
- **WHEN** the owner selects `socks` with a proxy id that does not exist
- **THEN** the connection is rejected with a validation error

#### Scenario: Untrusted SSH instance
- **WHEN** the owner selects `ssh-tunnel` with an SSH instance that is missing or has no pinned host key
- **THEN** the connection is rejected with a validation error

### Requirement: Routed provider requests
Providers SHALL send their HTTP requests through the core transport entry point, which applies the connection's transport.

#### Scenario: Request through SOCKS proxy
- **WHEN** a provider sends a request for a connection with a `socks` transport
- **THEN** the request is sent through the saved proxy with remote DNS resolution

#### Scenario: Request through SSH tunnel
- **WHEN** a provider sends a request for a connection with an `ssh-tunnel` transport
- **THEN** the request is sent through a pooled SSH SOCKS tunnel to that instance, and the tunnel lease is released when the response ends or is cancelled

### Requirement: No silent direct fallback
When a proxy or tunnel cannot be used, the request SHALL fail with an explicit transport error and MUST NOT be retried directly.

#### Scenario: Proxy unreachable
- **WHEN** the saved SOCKS proxy refuses the connection
- **THEN** the request fails with a transport error and no direct request is made

### Requirement: Safe destinations
The transport entry point SHALL accept only absolute http or https URLs without embedded credentials, and proxied transports MUST accept only https URLs.

#### Scenario: URL with credentials
- **WHEN** a provider passes a URL containing a username or password
- **THEN** the request is rejected before any network activity

#### Scenario: Plain HTTP through proxy
- **WHEN** a provider passes an http URL for a connection with `socks` or `ssh-tunnel` transport
- **THEN** the request is rejected with a transport error

### Requirement: Cancellation and deadlines
The transport entry point SHALL honour an abort signal and a total timeout for every transport.

#### Scenario: Caller aborts
- **WHEN** the caller aborts a request in progress
- **THEN** the request stops and its proxy or tunnel resources are released
