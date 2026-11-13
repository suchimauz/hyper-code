## Purpose

Deliver an exact set of review references to the owning agent without redundant code context and present a durable, distinct chat receipt.

## ADDED Requirements

### Requirement: Compact explicit delivery
Explicit Send SHALL deliver repository host and directory, comment count, exact sent comment IDs and a retrieval instruction in a git_review_comments message. Initial delivery SHALL NOT include comment bodies, quoted lines or diff content. Saving a comment SHALL NOT send it.

#### Scenario: Sending open unsent comments
- **WHEN** the reviewer presses Send
- **THEN** only eligible open unsent comments are referenced and the owning agent is scheduled to process the message

### Requirement: Atomic idempotent send
Message persistence, scheduling and sent receipts SHALL commit atomically. Concurrent or repeated sends SHALL NOT duplicate delivery of the same eligible comments. Existing reopen eligibility SHALL be preserved.

#### Scenario: Concurrent sends
- **WHEN** two requests attempt to send the same unsent comments
- **THEN** each eligible comment is delivered once

#### Scenario: Persistence failure
- **WHEN** any transactional write fails
- **THEN** no partial message, scheduling change or sent receipt remains

### Requirement: Exact-set authorized retrieval
The agent review-comments tool SHALL accept an optional validated IDs filter, retain bounded paginated output and preserve unfiltered behavior. IDs SHALL NOT bypass owner, open-tab, repository or workspace checks. Unavailable targets SHALL produce a clear error rather than selecting another repository.

#### Scenario: Fetching a delivered set
- **WHEN** the agent fetches sent IDs using the all-status filter and follows pagination
- **THEN** it receives only authorized matching comments, including their bodies, anchors and current status, and no later unrelated comments

#### Scenario: Foreign or unavailable target
- **WHEN** a request supplies another owner's IDs or lacks the required matching open tab
- **THEN** unauthorized content is not disclosed and invalid target access fails explicitly

### Requirement: Dedicated chat card
A sent review SHALL render as a dedicated expandable card labelled Git review with its comment count. It SHALL belong to the work initiated by that send and collapse inside that work's Completed group. It SHALL NOT be grouped inside tool-call groups or represented as a fabricated model tool result.

#### Scenario: Completed work grouping
- **WHEN** the agent finishes processing a review
- **THEN** the review card is inside the Completed group and remains separate from any nested tool-call groups

#### Scenario: Reloading chat
- **WHEN** the user reloads chat
- **THEN** the persisted review card and work association are restored

### Requirement: On-demand current details
Expanding the card SHALL retrieve the exact sent set through authorized reads without injecting fetched details into model context. Details SHALL show comment text, file, lines and current status. Changed comments SHALL identify the displayed version as current; deleted or unavailable comments SHALL have an explicit unavailable state. New unsent comments SHALL NOT join an earlier card.

#### Scenario: Comments change after sending
- **WHEN** one sent comment is edited, one deleted and a new comment created
- **THEN** the card shows the edited current version and the unavailable reference, without including the new comment

### Requirement: Legacy compatibility
Previously persisted full-text review messages SHALL remain readable without requiring new metadata. Review cards SHALL support existing themes, keyboard focus, accessibility and reduced motion.

#### Scenario: Opening older history
- **WHEN** chat contains a legacy review message
- **THEN** its content is readable through fallback rendering without corrupting surrounding work groups
