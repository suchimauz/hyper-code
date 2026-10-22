# Apple Design — Hyper UI guidance

This vendored skill is the default design reference **only for Hyper's own UI**: its app shell, chat, settings, Connections, built-in pages, and plugin surfaces rendered inside Hyper. It does not govern other projects merely because an agent runs inside Hyper. Apply it elsewhere only when the user explicitly asks.

## Use in Hyper

Before designing, implementing, or reviewing Hyper UI, read [`SKILL.md`](./SKILL.md). Use it alongside Hyper's existing components and semantic light/dark design tokens, accessibility requirements, and the user's specific instructions. Preserve functionality and existing visual consistency; do not turn a focused change into a broad redesign.

Prioritize clear hierarchy, restraint, immediate feedback, usable targets, visible keyboard focus, and reduced-motion support. Use motion only where it clarifies state or interaction. Apple-style guidance is not a requirement for glass, animation, or decorative effects on every control. Where the upstream skill's introductory response applies to a no-task invocation, do not let it replace carrying out a concrete UI request.

Do not install this in a global agent skills directory or add it as an unconditional rule for other workspaces. Keep the full skill out of the always-on system prompt: the project instructions and runtime prompt point to it for reading when needed.

## Provenance

- Upstream: https://github.com/emilkowalski/skills
- Skill: https://github.com/emilkowalski/skills/blob/main/skills/apple-design/SKILL.md
- Pinned revision: `85e8e2363b713506e1d5b6e07a0eb2da66be1bc3`
- Upstream skill blob: `adf68c517f2d7d2781587d619de07f4de286da57`
- License: MIT; original copyright and permission notice in [`LICENSE`](./LICENSE).
- `SKILL.md` SHA-256: `77bb63b7043bb93aca2ff4ab040c249484eef35682bb6ff7163433c31d30adc7`
- `LICENSE` SHA-256: `4ff5bdb7887ec1435c9cab0e8d1a7caee704d894d65c2a008ccc68b1cc2f260b`

The skill directory at this revision contains only `SKILL.md`; there are no additional scripts, reference files, relative links, or runtime dependencies to install. The upstream files here are unmodified. Updates are deliberate: review a new pinned revision, replace the skill and license from that same revision, and update these provenance fields and hashes. Do not fetch mutable `main` automatically during UI tasks.
