# OpenCode Go and Console inference

Configure `llm.opencodeApiKey` with an encrypted secret reference. `llm.opencodePlan` selects **go** (subscription, `/inference/go`) or **payg** (credit-funded, `/inference`). The current user's choice is **Go**. No automatic switch between billing modes or fallback to another provider. `llm.opencodeInstance` is empty/local for direct access or the name of a pinned SSH instance. Keys travel in encrypted bridge input and are not persisted remotely.

## Routing and sessions

Official plan-specific endpoint tables are authoritative:
- https://opencode.ai/v2/docs/console/go#endpoints
- https://opencode.ai/v2/docs/console/models#endpoints

Each documented model routes to Chat Completions, Responses, Anthropic Messages or native Gemini. The public table is intersected with `/inference[/go]/v1/models`; its payload contains IDs, not efforts or quota. models.dev (`opencode-go` or `opencode`) supplies optional limits and reasoning metadata, never overrides the documented route. Missing optional metadata does not remove a documented model. Cache is scoped to plan and credential fingerprint. Connections has a force-refresh action.

Requests carry truthful User-Agent Hyper/OpenCode and stable `x-opencode-session`: agent ID for streaming conversations, explicit session ID or a UUID generated once before retries for standalone calls. No official-client impersonation. Go URLs cannot fall back to PAYG. Gemini streams at `:streamGenerateContent?alt=sse`; its adapter preserves native function calls, function responses and opaque thought signatures across tool turns. Hyper Node relaying of this mixed-protocol provider is not advertised; pinned SSH egress is supported.

Efforts come from metadata, not model-name guesses. `auto` omits settings because the upstream default is unknown. `none` maps to Hyper off; xhigh maps to max only when max is advertised without xhigh. The current picker cannot distinguish both xhigh and max as separate choices. Arbitrary thinking-token budgets are not exposed. Gemini thinking settings are emitted only for exact native metadata, not guessed from OpenAI effort names.

PAYG documented public chat rows are not blanket-hidden after one FreeTierError; actual service restrictions still apply. Public chat without a key requires a cached documented public model. Go always requires a key. SystemOne's non-chat question API remains outside the agent LLM interface.

## Usage

**Go:** no documented public endpoint for remaining subscription quota was found, and tested inference returned token counts but no quota headers. Desktop/mobile show OpenCode Go, quota unavailable and a Console link; never PAYG dollar budget or invented percentages. Go per-model allowances and extra-usage rules live in Console. Selecting Go does not enable paid overage in Hyper.

**PAYG:** `/console/api/v1/budgets/members` reports monthly member spend/cap, not prepaid credits. Only a single unambiguous row is displayed; member emails/IDs are never returned to UI. `limit=null` means no member spending cap, not unlimited funds. Public prepaid balance API was not found.

## Verification with the configured key

- Go catalogue: HTTP 200, 28 documented selectable routes at test time (counts may change).
- Go GLM Chat completion: HTTP 200, `OK`; also HTTP 200 through pinned SSH.
- Go Qwen Anthropic completion: HTTP 200, `OK`.
- Go GLM streaming: native echo function call parsed with `{text:"OK"}`; no real side-effect tool executed.
- Gemini Contributor native request reached the endpoint but was refused by the workspace privacy policy: allowing this model would permit training on request data. Privacy settings were **not** changed. Gemini JSON/SSE, tools, signatures and errors are tested with fixtures.
- Previous PAYG HTTP 402 was lack of PAYG funds, not evidence that the Go subscription was unusable.

References:
- https://opencode.ai/v2/docs/console/api/inference/
- https://opencode.ai/v2/docs/console/harnesses
- https://opencode.ai/v2/docs/console/api/budgets/
- https://models.dev/api.json
