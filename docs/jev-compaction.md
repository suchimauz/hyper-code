# Jev compaction preservation review

`jevCompactionEnabled` is an independent, default-off per-agent consent. It does not enable context filtering, change the compactor, or run any of the six explicit advisory tools. Enable **Jev compaction review** in Meta → Agent settings → Context preservation. Legacy automation forms preserve this flag when its presence marker is omitted.

When enabled, a text compaction candidate is reviewed before activation. One bounded Jev request checks preservation of decisions, constraints and unfinished work against eligible source excerpts and the retained tail. This is semantic preservation, not relevance to the latest question. It never deletes the stored transcript.

## Outcomes and limits

- A strong loss verdict rejects this candidate through the existing failed-compaction path; the previous active context remains. There is no automatic repair/rewrite loop.
- Provider errors, timeout and malformed scores fail open: normal compaction may proceed without a successful review.
- Native encrypted Codex checkpoints are opaque and are explicitly skipped. A checkpoint display label is not a summary. Enabling the flag does not replace native Codex compaction with a text summarizer.
- Review is limited to bounded readable user/assistant excerpts, not all source facts. Source tool results, system text and unreadable content are not checked for preservation. A successful review is not a guarantee that nothing was lost.
- The readable summary and the complete readable retained tail must each fit within 12000 characters; otherwise review is explicitly skipped. This conservative limit means many large coding conversations are not reviewable. Readable tool results in the retained tail count as preserved context and may be sent; opaque or structured tails are skipped.
- Cancellation, worker ownership and stale-transcript activation checks remain authoritative.

## Privacy and cost

Eligible source excerpts, the proposed readable summary and eligible retained-tail text (including readable tool results) are sent to the external configured Jev provider. This may cost money. Do not enable for content not approved for that provider. Redaction is best-effort, not a security boundary. The review makes one attempt without retries with a short deadline. Stored review metadata contains aggregate verdict, scope, character counts and provider usage, not source excerpts or raw provider error text.

Tests use mocked Jev responses. Installing or testing the feature does not require live Jev requests or a forced compaction.
