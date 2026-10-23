# Advisory evidence sufficiency

`ctx.fns.agent.assessEvidence({ task, evidence })` assesses explicitly supplied evidence through the configured Jev engine directly (`decision.engineJev`), independent of other decision routing. `abstain` is advice only: callers remain free to continue their normal workflow; this helper is not a blocking gate. It does **not** answer the task, authorize operations, run a tool, fetch a transcript, or write a message. Its result must never be used as approval to perform an action.

## Opt-in and disclosure

The exact persisted switch is `agents.jev_evidence_enabled`, a boolean defaulting to `false`. Only literal database `true` permits sharing; missing/archived agents, unavailable schema, and disabled flags abstain without contacting the provider. Caller identity comes exclusively from the injected session (`session.agentId` or `session.agent.id`); conflicting ids abstain. No caller-selected agent id is accepted.

**When enabled, the supplied task and evidence are sent to the configured external Jev provider.** Callers must disclose that sharing when enabling the feature and must not include secrets or context that should not leave the runtime. This function itself does not enable the flag.

## Input and output

- `task`: nonblank string, at most 4000 characters.
- `evidence`: at most 12 `{ id, text }` items, unique nonblank ids at most 80 characters, nonblank text at most 1200 characters each. Empty evidence is allowed but can never yield `answer`.
- Extra fields and oversized inputs are rejected, not silently truncated. No implicit transcript/history/context is added.
- Output: `decision` is `answer`, `search`, `read`, `clarify`, or `abstain`; `advisory` is always `true`. A machine-readable `reason`, `usage`, total `wallMs`, and nullable `providerLatencyMs` accompany every outcome.
- Reasons include `assessed`, `disabled`, `flag_unavailable`, `no_session`, `conflicting_session`, `invalid_input`, `malformed_response`, `uncertain`, `unsupported`, `timeout`, and `unavailable`.
- Unknown token usage or cost is `null`, never an invented zero. Available usage survives a rejected or uncertain provider decision.

The provider receives opaque option ids (`o0`–`o4`) and a fixed rubric: answer only when explicit evidence supports all necessary claims without gaps or contradictions; never invent facts. Task/evidence text is labeled untrusted, and embedded instructions to change the rubric or execute actions must be ignored. This mitigates prompt injection; it cannot prove the model's factual judgment correct. Consumers remain responsible for grounding any final answer and normal approval checks.

A valid five-option probability distribution and confidence in [0,1] are required. Both winning probability and confidence must be at least 0.85. Uncertainty and malformed results abstain. Provider timeout is at most 2800ms with zero retries; the complete operation races a 3000ms wall deadline. Late DB completion cannot start a provider request. An already-started provider request relies on the engine's own timeout; the outer wall deadline does not expose an abort controller. Late results do not change the returned result.

## Offline validation

`bun test ./src/agent/assessEvidence.test.ts` uses mocked DB and Jev only: no live provider requests, enabled persistent flags, migrations, or user messages. Tests cover bounds, flag gating, identity, opaque choices, untrusted input, uncertainty, malformed probabilities/confidence, usage preservation, and stalled DB/provider deadlines.
