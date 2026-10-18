# Agent Web Push

Opt-in notifications for main agents (no parent and navigation visibility). Agent Inspector → **Push Notifications** has two independently saved, default-on preferences: newly created `input.request` forms, and terminal errors that stop work. Ordinary agent replies, task completion, manual stops, recoverable retries and questions written as plain chat text do not trigger push. These preferences never subscribe a browser or request permission automatically.

## Enable on iPhone

Use trusted HTTPS on iOS/iPadOS 16.4 or later. In Safari choose Share → Add to Home Screen, launch Hyper from that icon and sign in. Open the navigation menu → **Push notifications · this device** → **Enable push notifications**, then allow notifications. The same section disables this device. No permission request is made on page load.

The worker shows project and agent names in the title, plus a fixed category-specific message. Names are visible on the lock screen, but form titles, chat text, raw errors and secrets are not included. Tapping opens the associated chat; signing in and network/VPN access may still be required. The worker never intercepts or caches page requests.

## Authentication and delivery

Subscriptions belong to an active user and the browser login that enabled them. OIDC bindings survive access-cookie rotation but end with the server-side session; other cookies use their expiry. Logout attempts to remove that login's subscriptions. New logins require explicit enablement; subscriptions are not silently transferred between accounts. An existing local subscription is checked against server-side endpoint hashes before showing enabled status.

VAPID keys are generated during authenticated HTTPS configuration, serialized with a Postgres advisory lock and stored encrypted at `secret://web-push/vapid`. Back up encrypted secret storage together with its encryption key; do not rotate VAPID keys casually, since existing subscriptions depend on them. The contact subject is the HTTPS origin used for initialization.

Only Apple, FCM and Mozilla push endpoints are accepted. Sends use a five-second timeout, refuse redirects, and include no form contents. Delivery rechecks input state, owner, disabled/archived status and session validity. At most ten subscriptions per owner are supported; stale subscriptions are cleaned during registration and provider 404/410 responses remove invalid endpoints.

This initial version makes **one attempt per input/subscription or terminal-run/subscription**, with durable deduplication receipts and no retry queue. A crash after claiming or a temporary provider failure can lose a notification. Provider acceptance does not prove device display; iOS Focus and notification settings can suppress it. Push expires after 60 seconds at the provider. Delivery failure does not prevent the input form from being created.

## Validation

Mocked tests cover opt-in, permission denial, ownership/session isolation, OIDC rotation, logout, origin/CSRF rejection, endpoint restrictions, deduplication, safe notification navigation and provider errors. Physical iPhone delivery must be checked after the user enables notifications. Full shared-DB test bootstrap currently requires the unavailable `vector` extension; no test workaround is applied to the application database.
