# Per-agent Jev context filtering

Enable **Jev context filtering** in the agent's Meta → Settings panel. It is independent of Function RAG, off by default, and opt-in for each agent. Turning it on sends the latest user request and excerpts of old tool outputs to the configured Jev endpoint. This is a paid external processing step, not local inference. Credential-pattern exclusions are best effort, NOT a guarantee of redaction; leave it off for sensitive work.

## Scope and safety

`agent.selectJevContext` runs inside `agent.buildLlmRequest` after repairing tool pairs, before attribution and attachment materialization. It changes only outgoing copies of textual tool-result bodies; it never deletes stored messages, call identifiers, call arguments, user/assistant messages or system instructions. Native structured tool content is not processed. Excluded-from-LLM records are not sent to Jev.

Only results older than the previous user turn and outside the six newest tool results are eligible. Results shorter than 1,000 characters, error/permission/credential-looking text, short user prompts (under 24 characters), user prompts over 2,000 characters and credential-looking user prompts are skipped. These conservative checks deliberately skip ambiguous confirmations such as “давай”.

A request contains at most 12 candidates with 600-character head and tail excerpts each, and at most 2,000 characters of the latest user request. The model is told to retain uncertain results. Only scores below 0.05 replace the body with an explicit omission notice. Kept results are verbatim. Excerpts can miss important material in the middle: this is lossy selection, not a guarantee of semantic preservation. It can also reduce prompt-cache effectiveness; savings in characters do not guarantee lower total cost.

At most one attempt per latest user turn in a live agent/saved scratchpad, with a 3-second timeout and zero retries. Successful omissions are keyed by tool-call ID and SHA-256 content digest. Changed outputs do not reuse old decisions. Errors or invalid/missing scores keep the original content; an unexpected filtering error also falls back in the request builder. Pending concurrent requests keep all content rather than waiting. This is not a durable billing quota across process crashes.

## Metrics and disabling

`agent.scratchpad.jevContextMetrics` holds status, candidate and omitted counts, savedChars, latencyMs, and provider usage. `cost: null` means unknown, not free. These are diagnostics, not a dollar-spend limit. The cache stores hashes and decisions, not result excerpts. Metrics are available to runtime inspection; no separate metrics dashboard is shipped in this first version.

Turn the toggle off to restore full outgoing content immediately; cached omissions are ignored while off. Persisted history is intact. This feature never authorizes actions or replaces permission checks.

## Verification

Mocked selection and request-builder tests cover off-by-default, no transcript mutation, tool pairing, protected recent results, content hashes, per-turn retries, timeout/invalid-answer fallback and sensitive/ambiguous-input exclusions. Live provider calls are intentionally not part of this feature's tests. Database-backed broader tests require the test database extensions (including vector); failures in that environment must not be presented as passing integration tests.
