## ADDED Requirements

### Requirement: Read-only repository
The Git Canvas SHALL never modify the repository: no staging, committing, branch changes, fetches or pushes. The only persisted writes SHALL be review comments in the MauzCode database.

#### Scenario: Comment does not touch the repository
- **WHEN** the person creates, resolves or deletes comments
- **THEN** git status, index and refs are unchanged

### Requirement: Live repository updates
The Git tab SHALL update changes and history automatically. Local repositories SHALL use a debounced, shared, idle-expiring file watcher that ignores Git object storage and falls back to polling on watcher errors. SSH repositories SHALL use fingerprint polling of HEAD and status about every 3 seconds without ever falling back to local execution. Watchers SHALL close after 10 minutes without an authorized request.

#### Scenario: Local file edit
- **WHEN** a tracked file changes in a local repository with an open tab
- **THEN** the changes list and the open diff refresh within about one second without manual action

#### Scenario: New commit over SSH
- **WHEN** a commit is made in an SSH repository with an open tab
- **THEN** the history refreshes within about one polling interval

#### Scenario: SSH failure
- **WHEN** the SSH host becomes unreachable
- **THEN** the live indicator shows Not live and no local command runs

#### Scenario: Idle
- **WHEN** no authorized request touches a watcher for 10 minutes
- **THEN** the watcher closes

### Requirement: Live status and manual refresh
The header SHALL show a live indicator with Live, Connecting and Not live states and a Refresh action. Refreshes SHALL preserve the current section, selection and scroll position, and show a clear empty state when the selected file or commit no longer exists.

#### Scenario: Transport lost
- **WHEN** the live transport disconnects
- **THEN** the indicator shows Not live with a hint to use Refresh

#### Scenario: Selected file disappears
- **WHEN** the selected uncommitted file is reverted
- **THEN** the diff pane shows that the file no longer has changes

### Requirement: Layout and navigation
The tab SHALL show a translucent header with repository name, branch, short HEAD, a segmented Changes / History / Comments control with an open-comment count badge, the live indicator, Refresh and a primary Send to agent action showing the unsent count. A list pane SHALL sit beside the diff pane and collapse to one column with a back control on narrow widths. The tab SHALL follow MauzCode theme tokens in light and dark themes and Apple design guidance.

#### Scenario: Narrow layout
- **WHEN** the tab is narrower than the breakpoint and the person opens a diff
- **THEN** only the diff is shown with a back control

#### Scenario: Send disabled
- **WHEN** there are no unsent open comments
- **THEN** the Send to agent action is disabled

### Requirement: Inline commenting in diffs
Diff gutters SHALL offer an add-comment affordance on hover and keyboard focus. Click, shift-click and drag SHALL select a line range and open an inline composer under the range that saves with Cmd/Ctrl+Enter and cancels with Escape. Existing comments SHALL render inline under their lines with open, resolved and outdated states and edit, delete, resolve and reopen actions. File and commit lists SHALL show comment counts.

#### Scenario: Range comment
- **WHEN** the person drags across lines 4–6 and saves text
- **THEN** a comment card appears under line 6 and the file shows one comment

#### Scenario: Cancel
- **WHEN** the person presses Escape in the composer
- **THEN** nothing is saved and focus returns to the gutter

### Requirement: Comments list
The Comments section SHALL list comments grouped by file with Open, Resolved and All filters, sent / not sent chips, outdated badges and the resolver's note. Activating a comment SHALL open its file or commit diff and highlight its lines. A resolved comment SHALL leave the Open list with a short transition that is disabled under reduced motion.

#### Scenario: Jump to comment
- **WHEN** the person activates a comment in the list
- **THEN** the corresponding diff opens scrolled to and highlighting the anchored lines

### Requirement: Accessibility
All controls SHALL be keyboard reachable with visible focus, the segmented control and lists SHALL use appropriate roles and arrow-key navigation, status changes SHALL be announced through polite live regions, and color SHALL not be the only carrier of state.

#### Scenario: Keyboard-only review
- **WHEN** the person uses only the keyboard
- **THEN** they can open a file, select lines, write, save, resolve and send comments
