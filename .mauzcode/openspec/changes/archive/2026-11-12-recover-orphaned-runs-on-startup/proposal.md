# Proposal

## Why

After a server restart (crash, kill, deploy without a clean `$stop`), agents that were running stay stuck in `running` for up to 10 minutes. Recovery waits for the run lease heartbeat to expire, even though the process that owned those runs is already gone. Users see frozen agents and cannot send new work to them until the lease expires.

## What Changes

- Each server process gets a unique worker instance id when it starts. Every run it claims (worker claim and `agent.ask`) records that id as the run owner.
- The existing single-worker Postgres advisory lock serves as the liveness signal, so no new connection is needed. Only the lock holder starts runs. When a process acquires the lock (at startup or on standby takeover), it immediately returns to the queue every `running` run owned by another instance. These runs no longer wait for the lease to expire.
- Recovered orphaned runs use the existing stale-recovery accounting (`stale_recovery_count`, bounded exponential backoff, retry limit, failure notification). A run that keeps crashing its process does not loop forever.
- The process's own runs are never touched. Runs with no recorded owner (claimed before this change) are still recovered only by the existing lease.
- The 10-minute lease (`RUN_LEASE_MS`), the 30 s heartbeat and `MAX_STALE_RETRIES` stay unchanged and remain the fallback.

## Capabilities

### New Capabilities

- `agent-run-recovery`: How in-flight agent runs are owned, how the system detects that their owning process has died, and how they return to the queue (startup recovery of orphaned runs plus the heartbeat-lease fallback).

### Modified Capabilities

None.

## Impact

- `src/agent/workerLoop.ts`: claim records the owner; worker-lock acquisition triggers the orphan recovery pass before the first claim.
- `src/agent/ask.ts`: its direct claim records the owner.
- `src/agent/$start.ts` / `$stop.ts`: create the instance id; hand-back clears the owner.
- New migration: `agents.run_owner TEXT` (nullable).
- `docs/architecture.md`: Recovery table and run-state columns.
- Tests: recovery tests for a foreign owner, the process's own owner and legacy rows without an owner.
