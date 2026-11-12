# llm-model-cache Specification

## Purpose
Keep each model connection's discovered model list in a persistent, non-expiring cache that is refreshed only on demand or by the hourly background refresh.

## Requirements

### Requirement: Persistent model list cache
The models module SHALL store each connection's discovered model list in Postgres together with the time it was fetched. The cache MUST NOT expire. Listing models without a refresh request MUST return the cached list without network access; the provider MUST be asked only on an explicit refresh or when nothing is cached. Writing the cache MUST NOT change the connection's `updatedAt`.

#### Scenario: Cached list served offline
- **WHEN** a connection has a cached list and models are listed without refresh
- **THEN** the cached list and its fetch time are returned and the provider is not called

#### Scenario: Failed refresh keeps the cache
- **WHEN** an explicit refresh fails
- **THEN** the previous cached list is returned with a safe error message and stays stored

#### Scenario: Nothing cached
- **WHEN** a connection has no cache and its provider supports discovery
- **THEN** the provider is asked and the result is stored; on failure the manual model ids are returned

### Requirement: Hourly background refresh
The models module SHALL refresh the cached lists of all enabled connections whose provider supports discovery every hour while the server runs, and SHALL allow disabling this with `MODELS_REFRESH=off`. Failures MUST be reported without secrets and MUST keep the previous cache.

#### Scenario: Hourly refresh
- **WHEN** an hour passes after start
- **THEN** every enabled discoverable connection's cache is refreshed and failures are logged
