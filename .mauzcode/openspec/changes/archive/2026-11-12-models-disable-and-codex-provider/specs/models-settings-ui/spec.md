## ADDED Requirements

### Requirement: Per-model enable switches
The connection's model list in the Models tab SHALL show an accessible switch for every model, with vertical spacing between rows. Clicking anywhere on a model row MUST toggle its switch. Disabled models MUST stay visible, dimmed and labelled `Disabled`.

#### Scenario: Row click toggles
- **WHEN** the owner clicks the text of a model row
- **THEN** that model's switch changes

### Requirement: Saving model switch changes
Toggles MUST only change a local draft. While the draft differs from the stored state the tab SHALL show `Save (N)` and `Reset`, and no request MUST be sent until Save. Save MUST announce errors and show the stored state afterwards.

#### Scenario: Turn a model off
- **WHEN** the owner clicks a model row and then Save
- **THEN** exactly one change is sent for that model and it is shown as Disabled

#### Scenario: Toggling without saving
- **WHEN** the owner toggles models but does not press Save
- **THEN** no request is sent, and Reset restores the stored state

#### Scenario: Save fails
- **WHEN** saving fails
- **THEN** an error message is announced

### Requirement: Update models
The model list SHALL show when it was last fetched and offer an `Update models` button. Opening the list MUST read the cache; only the button MUST ask the provider.

#### Scenario: Update the cached list
- **WHEN** the owner presses Update models
- **THEN** the provider is asked, the list and its update time are replaced, or a failure is shown while the old list stays

### Requirement: Readable status reasons
Connection status SHALL show test and usage reason codes as human-readable text, keeping the raw code available as a tooltip; unknown codes MUST be shown unchanged.

#### Scenario: Provider not loaded
- **WHEN** a check reports `unknown-provider`
- **THEN** the card says the provider is not loaded and suggests restarting MauzCode

### Requirement: Provider logos
Connection cards and the add-connection form SHALL show the brand logo of known providers as an inert image. Custom connections SHALL always show a distinct generic connection icon, regardless of their endpoint or protocol.

#### Scenario: Codex connection
- **WHEN** a codex connection is listed
- **THEN** its card shows the OpenAI mark

#### Scenario: Custom connection
- **WHEN** a custom connection is listed, whatever its protocol
- **THEN** its card shows the generic plug icon instead of a brand logo

### Requirement: Provider login panel
For a codex connection the Models tab SHALL offer a login panel with the verification link, the one-time code with a copy button, live status and a cancel button. It SHALL also offer logout with confirmation and show when login is required.

#### Scenario: Login flow
- **WHEN** the owner starts login on a codex connection
- **THEN** the link and code are shown, status updates until it succeeds, fails or expires, and the connection is refreshed on success

#### Scenario: Logout needs confirmation
- **WHEN** the owner chooses logout
- **THEN** the tokens are removed only after confirmation
