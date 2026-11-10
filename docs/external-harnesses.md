# External coding harnesses

MauzCode can expose its live procedural runtime to local coding harnesses such as Claude Code and Codex. The integration has three surfaces:

1. capability and function discovery through the `mauzcode` CLI;
2. schema-validated calls to declared tools;
3. a privileged arbitrary REPL for trusted local automation.

Mounted plugins can also be published as managed `mauzcode-*` agent skills. All calls go to the already-running MauzCode process, so they use its current function registry, hot reloads, Postgres pool, settings, OAuth sessions, browser state, and plugins.

## Install the CLI

Run it from the repository:

```sh
bun script/mauzcode.ts status
```

For a global command, link the script somewhere on `PATH`:

```sh
chmod +x "$HOME/mauzcode/script/mauzcode.ts"
ln -s "$HOME/mauzcode/script/mauzcode.ts" "$HOME/.local/bin/mauzcode"
```

The client finds the process through `$WORKDIR/.runtime/port`. If `WORKDIR` is unset, it uses the current directory. Run it from the MauzCode workspace or set `WORKDIR` explicitly:

```sh
WORKDIR="$HOME/mauzcode" mauzcode status
```

Output is JSON on stdout. Errors use a non-zero exit status.

## Discover plugins and runtime functions

Search plugin workflows with concise English capability terms, then read the selected plugin's human-written workflow and generated live API documentation:

```sh
mauzcode plugin search "GitHub pull request review"
mauzcode plugin read gh
```

List or search the complete live function catalogue:

```sh
mauzcode functions --namespace gh --limit 100
mauzcode function search "inspect pull request files and reviews"
mauzcode function read gh.pr
```

`function search` uses MauzCode's runtime documentation search. `function read` returns the current summary, JSDoc, signature, option schema, return type, and source path. These commands reflect hot-reloaded code rather than a static catalogue.

## Call declared tools

Declared tools are the constrained external execution surface. Their JSON Schemas are listed by `mauzcode tools`, and calls go through the same `tools.validate` and `tools.call` path used by MauzCode agents:

```sh
mauzcode tools
mauzcode tool call find --json '{"path":"src","pattern":"*.ts","limit":20}'
```

Unknown arguments and schema violations are rejected before the implementation runs. Tool output has the standard shape:

```json
{
  "output": "...",
  "isError": false
}
```

Plugin functions are discoverable through `plugin` and `function` commands, but they are not automatically promoted to declared tools. Use the privileged REPL when a workflow intentionally needs an arbitrary documented runtime function.

## Privileged arbitrary REPL

`mauzcode repl` evaluates Bun JavaScript or TypeScript with the live `ctx` in scope:

```sh
mauzcode repl 'return await ctx.fns.gh.repo({owner:"niquola", repo:"mauzcode"})'

echo 'return Object.keys(ctx.fns)' | mauzcode repl
```

This is intentionally as powerful as direct runtime access. It can call internal functions, query Postgres, edit files, and trigger external writes. Use it only from a trusted local harness, never print secrets, and preserve each plugin's confirmation requirements.

The REPL is disabled when `NODE_ENV=production`.

## Publish plugins as agent skills

Publish a generated `mauzcode-runtime` bridge skill and every mounted plugin with a collision-resistant `mauzcode-` prefix:

```sh
mauzcode skills mount --dry-run
mauzcode skills mount
```

MauzCode writes only missing symlinks and never replaces an existing file, directory, or link. Repeated runs are idempotent and report three groups:

- `linked`: links created by this run;
- `existing`: links already pointing at the expected source;
- `collisions`: names owned by something else and left untouched.

Existing skill roots are detected under:

```text
~/.agent/skills
~/.claude/skills
~/.codex/skills
```

Equivalent roots reached through symlinks are deduplicated. A typical mounted name is `mauzcode-gh`, leaving an older `gh` skill untouched.

## Security model

MauzCode uses two separate bearer tokens stored with mode `0600` in the runtime directory:

```text
.runtime/external-token       capability discovery and declared tools
.runtime/external-repl-token  privileged arbitrary REPL
```

The tokens are not interchangeable. External routes:

- accept only a socket peer with a loopback address;
- reject `x-forwarded-for` and `x-forwarded-host` requests;
- require a token with the route's exact JWT `kind`;
- cap request bodies at 256 KB.

The former browser `/rpc` endpoint is retired and returns 410 without dispatch. Use `/external/*` through the CLI instead.

## Command reference

```text
mauzcode status
mauzcode plugin search <English capability query>
mauzcode plugin read <name>
mauzcode functions [--namespace <name>] [--limit <n>]
mauzcode function search <English capability query>
mauzcode function read <namespace.function>
mauzcode tools
mauzcode tool call <name> --json '{...}'
mauzcode skills mount [--dry-run]
mauzcode repl '<arbitrary code>'
```
