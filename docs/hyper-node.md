# Hyper nodes — sharing LLM access between Hyper instances

An instance keeps two independent sources of models:

- **own providers** — keychain logins, API keys, OAuth (as before);
- **nodes** — other Hyper instances that relay calls through *their* providers.

Both feed one catalogue, so a default model, a fallback chain or an agent may
mix them: `claude-code:claude-opus-5` (own) → `hyper/niquola:claude-opus-5`
(same model, via the node named `niquola`) → `hyper/niquola:gpt-5.4-mini`.
Every instance is a host and a client at the same time.

## Model grammar

`hyper/<node>:<model>` — provider `hyper`, account = node name, model id as the
node lists it. The node name is local (whatever the client called the
connection), so two clients may name the same host differently.

New catalogue IDs are `<provider>/<account>:<upstream-model>` (including
`default`). For example `hyper/mini6:codex/su4imauz:gpt-5.4-mini` and
`hyper/mini6:codex/NylahKamalii9806:gpt-5.4-mini` select different credentials,
not interchangeable copies of one model. The picker shows node → provider/account
→ model, with usage matched by provider and account. The relay removes the
routing prefix only at the final provider hop; chained hops retain it.
Legacy bare IDs remain accepted only when exactly one allowed catalogue entry
matches. Ambiguous legacy IDs fail closed: explicitly select an account rather
than silently switching credentials. Existing old-node bare catalogues still work.

## Wire protocol (host side)

The client builds the provider request **itself** (its own prompt, tools,
reasoning settings) using one of the three wire formats it already speaks; the
host only injects its credential and streams the answer back unchanged.

    GET  /node/v1/models          catalogue: [{ id, api, provider, account, kind, via? }]
    GET  /node/v1/usage           quota per provider the client may use
    POST /node/v1/anthropic       Anthropic Messages body
    POST /node/v1/responses       OpenAI Responses body (Codex)
    POST /node/v1/chat            OpenAI chat/completions body

Headers: `authorization: Bearer <client token>`, optional `x-hyper-hops`.
The body's `model` names the id from the catalogue; the host maps it to its own
provider, adds the credential and identity headers (Claude Code, Codex CLI), and
proxies the response 1:1 — status, streaming body, `retry-after` and
`*-ratelimit-*` headers — so the client's classifyError parks agents on a 429
exactly as with a native subscription.

Chaining: a host's catalogue may include models it gets from its own nodes
(`via: "hyper/<node>"`), relayed with `x-hyper-hops` incremented; a request
with hops ≥ 3 or one that would go back to the requesting client is refused.

## Access control (host side)

`llm_node_clients`: id, name, sha256(token), hint, allowed providers (empty =
all), created/last used/request count, revoked. The plain token is shown once
in a secure popup. Only loopback and Tailscale (100.64/10) callers, no
forwarded requests. The host logs client, model, status, duration and token
counts — never the prompt.

## Client side

`llm_nodes`: name, url, token (encrypted in local_secrets), enabled, last
catalogue and usage snapshot with fetch time. `resolveEndpoint` answers
`hyper/<node>:<model>` from the cached catalogue (`api`, `kind`), pointing at
`<url>/<api>` with the node token as bearer; the existing stream* functions
need no change. listModels merges node catalogues; listAccounts shows each node
as one row (usage from the node); the LLM page has "Add Hyper node".

## Context limits and compaction

Context limits use the enabled node's cached catalogue identity, not a regex over
an arbitrary nested model string. Canonical Codex routes and uniquely resolved
legacy routes use the same 272,000-token estimate as direct Codex. At the default
80% window fraction, the effective threshold is 217,600 tokens (or a smaller
configured absolute limit). Missing, inconsistent or ambiguous metadata is not
trusted. `compaction.contextWindow` and `compaction.resolve` are asynchronous.

Native Codex compaction uses the same Responses SSE request as direct Codex,
including `compaction_trigger`, through the existing authenticated
`/node/v1/responses` relay. It does not require a `/responses/compact` endpoint.
The client sends only its node bearer and canonical model; the host authorizes
its provider allowlist and exact account and injects upstream credentials.
Session and turn metadata survive chained hops. No local Codex credential is
read/refreshed for a node compaction request.

Opaque checkpoints replay only on the exact producing model route. Changing
node/account/model or switching direct↔node conservatively falls back to the
original transcript; opaque checkpoint compatibility across those boundaries is
not assumed. Generic text summaries remain portable. Non-Codex node compaction
currently uses the generic summarizer, not a native Anthropic checkpoint.

Compaction is not an absolute overflow guarantee: automatic checks happen after
a successful finalized turn, so a single very large input/tool result can exceed
the window first. Native Codex failures propagate without silently dropping
history. The generic summarizer retries recognized overflow errors by dropping
oldest history items (lossy); one oversized remaining item still fails. Unknown
overflow error wording is not retried. The original root transcript is preserved.
Mocked routing, threshold, checkpoint and overflow tests do not spend model quota;
a live native checkpoint generation must be separately authorized.


Cursor is direct-only: its local runtime cannot be transported over the node's
three supported wire APIs. Own and chained Cursor entries are excluded from the
node catalogue; stale Cursor routes are explicitly rejected by endpoint resolution.

