## MODIFIED Requirements

### Requirement: Layout and navigation
The tab SHALL show a translucent top bar with a segmented "Changes / Specs / Archive" control and the "Validate" action, a list on the left and the document on the right, collapsing to a single column on narrow widths. Manually activating a different section SHALL clear the selected entry and document, close the narrow document pane, and persist the new section with null selection and document in one update. Activating the current section SHALL preserve its document and selection.

#### Scenario: Wide layout
- **WHEN** the tab is wider than the narrow breakpoint
- **THEN** the list and the document are shown side by side

#### Scenario: Narrow layout
- **WHEN** the tab is narrower than the breakpoint and the person selects a document
- **THEN** only the document is shown, with a back control returning to the list

#### Scenario: Manual navigation to each other section
- **WHEN** a document is open and the person activates a different Changes, Specs or Archive section by mouse or keyboard
- **THEN** the destination list is shown without any selected entry or automatically opened document
- **AND** the narrow layout shows the list and the wide layout shows the list with its normal empty document area
- **AND** the previous document and document error are cleared
- **AND** the destination section and null selection and document are persisted together in one update

#### Scenario: Empty Archive
- **WHEN** the person switches from an open document to an empty Archive
- **THEN** the empty Archive list is visible rather than the previous document

#### Scenario: Current section activation
- **WHEN** the person activates the already active section
- **THEN** the current document and selection remain unchanged without a persistence request

#### Scenario: Keyboard focus
- **WHEN** the person switches sections with an arrow, Home or End key
- **THEN** focus remains on the activated section tab

#### Scenario: Reopen after navigation
- **WHEN** the Canvas tab is reopened after a manual section change
- **THEN** the saved destination section opens with no selected entry or document

#### Scenario: Incompatible saved selection
- **WHEN** a snapshot loads for saved state whose document or selected entry belongs to another section
- **THEN** the active section is preserved and incompatible selection and document are cleared and saved together
- **AND** no first entry is selected automatically

#### Scenario: Removed artifact in the active section
- **WHEN** the active section's selected artifact is removed
- **THEN** the normal document-unavailable message is retained rather than treating absence as cross-section navigation

#### Scenario: Automatic archive following
- **WHEN** the selected change is archived while its document is open
- **THEN** the viewer follows the archived entry and corresponding artifact instead of clearing the selection

#### Scenario: Late document response
- **WHEN** a previous document request succeeds or fails after a section switch
- **THEN** neither the old document nor its error reopens the cleared document view
