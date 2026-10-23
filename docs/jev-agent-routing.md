# Advisory executor recommendation

This opt-in feature recommends among **existing, nonarchived direct team children**. It does not discover other agents, create a team, send messages, start work, or delegate. Its result is a snapshot, not permission to act; membership and availability can change after scoring.

Enable **Jev executor recommendation** in the calling agent's Settings only after accepting the disclosure. The per-agent `jevAgentRoutingEnabled` flag defaults to false and is independent of Function RAG, reranking and context filtering. Old settings forms preserve the flag. No provider request occurs while disabled.

Invoke explicitly in that agent's session:

```ts
await ctx.fns.agent.recommendExecutor({
  task: 'Review the TypeScript changes for correctness',
  allowedIds: ['existing-child-id'],
});
```

`allowedIds` is required: 1–20 entries, each a nonempty string at most 128 characters. Repeated IDs are deduplicated. All distinct IDs must be eligible direct team members of the current caller. No arbitrary caller/parent agent parameter is accepted. Missing or duplicate membership rows and empty or identical bounded titles abstain. Task text must be nonempty and at most 4000 characters; overlong tasks are rejected, not silently truncated.

## Data sharing

The configured Jev provider receives task text and titles of the selected eligible children, each title limited to 240 characters. **Titles are not necessarily public.** Do not include sensitive material in task text or selected titles unless approved for this provider. Actual child IDs are replaced with opaque option IDs. Child transcripts, plans, summaries, system prompts and credentials are neither read nor sent. Titles are the only role evidence in this first stage; explicit public role descriptions are not yet a separate field.

## Results and limits

The return contains an exact allowed `id` or `null`, `abstained`, `reason`, valid confidence/probabilities, provider usage when available, and wall-clock `latencyMs`. An explicit abstain option is always offered. Unknown choices, malformed/out-of-range probabilities, non-normalized distributions, low confidence (below 0.6), ties and unavailable providers abstain. Valid probability keys are mapped back to agent IDs; `__abstain__` denotes the abstain probability.

Transport uses a 2800 ms timeout with no retries; a 2900 ms race additionally bounds waiting on the provider. Database/caller lookup time is included in reported wall latency but is outside that provider deadline. No raw provider errors are returned or logged. Malformed replies return no provider metrics; valid low-confidence or tied replies retain usage. No automatic routing instructions are added to agent prompts. The caller must separately decide what to do and revalidate current membership before acting.

Tests use mocked providers only; there is no live paid-call test or default opt-in.
