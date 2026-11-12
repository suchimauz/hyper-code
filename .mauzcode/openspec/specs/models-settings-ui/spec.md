# models-settings-ui Specification

## Purpose
Defines the "Models" settings tab where the owner manages LLM connections, and the UI extension slot through which plugins contribute provider-specific connection forms.

## Requirements

### Requirement: Models settings tab
The settings dialog SHALL show a "Models" tab alongside the existing tabs, and the existing "LLM Connections" tab MUST remain available unchanged.

#### Scenario: Owner opens settings
- **WHEN** the owner opens settings
- **THEN** both "LLM Connections" and "Models" tabs are listed and each opens its own panel

### Requirement: Connection list
The Models tab SHALL list connections with account name, provider label and icon, transport, enabled state and the usage report (status and, when present, quota windows and balance).

#### Scenario: Connection with quota windows
- **WHEN** a connection's usage report contains quota windows
- **THEN** each window is shown with its label, used percent and reset time

#### Scenario: Connection with status only
- **WHEN** a connection's usage report has no windows
- **THEN** only its status and reason are shown

### Requirement: Add and edit connections
The Models tab SHALL let the owner pick a provider type from the catalogue (built-in and plugin providers), fill the account name, the provider fields and the transport, test, save, edit and remove a connection; removal MUST require explicit confirmation.

#### Scenario: Add a custom connection
- **WHEN** the owner picks Custom, fills the account name, URL, protocol and key and saves
- **THEN** the new connection appears in the list without a page reload

#### Scenario: Remove requires confirmation
- **WHEN** the owner clicks remove on a connection
- **THEN** nothing is deleted until the owner confirms

### Requirement: Schema-driven forms
When a provider has no custom UI component, its form SHALL be generated from its field schema; secret fields MUST be write-only and show only whether a value is set.

#### Scenario: Editing a connection with a stored key
- **WHEN** the owner edits a connection whose API key is set
- **THEN** the key input is empty, marked as set, and leaving it empty keeps the stored key

### Requirement: Plugin provider components
A plugin UI SHALL be able to contribute a React component for its own provider through a `modelProviders` extension entry, which is used only when the plugin's package grants that provider id and the plugin UI bundle is approved.

#### Scenario: Granted plugin component
- **WHEN** an approved plugin UI declares a `modelProviders` entry for provider `acme` and its package grants `acme`
- **THEN** the Models tab uses that component for `acme` connections

#### Scenario: Ungranted component
- **WHEN** a plugin UI declares a `modelProviders` entry for an id its package does not grant
- **THEN** the entry is ignored and the schema-driven form is used

#### Scenario: Duplicate provider component
- **WHEN** two extensions declare a component for the same provider id
- **THEN** the registry rejects the duplicate as it does for other extension slots

### Requirement: Accessible settings UI
The Models tab SHALL be keyboard operable, label every form control, follow the active theme and respect reduced motion.

#### Scenario: Keyboard-only use
- **WHEN** the owner navigates the Models tab with the keyboard only
- **THEN** every action (add, edit, test, save, remove, confirm) is reachable and has a visible focus state
