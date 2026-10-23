# Jev agent advisories: rollout and use

Six independently enabled advisory functions are available. They are **explicit runtime calls**, not automatic steps in the agent loop. Turning on a switch only permits the corresponding call to use Jev. It does not dispatch tasks, change a model, read files, run tests, complete a plan, execute an action, or remove a human approval requirement.

## Enable one agent, one capability

1. Open that agent's Meta settings and locate the corresponding Jev switch.
2. Read the external-data disclosure. Supplied text goes to the configured Jev provider and can incur provider charges. Do not include secrets or material not approved for that provider. Unknown reported cost is not evidence of a free request.
3. Enable only the capability you intend to invoke. All six switches default to false and are independent of Function RAG, reranking and context filtering.
4. Call the function explicitly in that agent's session, supplying only the minimum approved data. Read the status/reason and handle abstention or fallback normally; do not retry indefinitely.
5. Turn the switch off to stop subsequent calls from invoking Jev. This is not cancellation of an already-started request.

No switches were enabled during implementation. Persistence and legacy forms preserve omitted switches. All six database columns are NOT NULL DEFAULT FALSE.

| Function | Per-agent flag | Scope and limitation |
| --- | --- | --- |
| `agent.recommendExecutor({task, allowedIds})` | `jevAgentRoutingEnabled` | Existing direct team children only; task and bounded titles; recommendation is a snapshot, not delegation or authority. |
| `agent.recommendModel({task, allowedModels})` | `jevModelRoutingEnabled` | Explicit configured destinations after policy checks. No automatic switch. Mandatory tools/vision/context/privacy requirements currently abstain because generic metadata cannot certify them. Catalog refresh may use network independently of Jev. |
| `agent.assessEvidence({task, evidence})` | `jevEvidenceEnabled` | Explicit evidence only; suggests answer/search/read/clarify or abstains. No tool execution or workflow blocking. |
| `agent.rankFileCandidates({task, candidates})` | `jevFileRankingEnabled` | Metadata only; sends basenames and descriptions, not file contents read from disk. Retains every exact supplied path; failure preserves order. Does not verify path existence or permissions. |
| `agent.reviewResult({task, criteria, evidence})` | `jevResultReviewEnabled` | Independent criterion judgments with a supplied evidence reference. Requires one decisive excerpt; does not establish truth or replace real tests. |
| `agent.reviewActionRisk({actionText, sideEffects, policyConstraints, policyDecision})` | `jevRiskReviewEnabled` | Additional caution only. Declared policy is not authorization; actual deterministic policy and human approvals remain mandatory. |

## Detailed contracts

- [Executor recommendation](jev-agent-routing.md)
- [Model recommendation](jev-model-routing.md)
- [Evidence sufficiency](agent-evidence-assessment.md)
- [File ranking](agent-file-ranking.md)
- [Result review](jev-result-review.md)
- [Action-risk review](jev-action-risk.md)

Each contract documents bounded inputs, external sharing, abstention/fallback, one-request/no-retry behavior, and returned usage/latency. Wall timers bound waiting, not guaranteed cancellation of underlying work. Models can make incorrect judgments despite valid probabilities; confidence is not proof.

## Verification record

The combined isolated mock suite passed **131 tests / 698 assertions across 16 files**. It covers the six functions, new persistence/legacy POST/UI settings, and existing context-filtering regressions. All six functions plus save/load/setAutomation/agentMetaSection passed strict documentation validation and typechecking; types and HTTP routes were regenerated/reloaded without restarting. Live DB inspection found zero enabled agents for each of the six flags.

These are offline correctness checks, **not live-provider quality or cost benchmarks**. No paid pilot was run for this rollout. Full DB-backed integration coverage is not claimed: existing integration runs were blocked by environment/setup timeouts and missing vector support. Global code quality remains non-green with eight unresolved calls in unrelated myhealthGaps, circleback and tunnel code. The six explicit-call APIs also receive static dead-code warnings because they have no automatic production call sites; this is consistent with the documented manual invocation, not evidence of automatic integration. Existing unrelated changes were left intact. No commit or push was performed.
