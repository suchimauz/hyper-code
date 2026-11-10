# Shared SSH provider transport

`sshAccount.fetch` routes through `sshProvider.dispatch`. Codex, Claude Code, Kimi Coding, Z.ai Coding, MiniMax Coding and OpenCode share `sshProvider.request`: pinned SSH dynamic forwarding, numeric loopback SOCKS5, remote DNS, verified TLS, no redirects and no direct fallback. Inference, compaction, quotas and model discovery use this path. Z.ai/MiniMax catalogue helpers now respect their existing SSH Instance setting. Ordinary SSH tools and remote CLI login are unchanged.

## Explicit activation

SOCKS is the only provider HTTP route. Caller-token providers use it by default without activation. OAuth accounts without shared encrypted credentials fail with an actionable secure-onboarding error. New remote OAuth login completion imports into that store before reporting success, or fails explicitly. Existing encrypted records are never overwritten by login completion. Current running requests are not interrupted.

After owner approval and after requests begun before installing this dispatcher have drained:

```ts
await ctx.fns.sshProvider.activate({
 instance: 'EXACT_INSTANCE', provider: 'EXACT_PROVIDER', account: 'EXACT_ACCOUNT',
 action: 'activate', confirmed: true, drained: true,
});
```

Call once per existing OAuth account; caller-token providers normally use `account: 'default'` and need no activation. No model/default changes are required. Activation accepts authenticated owner or a live bound agent with a durable owner creator. Cron dispatch verifies its exact existing grant before deriving private owner execution. Tokens never appear in procedure results.

OAuth activation imports remote CLI files through a bounded private read-only pipe with path/permission checks. Import does not refresh expired tokens; reconnect CLI first. Already migrated Codex credentials transfer from the encrypted baseline record, avoiding stale remote refresh tokens. Do not use baseline pilot import/rollback on an account once transferred. The old record remains for provenance, not active refresh.

## Safe rollback

Use the same exact identity with `action: 'suspend'` to disable requests while preserving all local credentials, including rotated refresh tokens. `action: 'resume'` restores SOCKS. Suspension fails closed; it does not restore Python or direct networking. Keep implementation source installed. A git revert alone after activation is unsafe because it would ignore the new encrypted credential record. Never delete credential records as a rollback.

Refresh marks the record recovery before sending the OAuth request. A successful refresh whose encrypted save fails retains a RAM-only candidate. `sshProvider.recover({instance,provider,account,confirmed:true})` saves that candidate without refreshing twice. If the process lost that candidate or the provider outcome is ambiguous, manual fresh authorization is required; this implementation deliberately refuses automatic reuse of stale remote tokens.

## Verification and boundaries

Offline tests cover six provider route policies, inference/quota/catalogue dispatch, cleanup/cancellation, OAuth refresh, CAS recovery, owner binding, activation/suspension, cron rejection and catalogue no-direct-fallback. No live provider request or credential import was executed. Claude has no existing dynamic models endpoint; its catalogue remains the existing static metadata, not a fabricated HTTP route.

Account leases are reload-stable in this server process. Run one MauzCode server against these accounts; distributed multi-process account leasing is not implemented. The existing tunnel ownership proof requires Linux. Provider policy is intentionally narrower than legacy broad Z.ai/MiniMax prefixes: only currently used inference/count/models/quota endpoints are allowed. Public OpenCode docs discard caller credentials. All account errors fail closed. The per-request Python HTTP bridge and pilot dispatcher have been deleted. The retained pilot lifecycle runtime delegates HTTP to the shared dispatcher; its import/recovery helpers remain for encrypted-record provenance and guarded lifecycle operations, not an alternative HTTP implementation. Remote CLI login and bounded Python credential-file import remain intentionally: they are not provider HTTP transport.
