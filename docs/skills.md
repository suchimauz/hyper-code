# Installing MauzCode as a skill

How a coding harness — Claude Code, Codex, or anything that reads a skills directory —
gets access to the capabilities of a **running** MauzCode. The harness never imports MauzCode's
code: it talks to the live process over loopback through the `mauzcode` CLI, so every call
sees the current registry, the current plugins and the current credentials.

## What gets installed

`mauzcode skills mount` publishes two kinds of skill into every skills root it finds:

- **`mauzcode-runtime`** — a generated bridge skill. It teaches the harness the discovery
  path (`mauzcode plugin search`, `mauzcode plugin read`), how to call declared tools, and how to
  reach any documented runtime function through the REPL. It is written to
  `.runtime/external-skills/mauzcode-runtime/SKILL.md` with mode `0600`.
- **`mauzcode-<plugin>`** — one entry per mounted plugin that ships a `SKILL.md`. These are
  **symlinks to the plugin's own directory**, not copies, so a plugin's documentation has
  exactly one source of truth and editing it through the skills folder edits the plugin.

Default targets are the skills roots that already exist: `~/.agent/skills`,
`~/.claude/skills`, `~/.codex/skills`. Nothing is created for a harness you do not use.

## Install

```sh
# from anywhere — see "Which workspace" below
mauzcode status                 # is a runtime reachable?
mauzcode skills mount --dry-run # what would change
mauzcode skills mount           # create the symlinks + bridge skill
```

The result is reported as three lists: `linked` (new), `existing` (already correct), and
`collisions`. A collision means the destination exists and is **not** our symlink — a real
directory, or a link pointing elsewhere. Nothing is overwritten: resolve it by hand, then
mount again. Re-running the command is safe and idempotent.

Options: `--dry-run` reports without writing; the underlying function also accepts
`targets` (explicit skill roots) and `prefix` (default `mauzcode-`) when called through the
REPL:

```sh
mauzcode repl 'return await ctx.fns.external.mountSkills({ dryRun: true })'
```

## Which workspace the CLI talks to

The CLI finds a running MauzCode by reading `.runtime/port`, in this order:

1. `WORKDIR` if it is set — always wins, so you can address a specific workspace;
2. the current directory, **only if** a MauzCode is actually running there;
3. the path written in `~/.mauzcode/workdir`, if that file exists;
4. `~/mauzcode` as the last resort.

That is why `mauzcode` works from `/tmp` or from an unrelated repository: it no longer fails
just because the current directory has no `.runtime`. To pin a default workspace, write its
path into `~/.mauzcode/workdir`.

## How a harness uses it

Discovery first, in English, regardless of the language of the conversation:

```sh
mauzcode plugin search "read my calendar"     # rank plugins by capability
mauzcode plugin read google                   # that plugin's SKILL.md
mauzcode functions --namespace myhealth       # what a namespace exposes
mauzcode function read myhealth.vitals        # one function's signature and docs
```

Then execution, from narrow to broad:

```sh
mauzcode tools                                          # schema-validated declared tools
mauzcode tool call read --json '{"path":"README.md"}'   # call one, arguments validated
mauzcode repl 'return await ctx.fns.myhealth.vitals({ metric: "hr", days: 14 })'
```

`mauzcode tool call` is the safe surface: arguments are checked against the tool's declared
schema. `mauzcode repl` is the powerful one — arbitrary code against the live `ctx` — and it
exists because plugin capabilities are ordinary functions, not tools. Use the least
powerful form that does the job.

## Two tokens, on purpose

Both live in `.runtime/` with owner-only permissions and are minted by the running process:

| token | used by | scope |
|---|---|---|
| `external-token` | `status`, `plugin`, `functions`, `tools`, `tool call`, `skills mount` | the scoped external API |
| `external-repl-token` | `mauzcode repl` only | arbitrary code in the live process |

Every `/external/*` route is loopback-only. The split is the point: a harness doing
discovery and tool calls never holds the credential that can execute arbitrary code, and
the powerful one is requested explicitly by the one command that needs it.

If a command reports a missing token, the corresponding subsystem has not started yet —
start or reload the runtime rather than creating the file by hand.

## Making a plugin mountable

A plugin is published as a skill when it is mounted **and** ships a `SKILL.md` in its
directory. Write that file for the harness, not for a human browsing a repo:

- **Frontmatter** — `name` and a `description` that names concrete nouns and verbs. The
  description is what capability search matches against, so "read my Gmail, calendar and
  Drive" beats "Google integration".
- **Functions** — one line per function with its arguments, grouped by task.
- **Call examples** — always through the CLI that reaches this runtime:
  `mauzcode repl 'await ctx.fns.<namespace>.<fn>({ … })'`. An example that names another
  runtime's CLI silently sends the caller to a different process and, if both are running,
  to a different database.
- **Nothing secret** — the file is world-readable inside the plugin directory.

## Updating and removing

Mounting is idempotent: run `mauzcode skills mount` again after adding a plugin. Because
plugin skills are symlinks, editing a plugin's `SKILL.md` needs no remount at all — the
harness reads the new text immediately.

To remove, delete the `mauzcode-*` entries from the skills root; they are links, so the
plugins themselves are untouched.

## Troubleshooting

| symptom | cause |
|---|---|
| `No .runtime/port in any of: …` | no MauzCode running for any candidate workspace |
| `collisions` in the mount report | the destination exists and is not our symlink |
| a skill's examples reach the wrong data | the `SKILL.md` still names another runtime's CLI |
| `No .runtime/external-token` | the external subsystem has not started; reload the runtime |
