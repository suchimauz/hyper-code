# openspec-workspace-viewer Specification

## Purpose
Lets a person follow a local workspace's OpenSpec state (active changes, current specs and the archive) in a read-only Canvas tab beside the chat, and run strict validation on demand.

## Requirements

### Requirement: Open the OpenSpec tab from the Canvas Start page
The Canvas Start page SHALL offer an "OpenSpec" launcher that opens an `openspec.workspace` tab pinned to the opening agent's local workspace directory; opening it again for the same directory SHALL switch to the existing tab.

#### Scenario: Launcher opens a pinned tab
- **WHEN** the person activates the "OpenSpec" launcher in a chat whose workspace is a local directory
- **THEN** an `openspec.workspace` tab opens showing that directory's `.mauzcode/openspec`

#### Scenario: Repeated launch reuses the tab
- **WHEN** an `openspec.workspace` tab for the same directory is already open and the launcher is activated again
- **THEN** that tab becomes active and no second tab is created

### Requirement: Local workspaces only
The tab SHALL only read local workspaces and SHALL refuse to open or read when the agent's workspace is on an SSH host.

#### Scenario: SSH workspace is refused
- **WHEN** the launcher is activated in a chat whose workspace is on an SSH host
- **THEN** no tab is created and the person sees a message that only local workspaces are supported

### Requirement: Uninitialized workspace
The tab SHALL show an empty state explaining that OpenSpec is not initialized when `.mauzcode/openspec` does not exist, and SHALL not create it.

#### Scenario: No OpenSpec folder
- **WHEN** the tab opens for a workspace without `.mauzcode/openspec`
- **THEN** an empty state says OpenSpec is not initialized and no files or folders are created

### Requirement: List active changes with task progress
The Changes section SHALL list every active change with its name and task progress as completed and total checklist items counted from its `tasks.md`.

#### Scenario: Change with partial progress
- **WHEN** an active change has a `tasks.md` with 3 of 8 items checked
- **THEN** the list shows the change name with progress "3/8" and a matching progress indicator

#### Scenario: Change without tasks
- **WHEN** an active change has no `tasks.md`
- **THEN** the list shows the change without a progress value

### Requirement: Show change artifacts as Markdown
For a selected change the tab SHALL offer its existing artifacts (proposal, design, tasks and each spec delta) and SHALL show the chosen artifact as rendered, sanitized Markdown.

#### Scenario: Reading a proposal
- **WHEN** the person selects a change and its proposal
- **THEN** the document pane shows `proposal.md` rendered as Markdown

#### Scenario: Spec deltas are listed per capability
- **WHEN** a change contains spec deltas for two capabilities
- **THEN** both deltas are offered by capability path and each opens as rendered Markdown

#### Scenario: Missing artifact is not offered
- **WHEN** a change has no `design.md`
- **THEN** no design entry is offered for that change

### Requirement: Show current specs
The Specs section SHALL list every current spec by capability path and show the selected spec as rendered Markdown.

#### Scenario: Reading a spec
- **WHEN** the person opens the Specs section and selects a capability
- **THEN** its `spec.md` is shown as rendered Markdown

### Requirement: Show the archive
The Archive section SHALL list archived changes, newest first, and show their artifacts the same way as active changes.

#### Scenario: Reading an archived proposal
- **WHEN** the person selects an archived change and its proposal
- **THEN** the archived `proposal.md` is shown as rendered Markdown

### Requirement: Strict validation on demand
The tab SHALL provide a "Validate" action that runs strict validation of all changes and specs and shows the overall result and each item's issues, without modifying any file.

#### Scenario: Validation passes
- **WHEN** the person activates "Validate" and every item is valid
- **THEN** the tab shows that validation passed

#### Scenario: Validation reports issues
- **WHEN** the person activates "Validate" and a change has a scenario without a THEN step
- **THEN** the tab shows that the change failed with the reported issue text

### Requirement: Read-only access confined to the OpenSpec folder
The tab SHALL write no files, and every read SHALL be limited to files under the pinned workspace's `.mauzcode/openspec`, chosen by the server from the owned tab rather than by paths from the browser.

#### Scenario: Path outside the folder is rejected
- **WHEN** a request asks for a document whose path escapes `.mauzcode/openspec`, including through `..` or a symlink
- **THEN** the request is rejected and no content is returned

#### Scenario: Another agent's tab is rejected
- **WHEN** a request names a tab that the requesting agent does not own
- **THEN** the request is rejected

### Requirement: Automatic refresh on file changes
The tab SHALL refresh its lists and the open document shortly after files under `.mauzcode/openspec` change, keep the current selection when it still exists, and re-read its state after a live-connection gap.

#### Scenario: Task ticked by the agent
- **WHEN** a checklist item in an open change's `tasks.md` is marked done on disk
- **THEN** the change's progress and the open `tasks.md` update without a manual reload

#### Scenario: Selected document removed
- **WHEN** the selected artifact is deleted on disk
- **THEN** the document pane shows that the document is no longer available

### Requirement: Layout and navigation
The tab SHALL show a translucent top bar with a segmented "Changes / Specs / Archive" control and the "Validate" action, a list on the left and the document on the right, collapsing to a single column on narrow widths.

#### Scenario: Wide layout
- **WHEN** the tab is wider than the narrow breakpoint
- **THEN** the list and the document are shown side by side

#### Scenario: Narrow layout
- **WHEN** the tab is narrower than the breakpoint and the person selects a document
- **THEN** only the document is shown, with a back control returning to the list

### Requirement: Themes, keyboard, accessibility and reduced motion
The tab SHALL follow the host light and dark themes, be fully operable by keyboard with visible focus, expose ARIA roles and labels for the segmented control, lists, progress and status, and disable non-essential animation under reduced motion.

#### Scenario: Keyboard navigation
- **WHEN** the person uses only the keyboard
- **THEN** they can switch sections with arrow keys in the segmented control, move through the list, open a document and activate "Validate"

#### Scenario: Dark theme
- **WHEN** the host theme is dark
- **THEN** the tab uses dark-theme colors with readable contrast

#### Scenario: Reduced motion
- **WHEN** the person prefers reduced motion
- **THEN** the tab shows no transition animations
