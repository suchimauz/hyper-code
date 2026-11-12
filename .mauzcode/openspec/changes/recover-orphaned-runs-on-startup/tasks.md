# Tasks

## 1. Schema and ownership

- [x] 1.1 Add migration `src/agent/$migration_20370301120000_agent_run_owner.ts` adding nullable `agents.run_owner TEXT` plus a trigger that clears it whenever `run_token` is cleared (with `down`), run `procs.migrate.up`, and verify the column via `information_schema.columns`
- [x] 1.2 Create the per-process instance id as `agent.instanceId` (`ctx.state.agentInstanceId ??= crypto.randomUUID()`, lazy, no `$start` change) and verify it survives `procs.repl.load({ name: "agent" })`
- [x] 1.3 Record `run_owner` in `workerLoop` `claimOne` and in the `agent.ask` claim (clearing is done by the migration trigger); verify with a trigger test and with a workerLoop test asserting the owner is set on claim

## 2. Orphan recovery on worker-lock acquisition

- [x] 2.1 Keep lease recovery in `workerLoop.ts` untouched and mirror its SET clause and post-processing in `agent.recoverOrphanedRuns` (cross-file helpers are not allowed; a comment ties the two); verify `workerLoop.test.ts` passes unchanged
- [x] 2.2 Create `agent.recoverOrphanedRuns({ owner })` via `procs.dev.createFunction` using the shared helper; verify tests: foreign owner → idle with retry scheduled; own owner → untouched; `run_owner IS NULL` → untouched; retry limit reached → no retry and failure recorded; stopped agent → no retry
- [x] 2.3 Call it from `holdWorkerLock` right after a successful lock acquisition (not on every recheck), logging and continuing on error; verify by test or review that it runs once per acquisition and before the first claim
- [ ] 2.4 Run `runtime.docs.validate({ name, strict: true, typecheck: true })` for new/changed functions and `code.quality({})`; verify ok:true

## 3. Documentation and integration

- [x] 3.1 Update `docs/architecture.md` (Recovery table "Server restart" row, run-state columns with `run_owner`, invariant "only the worker-lock holder starts runs") and the `$stop.ts` comment; verify the doc describes recovery on lock acquisition and the unchanged 10-minute lease
- [x] 3.2 Integration check: set an agent to `running` with a fake foreign `run_owner` and a fresh heartbeat, trigger lock acquisition (restart, or release and re-acquire the lock), and verify the agent is `idle` with `next_run_at` within seconds

## Workflow follow-up

- Validate with `openspec validate recover-orphaned-runs-on-startup --strict`, then archive after merge.
