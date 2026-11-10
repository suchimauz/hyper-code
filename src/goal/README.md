# Goal runtime — integration in progress

> **Current status:** the stage-one notes below are historical, not a description of all current code. Accounting, worker admission, descendant authorization, Stop, failure finalization, request context, and manual fork hooks have since been connected. The feature remains disabled by default. Native model tools and full resume scheduling are not available; descendant grant renewal and real isolated PostgreSQL verification are still in progress. Do not infer production readiness from passing mock tests, and do not apply global migrations as part of a test run.

## Historical stage-one baseline

Disabled by default via `goal.enabled`. No native model tools, scheduler hooks, UI changes or legacy replacement are installed. Do not enable for production lifecycle use yet. `read` returns `{enabled:false}` without accessing the new tables; enabled absence is `{enabled:true,goal:null}`. Mutation APIs reject disabled use.

## Internal contracts

All mutations require agentId, expectedGoalId and expectedRevision. Null/null asserts absence. `persist` acquires the owner's `agents FOR UPDATE` lock inside `procs.db.transaction`, reads current state, applies `transition`, then writes the state and audit together. **Every future goal writer, including accounting, must acquire this same owner lock**. The UPSERT relies on this single-writer protocol. Identity plus revision guards clear/recreate ABA; audit survives goal clear. No method writes `agents.goal` or `next_run_at`.

- `modelCreate`: objective, optional tokenBudget, trusted runToken and maxTokenBudget. Reject unfinished goal; complete replacement gets fresh identity and zero usage. Omitted/null budget inherits non-null host cap; above-cap request rejects.
- `modelUpdate`: complete/blocked/paused only, trusted runToken. The model itself must not supply runToken/cap/CAS: future tool integration injects them from authoritative runtime state. These internal procedures are not an authorization boundary against arbitrary trusted eval.
- `externalSet`: optional objective/status/budget; preserve omitted fields, identity, usage and createdAt. Null budget removes the cap. Host model-create cap does not constrain this API.
- `clear`: deletes current row, not complete. Does not cancel a process.
- `transition`: pure validation and normalization; Unicode objective limit is 4000 code points; counters are JS-safe integers. Exhausted active becomes budget_limited; existing budget_limited outranks pause/block, but not complete.

Model writes reject stale tokens, non-running owners and archived owners. Stop-first is serialized by the same owner lock and run_token/run_state updates. Stopped_at alone is not used to reject resumed work.

## Migration is a definition, not applied

`$migration_20350101000000_goal_core.ts` defines agent_goals, goal_transition_events and goal_legacy_snapshots in one transaction. Original legacy JSONB is copied without rewriting agents.goal, starting work or inventing a status conversion. **Paused legacy import is deferred**; snapshot-only is deliberately narrower than the full implementation plan. Goal IDs are not globally unique: a future fork snapshot must be allowed to preserve identity on a different owner.

Do not invoke global migrate.up casually: it applies all pending migrations, including unrelated working-tree migrations. This stage neither ran it nor enabled the gate.

## Verification and remaining integration

`bun test --config .mauzcode/tmp/dyv/unit-bunfig.toml ./src/goal/core.test.ts` (config `[test]\npreload=[]`): 25 tests, 60 assertions, no database. Runtime docs strict/typecheck validation passed for all eight functions. Mock fixtures test disabled/no-table access, owner lock ordering, stale run/Stop/archive, audit rollback, CAS, and isolation from simulated legacy overwrites. They do **not** prove SQL engine behavior, actual session.save integration, real concurrent transactions or migration execution.

Remaining: isolated Postgres DDL/concurrency tests, persisted continuation deferrals and fork barriers, idempotent usage checkpoints/accounting, lifecycle admission/worker integration, tool wrappers, model instructions/provenance, UI and legacy import/cutover. Fresh blocked audit remains an instruction to the model, not a claimed mechanical authorization check. No end-to-end Codex parity is claimed.
