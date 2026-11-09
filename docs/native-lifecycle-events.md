# Native lifecycle transcript events

The events API now includes parked/unparked, model changes, team updates, wake/watch,
canvas pings, plan activation, historical goal activation/check, repaired attempts,
external attachment events and scheduled user messages. `lifecycle` is a display-only
allowlist of primitive fields; it is not a spread of the persisted event or input spec.
Canvas/watch result previews are inert bounded text. External payloads expose only
sender/chat identity and message/summary, not arbitrary transport metadata.

`LifecycleRow` renders native React text and keyboard-operable details/summary,
with encoded team links, wrapped content and no animation or automatic action.
Tool busy/aborted and goal transition events also pass the API event filter to their
existing native components. Existing native peer, command, compaction, retry,
thinking and tool rows remain in place.

`agent.renderEventHtml` now only delegates input events to `input.card`. Ordinary
branches and `renderAutomationEventHtml`, `renderCompactionEventHtml`,
`renderPeerMessageHtml`, `ui.chatEventCard` and their obsolete HTML tests are removed.
Planning proposals no longer call the ordinary HTML renderer. Secure input transport,
Redmine approval authority, shared SSR and explicit respondHtml handling are unchanged.
No database migration erases historical HTML; the events API still preserves assistant
HTML. This change does not claim to add native rendering for custom assistant HTML.

Checks: lifecycle + tool busy frontend tests (16 passed), events API + input-only
renderer tests (9 passed), frontend TypeScript build check passed. Cold extended
message/color/function-RAG/planning/input tests: 17 passed, 6 failed from existing
stale function-RAG user-message assumptions and input/planning transaction/SQL mocks.
Runtime metadata validation passed for the two changed runtime procedures; route
and namespace hot reload performed without a restart.
