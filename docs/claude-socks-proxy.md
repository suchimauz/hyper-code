# Local Claude accounts through saved SOCKS5 proxies

Settings → LLM Connections → Claude → Add account supports CLI or managed OAuth on this machine. CLI remains the default without a proxy. Selecting a saved SOCKS5 proxy forces managed OAuth; SSH Instance login cannot use this local proxy registry. Browser authorization still uses the browser's own network. The UI never receives proxy credentials or OAuth tokens.

## Binding and deletion

`llm_account_proxies(provider,account,proxy_id)` is an immutable account binding. Its proxy foreign key uses `ON DELETE RESTRICT`; the OAuth slot foreign key cascades only when that credential is deleted. New credentials and their binding are saved atomically. Reconnect preserves the route. To change it, remove and add the account again; existing account-removal confirmation/agent checks still apply.

`socksProxy.remove` reports `409 PROXY_IN_USE` with safe account identities and does not delete the encrypted proxy secret. A pending new OAuth flow is not yet an account: deletion is permitted before completion, but completion then fails closed. Existing accounts migrate without bindings.

## Traffic and failure behavior

`llm.claudeFetch` is the single adapter for managed Claude inference, ordinary calls, native compaction, OAuth code exchange/refresh, usage/profile and local node relay. It resolves the saved route before every request. Missing storage/credentials or a required binding fails closed. It does not modify global proxy environment variables.

`socksProxy.connect/request` provide SOCKS5 remote DNS, optional RFC1929 authentication, verified TLS, bounded response buffers, cancellation and deadlines through response EOF. No redirects, transport retries or direct fallback occur. `sshProvider.request` retains the previous provider policy and loopback-only SSH route over this shared transport.

For proxy-bound accounts `llm.call` does not switch to a default account, alternate Claude provider or configured fallback model. Native compaction cannot use a fallback summarizer after a proxy failure. Node catalogues propagate only `noFallback:true`, never proxy details; safe proxy failures are returned as typed HTTP 502 errors. Update both node peers before using proxied accounts through a relay. Already-started responses are not replayed by the relay.

Transient `PROXY_DNS`, `PROXY_CONNECT`, `PROXY_TIMEOUT` and `PROXY_CONNECTION_LOST` use the existing retry policy, with a hard maximum of five retries after the original request even in Always mode. Smaller limits and zero remain effective. Existing retry-code configurations without proxy codes inherit TRANSPORT/TIMEOUT eligibility. Permanent configuration/auth/protocol/TLS/denial errors and cancellation do not retry. The transport and relay never create nested retry loops. Chat retains its durable retry counter and clears failed partial responses before resampling.

## OAuth rotation safety

Refresh is serialized per account in process and claimed durably under a database row lock using `refresh_uncertain`. A failure known to precede HTTP transmission releases that claim. If the provider may have consumed a rotating token, or saving the rotated token fails, the claim remains: subsequent requests fail with `OAUTH_OUTCOME_UNKNOWN` until a new OAuth authorization succeeds. A successful reconnect resets the marker. The old refresh token is never automatically replayed after an ambiguous outcome.

## Verification and rollout

Offline tests cover binding/secret atomicity, deletion races, SOCKS negotiation and TLS failures, cancellation/cleanup, all adapter destinations, OAuth rotation, no-fallback calls/compaction/node relay, truncated SSE and the five-retry ceiling. UI tests cover local/SSH selection, OAuth-only proxy login, reconnect and error presentation. No live Claude authorization or paid inference is needed for these tests.

Apply the additive migration before loading the new adapters/UI. Reload runtime modules/routes and rebuild the built-in React frontend. Do not revert to a version that ignores bindings while these accounts are in use: stop their use first; never remove bindings to restore direct access.
