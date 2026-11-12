# Design

## Context

Run ownership lives on the `agents` row: `run_state`, `run_token` (fences writes), `run_started_at`, `run_heartbeat_at`, `stale_recovery_count`. `workerLoop` renews the heartbeat every 30 s. `recoverStaleRuns` reclaims runs whose heartbeat is older than `RUN_LEASE_MS` (10 min). A clean shutdown (`agent/$stop.ts`) hands its own runs back at once. A crash, `kill -9` or a supervisor timeout skips `$stop`, so those rows wait out the full lease.

There is already a single-worker fence. `holdWorkerLock` in `workerLoop.ts` reserves one pooled connection and holds `pg_try_advisory_lock(hashtext('mauzcode.agent.workerLoop'))` for as long as the process runs the worker. Other processes on the same database stand by and poll every 5 s. Postgres releases the lock when the holder's session ends, including `kill -9`. Runs are started by the lock holder: worker claims, and `agent.ask`, which is invoked as a tool inside a worker-driven run. `agent.message` only schedules the recipient (`deliverInbound` → `next_run_at`), and the worker then claims it.

Hot reload (`procs.repl.load`) does not rerun `$start`/`$stop`. State in `ctx.state` survives a reload.

## Goals / Non-Goals

**Goals:**
- Recover runs of a dead process within seconds of the next process taking the worker lock.
- Add no new long-lived database connection. Reuse the existing worker lock as the liveness signal.
- Reuse the existing stale-recovery retry accounting.

**Non-Goals:**
- Changing `RUN_LEASE_MS`, `RUN_HEARTBEAT_MS` or `MAX_STALE_RETRIES`.
- Early recovery of legacy rows with `run_owner IS NULL`.

## Decisions

### Liveness = the existing worker lock
Only the process holding the worker lock may own runs. So at the moment a process acquires the lock (the transition from "no lock" to "lock held", whether at startup or after a standby takeover), every `running` row whose `run_owner` differs from this process's id belongs to a process that no longer holds the lock. That process is dead, or its lock connection is lost and its writes are already fenced by `run_token`.

Alternatives considered:
- *A separate per-process advisory lock plus probing*: correct, but costs one more permanent connection per process and duplicates the existing fence.
- *An instance table with heartbeats*: needs its own expiry window, which brings back the delay.
- *Treat every running row as orphaned at startup*: unsafe while another live process holds the worker lock and this one is on standby. Tying recovery to lock acquisition avoids that.

### Instance id: random UUID per process
`agent.instanceId` lazily sets `ctx.state.agentInstanceId ??= crypto.randomUUID()`. A UUID never collides across restarts or containers. `??=` keeps the id through hot reloads, so a reload never makes the process's own runs look orphaned.

### Owner column: `agents.run_owner TEXT NULL`
This is a new migration. `claimOne` in `workerLoop.ts` and the direct claim in `ask.ts` set `run_owner`. A `BEFORE UPDATE` trigger clears `run_owner` whenever `run_token` becomes NULL, so every release path (finalize, park, stop, stale recovery, `$stop` hand-back, `ask`) is covered without touching each one. The column is also useful for diagnostics. `run_token` stays a per-run fencing token.

### Recovery pass on lock acquisition: `agent.recoverOrphanedRuns`
This is a new runtime function with opts `{ owner }`. `holdWorkerLock` calls it right after a successful `pg_try_advisory_lock`, before `workerPass` claims anything. It runs one `UPDATE … WHERE run_state='running' AND run_owner IS NOT NULL AND run_owner <> ? RETURNING …` with the same SET clause and post-processing as `recoverStaleRuns`: `stale_recovery_count + 1`, bounded backoff, no retry for stopped agents, `webPush.recordFailure` at the limit, abort of a live in-process agent, and `wakeWorker`. Only `last_error` differs: `orphaned run recovered (owner process gone); …`. Because the project forbids cross-file imports and `recoverStaleRuns` is a local helper, the function mirrors its SET clause and post-processing, and a comment ties the two together.

When the lock connection is lost and re-acquired by the same process, the pass runs again. Its own runs carry its own id and are skipped.

## Risks / Trade-offs

- [The old holder's lock connection drops while it lives (network blip), and a standby takes over] → The new holder recovers the old holder's runs. The old holder's heartbeat and finalize writes are fenced by `run_token`, and it already stops claiming once its lock check fails. Today the same takeover would leave those runs stuck for 10 minutes, so this is no worse.
- [A run started outside the worker by a non-holder process] → No such path exists today (`ask` runs inside worker runs). If one appears, its owner id differs from the holder's and a lock takeover would recover it. Documented as an invariant: only the worker-lock holder starts runs.
- [Test mode skips the worker lock] → Tests call `agent.recoverOrphanedRuns` directly.
- [Legacy rows without an owner] → Recovered only by the lease. This happens once, during the first deploy.

## Migration Plan

1. Deploy the migration (nullable `run_owner`, no backfill).
2. The new code records owners from the first claim onward.
3. Rollback: revert the code. The column is harmless, and the migration `down` drops it.
