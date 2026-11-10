# SSH instances

An SSH instance runs subscription authentication and provider HTTP requests on a remote host without installing another MauzCode server. The local MauzCode continues to own the agent transcript, tool execution, UI and queue.

## Requirements

- A reachable SSH server and a remote user allowed to execute commands.
- OpenSSH client tools (`ssh`, `ssh-keygen`) on the MauzCode server.
- Python 3 on the remote machine for the per-request standard-library HTTP bridge.
- Installed official `codex` and/or `claude` CLI on the remote machine. No existing provider login is needed.
- The remote host must be able to reach the provider's authentication and inference endpoints.

## Setup

1. Open **Administration → SSH Instances** and add the server address, user, port and an instance name.
2. Copy the generated **public** key into the remote user's `~/.ssh/authorized_keys`. Never copy or expose the private key.
3. Obtain the server's Ed25519 SSH host public key through an independently trusted channel. Verify its fingerprint and explicitly trust it in MauzCode. Use the server's `/etc/ssh/ssh_host_ed25519_key.pub`, not MauzCode's client public key.
4. Run the connection check and verify that Python and the required CLI are available.
5. Open **LLM Connections** and choose **Add Codex** or **Add Claude Code**. Enter an account name and choose the **SSH Instance**. The selector appears only when at least one SSH instance exists; **This machine (local)** preserves local authorization. Complete the official provider authorization in the popup. For SSH accounts the CLI writes credentials on the remote machine, not on the MauzCode host. SSH Instances itself contains only server setup and connection checks.
6. Select a model under the SSH instance in the model picker.

Remote routes use `ssh/<instance>:<provider>/<account>:<model>`, for example `ssh/eu:codex/work:gpt-5.4-mini`. They remain distinct from both local accounts and MauzCode Node routes.

### Claude browser callback on SSH

For Claude Code, open the authorization page in the login popup. After consent, the browser may land on a localhost connection-error page: the callback listener is on the SSH server, not your computer. Copy the **full address** from that tab into the popup's protected **Browser callback URL** field and choose **Send callback**. Never paste it in chat. Then use **Refresh status**; connection is confirmed only after the remote CLI finishes and its credential/status checks pass, not by the callback HTTP response (even HTTP 403 can follow acceptance).

Callbacks must match this pending flow's OAuth state and redirect port. MauzCode forwards only to the remote `127.0.0.1` callback listener over the original pinned SSH connection, via private stdin, without redirects, proxy environment, response bodies or callback logging. The remote host needs `/usr/bin/curl` or `/bin/curl`. A callback is single-use; uncertain delivery requires cancelling and starting a new login, not resending. Attempts started before this callback support was loaded must also be restarted. Codex continues to use its device-code flow.

## Editing and removal

Each instance card has **Edit connection** and **Remove instance**. Host, user and port are editable; the instance name is stable. Changing the destination preserves MauzCode's client key, clears the host pin and marks associated provider accounts as needing reconnection. Verify the new destination before connecting again.

Under **SSH keys & security → Replace host key**, enter an independently verified new host key and explicitly confirm replacement. Provider accounts are marked for reconnection. Destination edits and key replacement use a new local storage/socket namespace so a previously trusted multiplexed connection cannot bypass the new verification.

Removal requires explicit confirmation and removes the instance and its local account records only. It does not revoke `authorized_keys`, delete remote credentials or terminate existing requests. Old protected local key directories are retained for active-process safety. Pending provider logins must finish or be cancelled before lifecycle changes.

## Isolation and security

Each remote account uses a separate HOME below `~/.mauzcode/ssh-accounts/<provider>/<account>`, with its own `CODEX_HOME` or `CLAUDE_CONFIG_DIR`. Login must not inherit an existing provider token from the SSH environment. Public metadata in MauzCode records account state, not access or refresh tokens. Provider credential refresh and authenticated requests happen on the remote machine.

An instance has its own SSH key, pinned known-host entry and multiplexed connection. Private SSH material is stored outside the repository with restrictive filesystem permissions. Host-key verification is strict; do not disable it to get past an error. Server administrators and the remote user can access that user's account files; isolated HOME is credential separation, not an operating-system security sandbox.

Use distinct account names when multiple MauzCode installations share the same remote OS user: the remote credential directory is account-scoped. Linux file-backed CLI credentials are the initial target; macOS keychain-backed credentials require explicit transport support and must not silently fall back to the remote user's ambient login. Login has a ten-minute deadline; cancelling it closes the SSH channel, but remote process-tree cleanup is not guaranteed.

## Network behavior

Persistent SSH multiplexing avoids a new SSH handshake on every request. Provider response bodies stream back to MauzCode while native function/tool-call formats remain unchanged. The bridge is an ephemeral process, not a public HTTP listener or remote MauzCode daemon.

This moves provider connectivity to the remote host, but it does not make the local link reliable. A broken SSH connection fails the active request; response resumption after reconnection is not implemented. Do not automatically replay a partially received generation as though it had never run. A long-running remote agent queue with resumable event storage is a separate capability.

## Usage and limits

Connected SSH Codex and Claude accounts participate in the normal background quota refresh. Usage requests run as bounded GETs through the SSH bridge to fixed provider endpoints; credential reading and refresh stay on the remote host. MauzCode stores quota snapshots under the same synthetic account identity used by inference. Successful refreshes are cached for one minute. A telemetry failure displays unavailable usage, not an exhausted account.

SSH refresh reads the usage endpoint only: Claude profile/plan enrichment and Codex reset-credit detail requests are not fetched separately. Codex plan and reset-credit summaries are retained when supplied in the usage response.


## Verification

Unit tests use mocked SSH and HTTP processes; they do not authenticate provider accounts or contact user servers. End-to-end authorization and inference require a user-configured, trusted SSH instance and must be checked separately.
