# Live acceptance — SDK run (partial)

Authorization: user approved in chat ("можно погонять на модели luna"). Codex connection `su4imauz`
(fa626199…), transport ssh-tunnel `aeza-criminal-amarant`, model `gpt-6-luna`, version 0.157.1.
No explicit token budget was given; the run used 5 small requests (~370 input / ~110 output tokens).
Isolated session id `parity-live-*`; no user conversation was touched. SDK client only.

| Step | ms | Result | in/out/cache-read tokens |
| --- | --- | --- | --- |
| plain (low) | 1732 | "PONG", stop | 23 / 6 / 0 |
| tool call (off→low fallback, runId) | 1958 | get_time {tz:"UTC"}, turn-state received | 62 / 18 / 0 |
| tool continuation (state replayed) | 1871 | "It's 12:00 UTC.", stop | 95 / 12 / 0 |
| compact | 3282 | one compaction item (2148 B), response id, checkpoint envelope | 93 / 63 / — |
| checkpoint replay (JSON round trip) | 1767 | "12:00 UTC." — context preserved | 92 / 9 / 0 |

Quota came from response headers: primary 57% used, window 10080 min. The secondary window was reported.
Discovery reported no reasoning levels for gpt-6-luna, so profile codex-2026-07 applied (off → low).
Cache metrics: cache_read 0 on all steps. The prompts were below the cache threshold, so this
evidence is **inconclusive** for cache effectiveness. It is not evidence of a cache regression.

Still open: 6.2 comparison against an independent legacy client, cache evidence on prompts large enough to be cached, and an explicit budget.
