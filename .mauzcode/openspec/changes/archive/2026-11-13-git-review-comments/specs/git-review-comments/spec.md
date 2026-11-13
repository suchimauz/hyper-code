## ADDED Requirements

### Requirement: Comment anchors
The system SHALL allow a review comment to be anchored to a contiguous line range on one side (old or new) of either a commit diff or an uncommitted diff of the staged, unstaged or untracked group, and SHALL store a snapshot of the anchored line text. Comments on arbitrary ref ranges or on lines outside a diff SHALL be rejected.

#### Scenario: Comment on a commit diff
- **WHEN** the person selects lines 10–12 on the new side of a file in a commit diff and saves a comment
- **THEN** a comment is stored with scope commit, the full commit hash, the path, side new, lines 10–12 and the text of those lines

#### Scenario: Comment on an uncommitted diff
- **WHEN** the person comments on a line in the unstaged diff of a file
- **THEN** the comment is stored with scope worktree and group unstaged

#### Scenario: Invalid anchor
- **WHEN** a request has line_start greater than line_end, a path outside the repository, a missing commit hash for a commit anchor or an unknown group
- **THEN** the request is rejected with a 400 error and nothing is stored

### Requirement: Ownership and isolation
Each comment SHALL belong to exactly one non-archived agent and one repository identified by host and directory. The repository target SHALL be derived only from an open Canvas item of kind gitUi.repository owned by that agent, never from browser input. Comments of one agent SHALL NOT be visible to or modifiable by another agent.

#### Scenario: Foreign agent
- **WHEN** a request references an agent or Canvas item the caller does not own
- **THEN** it is rejected with 403

#### Scenario: Closed tab
- **WHEN** the Canvas item is closed
- **THEN** comment HTTP operations for it are rejected with 403

#### Scenario: Another agent on the same repository
- **WHEN** two agents have Git tabs for the same repository
- **THEN** each sees only its own comments

#### Scenario: Missing CSRF token
- **WHEN** a browser comment write lacks a valid CSRF token
- **THEN** it is rejected with 403 and nothing changes

### Requirement: Comment editing and limits
The person SHALL be able to create, edit the body of, and delete their comments. Bodies SHALL be 1 to 8 KiB, line snapshots and resolution notes at most 2 KiB, and at most 500 open comments SHALL exist per agent and repository.

#### Scenario: Limit reached
- **WHEN** 500 open comments exist and the person creates another
- **THEN** the request is rejected with 409 and a readable message

#### Scenario: Delete
- **WHEN** the person deletes a comment
- **THEN** it is removed permanently from all lists

### Requirement: Outdated working-tree comments
For worktree comments the system SHALL report a comment as outdated when the anchored lines in the current diff no longer match the stored snapshot or the file is no longer in that group. Outdated comments SHALL remain stored and visible with an Outdated badge. Commit comments SHALL never be outdated.

#### Scenario: Line edited after commenting
- **WHEN** the anchored line text changes in the working tree
- **THEN** the comment is listed as outdated and still shows its stored snapshot

### Requirement: Resolution lifecycle
A comment SHALL be open or resolved. Resolving SHALL record who resolved it (user or agent), when, and an optional note. Resolved comments SHALL disappear from the default Open list and appear under Resolved, and the person SHALL be able to reopen them.

#### Scenario: Agent resolves with a note
- **WHEN** the agent resolves a comment with the note "extracted helper"
- **THEN** the comment leaves the Open list, appears under Resolved with resolved_by agent and the note

#### Scenario: Reopen
- **WHEN** the person reopens a resolved comment
- **THEN** it returns to the Open list with sent cleared so it can be sent again

#### Scenario: Repeated resolve
- **WHEN** an already resolved comment is resolved again
- **THEN** the call succeeds without changing the original resolution

### Requirement: Explicit delivery to the agent
The system SHALL deliver comments to the owning agent only when the person activates Send. One send SHALL deliver all open, not-yet-sent comments for the agent and repository as exactly one chat message, wake the agent, and mark those comments sent atomically. Nothing SHALL be delivered automatically.

#### Scenario: Send batch
- **WHEN** three open comments are unsent and the person activates Send
- **THEN** the agent receives one message listing all three with path, lines, side, commit or group, quoted lines, body and id
- **AND** the three comments are marked sent

#### Scenario: Nothing to send
- **WHEN** all open comments are already sent
- **THEN** Send is disabled in the UI and a direct request returns zero sent without creating a message

#### Scenario: Delivery failure
- **WHEN** the message cannot be delivered
- **THEN** the comments remain unsent and an error is shown

### Requirement: Agent tools
The system SHALL expose native agent tools gitReviewComments, listing the calling agent's comments for its repository with a status filter (default open) and optional path filter, and gitResolveComment, resolving one of the calling agent's comments with an optional note. Results SHALL be bounded.

#### Scenario: Agent lists open comments
- **WHEN** the agent calls gitReviewComments without arguments
- **THEN** it receives its open comments with ids, anchors, quoted lines, bodies, outdated and sent flags

#### Scenario: Agent resolves another agent's comment
- **WHEN** the agent calls gitResolveComment with an id owned by a different agent
- **THEN** the call fails as not found and nothing changes

### Requirement: Live comment updates
Every comment mutation, including resolution by the agent and archive cleanup, SHALL publish gitUi.comments.changed with the repository live key so open Git tabs refresh without manual action.

#### Scenario: Agent resolves while the tab is open
- **WHEN** the agent resolves a comment
- **THEN** the open tab removes it from the Open list without Refresh

### Requirement: Destruction on archive or delete
When an agent is archived or deleted the system SHALL permanently delete all of its review comments, open and resolved. Unarchiving SHALL NOT restore them. Comments of an archived agent SHALL never be returned or created, even before deletion completes. A periodic sweep SHALL delete comments of archived agents missed by the archive hook. Archive SHALL succeed even when cleanup fails.

#### Scenario: Archive deletes everything
- **WHEN** an agent with open and resolved comments is archived
- **THEN** no comment rows for that agent remain
- **AND** comments of other agents for the same repository are untouched

#### Scenario: Unarchive
- **WHEN** the archived agent is restored
- **THEN** it has no comments

#### Scenario: Missed hook
- **WHEN** an agent became archived without the cleanup hook running
- **THEN** its comments are invisible immediately and deleted by the next sweep

#### Scenario: Hook failure
- **WHEN** the cleanup handler throws
- **THEN** archival still succeeds and the error is logged

#### Scenario: Agent deleted
- **WHEN** an agent is deleted
- **THEN** its comments are removed by cascade

### Requirement: Session archived hook
session.archive SHALL run the session.archived hook with the agent id once after a successful transition to archived, isolating handler failures. Re-archiving an already archived agent SHALL NOT run the hook.

#### Scenario: First archive
- **WHEN** an idle agent is archived
- **THEN** every registered session.archived handler is called once with its id

#### Scenario: Already archived
- **WHEN** archive is called for an already archived agent
- **THEN** no handler is called
