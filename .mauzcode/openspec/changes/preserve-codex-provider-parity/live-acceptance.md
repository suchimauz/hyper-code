# Live acceptance — Codex SDK vs legacy

Authorization: in chat, the user approved the `gpt-6-luna` model and a budget of about 200 000 tokens on the existing Codex connection
`su4imauz` (fa626199…, transport ssh-tunnel `aeza-criminal-amarant`). SDK version 0.157.1.
Both clients used isolated synthetic agents/sessions (`pl*`, `ps*`, `pr*`, `parity-live-*`). No user conversation and no
production agent was touched. Credentials, state tokens and checkpoint payloads are not recorded.
Total spent: about 155 000 tokens across 3 runs (smoke run about 0.5k, comparison about 108k, continuation re-check about 45k). This is within the budget.

## Comparison: same prepared payload (agent.buildLlmRequest + wireTools, 25 tools, ~11.3k prompt tokens), reasoning low

| Step | Legacy llm.* | SDK models.* |
| --- | --- | --- |
| plain | "PONG", 11306/6, cache 0, 1911 ms | "PONG", 11306/6, cache 0, 1982 ms |
| tool call | bash, 11321/20, cache 2944, 2682 ms (finishReason reported "stop") | bash, 11321/20, cache 2944, 3114 ms (finishReason "tool_calls") |
| tool continuation (turn-state replayed) | text answer, 11367/25, cache 2944 | 1st run: repeated bash call; re-check: 1 text answer, 1 repeated call; 11367 prompt tokens; turn-state kept |
| compact | 1 item (3172 B), response id, 8315/150, 4897 ms | 1 item (2788 B), response id, checkpoint envelope, 8288/121, 4086 ms |
| checkpoint replay | correct date recalled, 11466/23 | correct date recalled, 11437/26 |

Notes:
- Prompt token counts are identical for the same input (11306/11321/11367). Offline, `llm.toCodexInput` and `models.codexInput`
  produce byte-identical input for the prepared payload (tools, tool results, images).
- The tool continuation is nondeterministic at low reasoning: the model sometimes re-runs `date -u` on a fake tool result.
  The SDK returned both outcomes with the same prompt size. We read this as sampling variation, not a wire difference, but the sample is small.
- Legacy reports finishReason "stop" on a tool-call turn. The SDK reports "tool_calls". This is a deliberate SDK normalization.
- Cache: both clients read 2944 cached tokens on identical requests. In the re-check, the second run of the same SDK prompt cache key read
  11136 of 11321 tokens, so caching through `promptCacheKey` works. Cache reads depend on server routing and timing, so this is
  effectiveness evidence only and does not show that the two clients have equal hit rates.
- Quota windows came from response headers (primary 57%, 10080 min). The SDK made no extra usage request.
- Discovery reports no reasoning levels for gpt-6-luna, so profile codex-2026-07 applied (`off` → `low` with fallbackReason).

## Smoke run (SDK only, small prompts)
plain, tool call → continuation with turn-state, compact, JSON checkpoint round trip → replay: all correct; cache 0 (prompts under the cache threshold).
