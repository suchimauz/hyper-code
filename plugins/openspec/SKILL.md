---
name: openspec
description: Spec-driven changes with the OpenSpec CLI, stored in the workspace's .mauzcode/openspec instead of the project root.
---

# OpenSpec

[OpenSpec](https://openspec.dev) keeps an agreed spec before code: `specs/` describe current behaviour, each `changes/<id>/` holds `proposal.md`, `specs/` deltas, `design.md` and `tasks.md`; a finished change is archived and its deltas merged into `specs/`.

All artifacts live in `<workspace>/.mauzcode/openspec`, never in a project-root `openspec/` folder. Always call the CLI through `openspec.run({ args })` — it runs the bundled CLI (2.0.0) from `<workspace>/.mauzcode`. Do not run `openspec` in bash from the project root: it will not find the root, and `init` there would create a root-level folder. Whether `.mauzcode/openspec` is committed is the user's decision; do not change `.gitignore` for it.

## Workflow

1. `run({ args: ["init"] })` once per project (adds `--tools none`; no assistant skill files are installed).
2. Propose: `run({ args: ["new", "change", "<kebab-id>"] })`, then `run({ args: ["instructions", "proposal", "--change", "<id>"] })` (likewise `specs`, `design`, `tasks`) and write each artifact with the file tools at the returned path under `.mauzcode/openspec/changes/<id>/`. Agree the proposal with the person before implementing.
3. Apply: `run({ args: ["instructions", "apply", "--change", "<id>", "--json"] })`, implement `tasks.md` items and tick them `- [x]`. `run({ args: ["status", "--change", "<id>"] })` shows progress.
4. Check: `run({ args: ["validate", "<id>", "--strict"] })`.
5. Archive: `run({ args: ["archive", "<id>", "--yes"] })` merges deltas into `specs/`.

`list`, `list --specs`, `show <id> --json` and `view` inspect state. `store` commands and `--store` are rejected. Local workspaces only; `dir` overrides the workspace with another absolute local path.
