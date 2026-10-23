# Advisory file candidate ranking

`agent.rankFileCandidates({ task, candidates })` ranks only explicitly supplied metadata. It does not discover, open or resolve files, run commands, or fetch network paths. Each candidate is `{ path, description? }`; pass 1–20 unique paths (1–1024 characters each), optional descriptions up to 1000 characters, and a nonempty task of at most 4000 characters. URL/UNC paths, control characters and directory-only labels are rejected. Input paths are opaque labels rather than filesystem assertions.

The current caller is resolved by `agent.current({})`. The durable, unarchived caller row must have `jev_file_ranking_enabled = true`. There is no caller ID override or implicit flag enablement. Missing schema or DB failures return `flag-unavailable`; disabled sessions never call Jev. Shared settings and migrations are managed separately.

## Privacy and interpretation

**Task text, basenames and explicit descriptions leave the process for the configured Jev service. Private filenames may leak sensitive information.** Directory prefixes are stripped from candidate paths locally, but paths or secrets embedded in task/description are not redacted. Omit descriptions unless they are deliberately approved metadata; do not pass file contents or secrets. Even basename-only relative paths are necessarily exposed as filenames. This function cannot certify provider retention/privacy.

One batch contains opaque `c0`…`c19` IDs and one `noul` relevance question per candidate. The response must include exactly these IDs, each with a finite probability in `[0,1]`. It cannot add paths. Only complete, valid scores change order; ties preserve input order. No candidate is dropped, and no relevance threshold mandates exclusion. Ranking is advisory, not permission to open files or execute anything.

The result contains `candidates`, ordered `scores` (or null), `fallback`, `status`, validated `usage` (or null), and elapsed `latencyMs`. Disabled, invalid input, incomplete/hallucinated output, provider errors and timeouts preserve the supplied candidate order. The whole operation has a 2800 ms wall deadline, with one provider call configured for 2800 ms and zero retries. The wall deadline stops waiting; the provider's transport timeout controls cancellation. Usage may be unknown on timeout. A DB operation that finishes after the deadline cannot initiate a provider call.

Run offline mocks with `bun test ./src/agent/rankFileCandidates.test.ts`. No paid call or real opt-in is required.
