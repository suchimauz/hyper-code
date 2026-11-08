# Advisory planning mode

Hyper planning is provider-neutral guidance, **not a sandbox or tool permission boundary**. Tool schemas remain unchanged. In plan mode the model is instructed to research, ask questions and propose an exact implementation plan without changing project files or taking external actions. Arbitrary eval/shell tools are still available: do not use this mode as a security guarantee. This is not Codex app-server `collaborationMode` support.

## Commands and state

- `/plan`: enable planning without a user turn or model request.
- `/plan <task>`: atomically enable planning and enqueue the task (without the slash prefix).
- `/plan off`: return to execute without enqueueing work; not approval of a pending proposal.
- Command-shaped unknown slash names return an explicit error; absolute paths such as `/tmp/file` remain ordinary text.
- Command attachments are rejected. Clients should supply a stable `requestId` or `Idempotency-Key`; retries of the same command return the recorded result. Reusing the key with different input returns 409.

The scope is one session. `agent_planning` persists mode/revision/latest proposal separately from `scratchpad.plan`. Missing state means execute. Reload/resume reads durable state. Forks copy only mode, never a pending review or approval. Mode is appended freshly to each provider request outside compacted history. The `session.plan` task tracker is not planning mode: its legacy autorun is suppressed in plan mode and its HTTP activation editor refuses activation until execute mode.

**MVP transition boundary:** commands and human review reject with `409 agent_running` when a run is active, claimed, or queued. Stop it first. There is no pending-mode queue, no cancellation of already executing tools, and no promise to preempt arbitrary in-process eval. `pending` is always null. Do not silently retry a rejected transition.

## Exact review

From a planning session call `await ctx.fns.planning.propose({plan: "complete exact plan text"})`. The plan is 1–50000 characters. A native `planning-review` input card and durable proposal are created; identical pending proposals are idempotent and revisions supersede earlier cards. End the model turn after proposing: review is rejected while it is running.

- **Approve and implement** binds proposal ID and displayed revision, switches to execute, and enqueues a new user turn containing the exact plan. It does not approve unrelated outward/destructive actions.
- **Keep planning** stays in plan without scheduling a model request.
- Generic `input.submit`, including cancel, cannot resolve a planning-review input. Ordinary chat replies, task tracker updates and peer messages do not change mode or approve a proposal.
- The browser controller requires the current authenticated HTTP request and CSRF. It uses transactional row locks and an open-input compare-and-set. Duplicate decisions do not enqueue twice; stale or cancelled reviews cannot approve.

This protects the normal product workflow, not against arbitrary code running with the server's privileges.

## HTTP contract

- `GET /commands` → `{version:1, commands:[{name,description,inputHint,attachments,usage}], csrfToken}`.
- `POST /agent/:id/commands` JSON `{text,requestId}` + `x-csrf-token` → `{ok,command,scheduled,planning,messageIdx?,sendAt?,attachments:[]}`.
- Existing `POST /agent/:id` text/form/multipart and mobile messages also dispatch slash commands. New-session bridge calls the same acceptance path; bare `/plan` does not start inference.
- `GET /agent/:id/planning` → `{version:1,agentId,mode,revision,scope:'session',advisory:true,runningPolicy:'reject',pending:null,proposal,csrfToken}`; `Cache-Control: no-store`.
- `proposal` is null or `{id,inputId,plan,status:'pending'|'approved'|'kept',createdAt}`.
- `POST /agent/:id/planning/review` JSON `{proposalId,decision:'approve'|'keep',expectedRevision}` + `x-csrf-token` → `{ok,planning,scheduled,duplicate?}`.

The command catalog is currently a core catalog with `plan` and `compact`, not an extensible plugin registry. New commands require a descriptor and parser/dispatch implementation.

Durable events `planning_mode` (`text,mode,revision`) and `planning_proposal` (`text,proposalId,inputId,status,revision`) invalidate UI state. They are included in mobile/web transcript serialization. Clients should refetch authoritative planning state, not infer approvals from event prose. Native review uses `/input/:id` but delegates to the same exact review controller rather than generic input submission.

## Shared compact command

`/compact [instructions]` calls the existing `agent.compactContext` engine outside the command claim/completion transactions. It does not enqueue a normal chat turn, but compaction itself can call an LLM summarizer. The existing mobile JSON compact endpoint and native compact popup use the same dispatcher. The native popup now waits for the shared command result instead of starting an independent fire-and-forget operation.

Command acknowledgements add `requestId`, `operationId`, `status` (`running`, `completed`, `failed`, `interrupted`), timestamps, and optional `result`/`error`. Concurrent same-key retries return HTTP 202 with `running`; terminal retries return the stored result without re-execution. Completed compact results contain the existing engine status (`compacted`, `not_needed`, `stale`). Legacy compact endpoints preserve engine `status` and expose lifecycle as `operationStatus`. Clients must supply a stable request key; callers omitting it get a new server-generated key and cannot deduplicate transport retries.

The running owner registry survives function hot reload within the server process. After process loss, replay of a running key marks it interrupted, never automatically repeats the engine. A different-key compact is rejected while a prior running claim exists; inspect/replay that original key first. This is an at-most-once acceptance workflow, not a durable background job executor.

Durable `command_invocation` and `command_result` events carry `commandName`, `commandText`, `argsText`, `requestId`, `operationId`, `status`, `text`, optional `result`/`error`. They have no message index and do not create user turns. A real `/plan <task>` user event additionally carries `command:{name,text,argsText,requestId,operationId}` while its model message contains only the task. Clients should highlight these structured fields, not parse arbitrary assistant prose. Native rendering shows the invocation token and a result disclosure; mobile/web event serialization preserves the metadata.

`bun test src/commands/compact.unit.test.ts` checks engine execution outside transactions, concurrent retries, terminal failure replay and orphan interruption.

## Verification

`bun test src/planning/planning.unit.test.ts src/agent/acceptMessage.atomic.test.ts 'src/api/$route_v1_agents_$id_events_GET.test.ts'` covers command parsing, toggle without queueing, mode/task atomicity, idempotency, running/queued conflicts, exact proposal/revision, duplicate approval, cancelled review CAS rollback, generic-submit rejection, request/CSRF checks, fresh prompt and fork mode-only semantics, and durable event visibility. Browser smoke should additionally exercise new-session `/plan`, reload of an exact proposal, Keep planning, and approval followed by a harmless text-only turn.
