## Purpose

Enable whole-worktree and whole-commit review without mandatory per-file selection while preserving precise inline comments.

## ADDED Requirements

### Requirement: Whole-worktree diff
The Changes tab SHALL offer a Full diff action displaying Staged, Unstaged and Untracked as separate sections and SHALL retain single-file viewing.

#### Scenario: A path has staged and unstaged changes
- **WHEN** the reviewer opens Full diff
- **THEN** both instances appear in their respective sections with independent review targets

### Requirement: Whole-commit diff
Selecting a commit in History SHALL show all its changed files without requiring file selection. File navigation SHALL jump to the corresponding block. Root commits SHALL compare against the empty tree and merges against their first parent.

#### Scenario: Selecting a commit
- **WHEN** the reviewer selects a commit
- **THEN** all changed-file blocks are available and selecting a file navigates to its block

#### Scenario: Unavailable shallow parent
- **WHEN** the selected commit's comparison parent is unavailable
- **THEN** the viewer explicitly reports the unavailable comparison rather than displaying an empty successful diff

### Requirement: Collapsible bounded review
Each file SHALL be independently collapsible, initially expanded, with Collapse all and Expand all actions. Diff loading SHALL be lazy near the viewport with bounded concurrency and existing size limits. Collapse state SHALL be isolated by repository, section and commit and preserved during live refresh.

#### Scenario: Large review
- **WHEN** a review contains many files
- **THEN** loading remains bounded and offscreen files do not all trigger immediate requests

#### Scenario: Live refresh and target switching
- **WHEN** files refresh or the reviewer selects another commit
- **THEN** retained targets preserve collapse state and stale responses cannot appear under the new target

### Requirement: Inline review parity
Whole-diff views SHALL support unified and split display, line and range comments on either side, existing comments and outdated-anchor indicators. Comments SHALL remain bound to their repository, scope, group, commit and path.

#### Scenario: Same path in multiple targets
- **WHEN** a reviewer comments on a range in one file block
- **THEN** the comment attaches only to that block's precise target and remains available through the existing review workflow

### Requirement: Explicit exceptional states
Binary files, conflicts, submodules, oversized patches and unavailable comparisons SHALL have explicit states. A per-file error SHALL NOT hide other file blocks. SSH errors SHALL NOT cause local fallback. Review operations SHALL remain read-only with respect to Git.

#### Scenario: One file cannot render
- **WHEN** one file is binary, too large or fails to load
- **THEN** its block explains the state and other blocks remain reviewable

### Requirement: Accessible review controls
Controls SHALL preserve themes, keyboard access, visible focus, expanded-state semantics and reduced-motion preferences.

#### Scenario: Keyboard collapse
- **WHEN** a reviewer toggles a file using the keyboard
- **THEN** focus remains usable and the control exposes its updated expanded state

### Requirement: Single-step repository launch
Activating Git from Canvas Start SHALL open or activate exactly one repository tab directly, without an intermediate launcher tab. The target SHALL use the current workspace host and directory and remain pinned. Repeated activation for the same target SHALL reuse the existing repository tab.

#### Scenario: First activation
- **WHEN** the user activates Git with no tab for the current target
- **THEN** one repository tab opens without a separate launcher tab or second user action

#### Scenario: Repeated activation
- **WHEN** Git is activated again for an already open target or repeatedly while opening
- **THEN** the same repository tab is activated without duplicate tabs

#### Scenario: Opening fails
- **WHEN** the authorized target cannot be opened
- **THEN** a visible error is reported without an orphan launcher tab or fallback to a different host or directory

### Requirement: Commit reference decorations
History SHALL display HEAD, local branches, remote-tracking branches and tags attached to each visible commit, with distinguishable accessible labels. Symbolic HEAD SHALL identify its current branch; detached HEAD SHALL remain visible without implying a branch. Annotated and lightweight tags SHALL attach to their target commits.

#### Scenario: Multiple references point to one commit
- **WHEN** a visible commit is pointed to by HEAD, branches and tags
- **THEN** all applicable reference decorations are available with their types distinguishable, including colliding short names

#### Scenario: Detached HEAD and annotated tags
- **WHEN** HEAD is detached at a commit with an annotated tag
- **THEN** the commit shows HEAD and the tag resolved to the commit rather than to the tag object

#### Scenario: References move
- **WHEN** a branch or tag changes without worktree changes and History refreshes through its live or manual mechanism
- **THEN** decorations reflect the current references on the pinned host without fetching or modifying Git state

#### Scenario: History scope and lookup errors
- **WHEN** decorations are loaded for a page of HEAD history
- **THEN** unrelated branch history is not added and any reference-lookup failure is reported distinctly from an empty reference list

#### Scenario: Long or unusual ref names
- **WHEN** reference names are long or contain punctuation
- **THEN** they render safely as text with full names discoverable and do not break commit selection or keyboard access
