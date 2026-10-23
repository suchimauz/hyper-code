# Advisory action-risk review

`agent.reviewActionRisk({ actionText, sideEffects, policyConstraints, policyDecision })` reviews only explicitly supplied, sanitized evidence. It resolves the current caller and checks `agents.jev_risk_review_enabled`; false/missing means no provider request. It does not change flags, call the described action, issue an authorization token, or replace permission checks.

**Privacy:** opting in sends the action description, effects, constraints and declared policy decision to the configured external Jev provider. Do not supply credentials, private records, transcript dumps or executable command payloads. This API cannot reliably detect or redact arbitrary secrets. Input is untrusted evidence, not instructions.

Inputs: nonempty `actionText` ≤4000 characters; explicit `sideEffects` and `policyConstraints` arrays each ≤16 nonempty items of ≤240 characters; `policyDecision` is `allow | confirm | deny | unknown`. Lists may be empty but absence of listed effects is not evidence of safety.

Output includes `status`, `risk` (`low | medium | high | unknown`), preserved `policyDecision`, `effectiveRequirement` (`policy-checks | human-review | deny`), `humanReviewRecommended`, fixed `reason`, nullable `confidence`, total `latencyMs`, sanitized nullable `usage`, and `externalTransfer` (provider invocation attempted, not proof of successful transfer). There is no allow/authorization output. The declared policy is not authoritative: downstream code must independently enforce its actual policy and approvals.

Deny always remains deny and bypasses Jev entirely. Confirm always requires human review. Unknown policy always requires human review. With the feature off, allow retains ordinary policy checks, but risk remains unknown/not-assessed. With review on, invalid inputs, provider failures, invalid distributions, low confidence, and timeouts raise human-review advice (never weaken deny). Medium/high/unknown risk raise caution. Low risk is neither a permission nor a safety guarantee.

At most one Jev request with zero retries and a timeout ≤2800ms. Total function wait also has a 2800ms deadline, covering caller/flag lookup. Timers run on the event loop, so heavy process blocking may delay delivery. Late results are ignored. The shared engine has no external abort-signal parameter: the deadline bounds waiting, not cancellation of underlying settings/network work; its own request timeout still applies. No free-form model rationale is returned. The normalized answer must have exactly four finite probabilities in [0,1], sum within 0.01 of 1, the selected label maximal, and both selected probability and confidence ≥0.7. The shared engine normalizes provider responses before these checks.

Tests are fully mocked and make no paid requests:

```sh
bun test ./src/agent/reviewActionRisk.test.ts
```
