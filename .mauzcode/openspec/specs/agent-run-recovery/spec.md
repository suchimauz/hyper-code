# agent-run-recovery Specification

## Purpose
Defines how in-flight agent runs are owned by a server process, how runs left behind by a process that is gone return to the queue as soon as another process takes the agent worker lock, and how the heartbeat lease remains the fallback for hung or owner-less runs.

## Requirements

### Requirement: Runs record their owning process

Every agent run claim SHALL record the identifier of the server process instance that claimed it. A process SHALL keep one instance identifier for its whole lifetime, including hot reloads of the agent module, and SHALL never reuse the identifier of another process.

#### Scenario: Worker claim records the owner
- **WHEN** the worker claims an idle agent for a run
- **THEN** the agent's run state is `running` and its recorded run owner equals the claiming process's instance identifier

#### Scenario: Direct follow-up claim records the owner
- **WHEN** a parent agent asks a delegated child a follow-up question and the child is claimed for that run
- **THEN** the child's recorded run owner equals the claiming process's instance identifier

#### Scenario: Hot reload keeps the identifier
- **WHEN** the agent module is hot-reloaded inside a running process
- **THEN** the process keeps its instance identifier and its in-flight runs are not treated as orphaned

### Requirement: Only the worker-lock holder runs agents

At most one server process per database SHALL hold the agent worker lock, and only that process SHALL start agent runs. The database SHALL release the lock when the holder exits or loses its database connection, without any cleanup from the holder. A standby process SHALL take the lock over once it is released.

#### Scenario: Second process stands by
- **WHEN** a second process starts while another live process holds the worker lock
- **THEN** the second process does not claim or recover any runs and keeps waiting for the lock

#### Scenario: Killed holder releases the lock
- **WHEN** the holder is killed without running its shutdown hooks
- **THEN** once its database connection closes, another process can acquire the worker lock

### Requirement: Orphaned runs are recovered on worker-lock acquisition

When a process acquires the worker lock, at startup or on takeover, it SHALL return to the queue every `running` run whose recorded owner is another instance before claiming any new work, without waiting for the heartbeat lease. Recovery SHALL apply the same retry accounting as lease-based stale recovery.

#### Scenario: Run of a killed process is recovered immediately
- **WHEN** a process is killed while an agent run is `running` and a new process starts
- **THEN** the new process sets that agent back to `idle`, clears its run token and owner, and schedules a retry within seconds instead of after the 10-minute lease

#### Scenario: Standby does not touch the holder's runs
- **WHEN** a process starts while another live process holds the worker lock and owns a `running` run
- **THEN** that run keeps its state, token and owner

#### Scenario: Own runs survive lock re-acquisition
- **WHEN** the holder loses and re-acquires the worker lock while its own run is `running`
- **THEN** that run keeps its state, token and owner

#### Scenario: Legacy run without an owner
- **WHEN** a `running` run has no recorded owner
- **THEN** orphan recovery leaves it alone, and it is recovered only by heartbeat-lease expiry

#### Scenario: Retry limit still applies
- **WHEN** an orphaned run is recovered and its stale-recovery counter has already reached the retry limit
- **THEN** the agent is set to `idle` with no scheduled retry and an error stating that the automatic retry limit was reached

#### Scenario: Stopped agent is not rescheduled
- **WHEN** an orphaned run belongs to an agent that the user has stopped
- **THEN** the agent is set to `idle` without a scheduled retry

### Requirement: Heartbeat lease remains the fallback

Lease-based stale recovery SHALL continue unchanged: the lease duration stays 10 minutes, the heartbeat interval stays 30 seconds, and a `running` run whose heartbeat is older than the lease SHALL be recovered regardless of its recorded owner.

#### Scenario: Hung run in a live process
- **WHEN** a run's owning process is live but the run's heartbeat is older than 10 minutes
- **THEN** lease-based recovery returns the run to the queue as before
