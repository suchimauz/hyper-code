## MODIFIED Requirements

### Requirement: Provider logos
Connection cards and the add-connection form SHALL show the brand logo of known providers as an inert image. Custom connections SHALL always show a distinct generic connection icon, regardless of their endpoint or protocol.

#### Scenario: Codex connection
- **WHEN** a codex connection is listed
- **THEN** its card shows the OpenAI mark

#### Scenario: Claude connection
- **WHEN** a claude connection is listed
- **THEN** its card shows the Claude mark

#### Scenario: Custom connection
- **WHEN** a custom connection is listed, whatever its protocol
- **THEN** its card shows the generic plug icon instead of a brand logo

### Requirement: Provider login panel
For a connection whose provider requires login the Models tab SHALL offer a login panel matching the provider's flow kind, with live status and a cancel button. For the device-code flow (codex) it SHALL show the verification link and the one-time code with a copy button. For the authorization-code flow (claude) it SHALL show the authorization link, whether the local callback is listening, and a field to paste the callback URL or code, and SHALL show a submission error without clearing the field. The panel SHALL also offer logout with confirmation and show when login is required.

#### Scenario: Login flow
- **WHEN** the owner starts login on a codex connection
- **THEN** the link and code are shown, status updates until it succeeds, fails or expires, and the connection is refreshed on success

#### Scenario: Authorization-code login
- **WHEN** the owner starts login on a claude connection, opens the link and pastes the returned code
- **THEN** the code is submitted, status updates until it succeeds, fails or expires, and the connection is refreshed on success

#### Scenario: Rejected code
- **WHEN** the pasted code is rejected
- **THEN** a safe error is shown, the flow stays pending and the owner can paste again

#### Scenario: Logout needs confirmation
- **WHEN** the owner chooses logout
- **THEN** the tokens are removed only after confirmation
