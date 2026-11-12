## MODIFIED Requirements

### Requirement: Automatic refresh on file changes
The tab SHALL refresh its lists and the open document shortly after files under `.mauzcode/openspec` change, including directory moves such as archiving a change, for as long as the tab stays open, keep the current selection when it still exists, and re-read its state after a live-connection gap.

#### Scenario: Task ticked by the agent
- **WHEN** a checklist item in an open change's `tasks.md` is marked done on disk
- **THEN** the change's progress and the open `tasks.md` update without a manual reload

#### Scenario: Selected document removed
- **WHEN** the selected artifact is deleted on disk
- **THEN** the document pane shows that the document is no longer available

#### Scenario: Change archived while the tab is open
- **WHEN** a change shown in the tab is archived with `openspec archive`
- **THEN** within a few seconds it disappears from Changes and appears in Archive without a manual reload
- **AND** if it was selected, the selection moves to its archive entry with the same artifact

#### Scenario: Tab open for a long time
- **WHEN** the tab has been open and visible for more than the watcher idle timeout without user interaction
- **THEN** file changes still refresh the tab

## ADDED Requirements

### Requirement: Visible live-update state and manual refresh
The tab SHALL show whether live updates are working and SHALL offer a keyboard-accessible Refresh action.

#### Scenario: Live updates stopped
- **WHEN** the live connection or the watcher keep-alive fails
- **THEN** the tab announces that live updates are unavailable and the Refresh action still reloads the lists and the open document
