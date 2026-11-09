# Hyper

[![test](https://github.com/hyper-code-harness/hyper-code/actions/workflows/test.yml/badge.svg)](https://github.com/hyper-code-harness/hyper-code/actions/workflows/test.yml)

**A self-hosted workspace for AI agents that can extend their own tools.**

Chat with agents, connect tools through plugins, and work with files, documents, and interactive views alongside the conversation. Agents can add new capabilities as TypeScript functions and load them without restarting the server.

Hyper runs on **Bun + Postgres**, with a procedural TypeScript runtime built on [procs](https://github.com/niquola/procs). Conversations and task state persist in the database; functions stay in files you can inspect and change.

> Hyper is under active development. UI composition and plugin interfaces are evolving. It is intended for trusted environments, not for running untrusted agents in a sandbox.

## Watch: Agents on FHIR

A recording of Health Samurai's **Agents on FHIR working group meeting — October 15**. Watch the session on YouTube using the preview below.

[![Watch Agents on FHIR — working group meeting, October 15](https://i.ytimg.com/vi/ZpzxLonfERc/hqdefault.jpg)](https://www.youtube.com/watch?v=ZpzxLonfERc)

▶ **[Watch the recording on YouTube](https://www.youtube.com/watch?v=ZpzxLonfERc)** · Health Samurai

## What you can do

- **Work on code with persistent context.** Inspect a repository, edit files, run commands, and return to a conversation later.
- **Delegate focused work.** Give agents separate tasks and follow their plans and results without putting every detail into one chat.
- **Bring tools into the conversation.** Discover plugin capabilities for services such as GitHub, Google Workspace, Telegram, and web search. Individual integrations may require credentials or additional software.
- **See the output beside the chat.** Open files, documents, diagrams, charts, and plugin views in Canvas.
- **Extend the workspace while it runs.** Hot-reload procedures and HTTP routes without discarding session state. Plugins ship their own React UI in `ui/`; Hyper builds and loads it at runtime, without a frontend rebuild.
- **Use your existing coding harness.** Give trusted local Claude Code, Codex, and other shell-capable tools access to Hyper through its CLI.

For example: ask an agent to review a pull request, research an issue and show its findings in Canvas, or build a small integration you can reuse in later conversations.

## Quick start

### Requirements

- **macOS or Linux**. The installer uses launchd on macOS and a systemd user service on Linux. Some integrations are platform-specific.
- **Git and a running Docker installation**, including Docker Compose v2.
- **Bun**; the installer installs it if missing.
- An LLM provider API key, a supported authenticated CLI, or a local model server.

### Install

Clone the repository so you can inspect the installer before running it:

```bash
git clone https://github.com/hyper-code-harness/hyper-code.git ~/hyper-code2
cd ~/hyper-code2
# Review script/install.sh, then:
HYPER_DIR="$PWD" bash script/install.sh
```

The installer installs dependencies, starts ParadeDB (Postgres with search extensions), generates a database password, writes `DATABASE_URL` to the checkout's `.env`, and starts Hyper as a background service. It stores the database Compose configuration in `~/.hyper/docker-compose.yml` and binds Postgres to `127.0.0.1:54393`.

Open **http://localhost:3010/**. Configure your provider, then create a chat and select a model.

The installer can also update an existing installation: it fast-forwards the checkout, installs dependencies, and restarts the service. Review local changes before running it again.

### Integrated frontend and hot reload

The React UI lives in `frontend/` and shares the root `package.json`, `bun.lock`, and `node_modules` with Hyper. Install once with `bun install`; start everything with `bun run start` (or the existing Hyper service). Hyper starts and closes an in-process Vite server automatically. Do not run `frontend:dev` alongside the service: both use loopback port 5174.

The main UI is served at `/`; supported `/old-ui/` entry links now redirect to it. Shared SSR renderers, Canvas content and approval compatibility surfaces remain—this is not complete removal of legacy UI. Frontend edits use Vite Fast Refresh through the same Hyper address; `/ui-lab/` carries assets and the HMR socket, while `/ui-lab-api/` is the integrated UI adapter. Port 5174 is internal, not a separate public entry point. No production bundle is required for this live-development setup; install dev dependencies too.

- `bun run frontend:test` — React tests.
- `bun run frontend:build` — optional typecheck and bundle verification.
- `bun run frontend:storybook` — component development, separately from the main service.

The former private `hyper-ui-bridge` plugin is replaced by `src/frontendBridge/` and disabled in the project configuration. Existing `workspace.json` overrides must also disable that plugin (`"hyper-ui-bridge": false`). Neither the original UI directory nor a private plugin is required on a fresh checkout.

### Connect a model

API credentials belong in the checkout's `.env` or the corresponding provider settings. For example, add one of these to `.env` without removing the generated `DATABASE_URL`:

```dotenv
ANTHROPIC_API_KEY=your-key
# or
OPENAI_API_KEY=your-key
```

Restart the service after changing environment variables. On Linux, use `systemctl --user restart hyper.service`; on macOS, see [service installation](script/install-service.sh).

Models use the form `<provider>:<model-id>`. Available adapters include:

| Provider | Configuration |
| --- | --- |
| Anthropic | `ANTHROPIC_API_KEY` |
| OpenAI | `OPENAI_API_KEY` |
| OpenRouter | `OPENROUTER_API_KEY` |
| Groq | `GROQ_API_KEY` |
| Kimi / Kimi Coding | `KIMI_API_KEY` / `KIMI_CODING_API_KEY` |
| LM Studio | Local server; `LMSTUDIO_URL` |
| Claude Code | Existing Claude Code authentication; see [subscription operations](docs/anthropic-subscription-operations.md) |
| Codex | Existing authentication from `codex login` |

Subscription access depends on the provider's current authentication and model availability rules. Do not assume it is interchangeable with API-key access.

## Workspace and plugins

The UI brings navigation, a working surface, and conversation together. The older composition vocabulary below is a conceptual map; the primary React shell uses its sidebar, chat and secondary surfaces, not an automatically mounted SSR Dock/menu:

```text
Layout
├── Dock              Navigation and live badges
├── Canvas            Files, documents, diagrams, and plugin views
└── Chat              Conversation, header, and composer

Home / global menu
├── Widgets           Independent blocks of useful information
└── Search sources    Results supplied by core modules and plugins
```

**Layout → Regions → Widgets** is the direction of the UI redesign: the layout defines areas of the screen, plugins supply independent parts, and settings control their composition. Not every UI part is a home widget; Canvas tabs, chat parts, and search sources have separate contracts. The redesign is ongoing—this is a conceptual map, not a screenshot or a promise of a finished drag-and-drop editor.

Runtime plugins can provide more than tools. The `$widget_`, `$search_`, `$app_` and `$dock_` conventions below belong to compatibility SSR navigation; they do not automatically register React pages or grant browser execution. New primary-shell contributions are React UI extensions: a plugin puts its UI in `ui/index.tsx` and declares grants in `package.json` `procs.ui`; Hyper builds and loads it at runtime (see [UI architecture](docs/ui-architecture.md)). Canvas and Markdown renderers have their own contracts and remain separate from React extension slots:

| Convention | Purpose |
| --- | --- |
| `$widget_` | Home widgets |
| `$search_` | Sources for global search |
| `$app_` | Application pages in navigation |
| `$dock_` | Dock icons and live badges |
| `$canvas_` | Canvas tab kinds |
| `$fence_` | Rendered Markdown blocks, such as diagrams and charts |

See [plugin authoring](docs/plugin-authoring.md), [plugin runtime architecture](docs/plugin-runtime-architecture.md), and [UI architecture](docs/ui-architecture.md) for contracts and design details. UI design documents may describe work in progress.

Official plugins live in [`plugins/`](plugins/). Private integrations can live outside the repository in the configured `USER_PLUGINS` directory; small project-local procedures belong in `.hyper/`.

## How it works

**Native tools, discoverable procedures.** Agents receive tools with JSON Schema arguments. Tools can inspect files, execute commands, or evaluate code that calls the runtime's procedures. Provider adapters translate tool calls and results into each provider's wire format.

**One function per file.** A procedure at `src/<module>/<function>.ts` is available as `ctx.fns.<module>.<function>`. Calls take one options object; the runtime injects `ctx` and the request session:

```ts
await ctx.fns.procs.db.select({
  sql: "SELECT id FROM agents LIMIT ?",
  params: [10],
});

await ctx.fns.procs.repl.load({ name: "myModule" });
```

**State is separate from behavior.** Persistent conversations, events, and agent state live in Postgres. In-memory runtime state lives on `ctx.state`. Reloading a procedure replaces its implementation without restarting the process or discarding that state.

**Calls resolve through the registry.** Project functions call one another through `ctx.fns`, rather than importing each other's implementations. This makes hot-reload apply to existing call sites. Capitalized type files generate the shared `types.<module>.<Name>` namespace.

**The primary UI is React/Vite.** Bun serves the authenticated shell and APIs. Trusted React extensions use the local `@hyper/ui` alias (not a published package), host React, shared components and explicit grants (declared in a plugin's `package.json` `procs.ui`, approved per bundle) for pages, navigation, panels and actions. No private/deep imports or second React runtime. HTMX, `#main` and `$script` assets remain compatibility mechanisms, not the primary extension contract.

The SDK example remains a dev/test fixture with a separate test registry; it is not installed in production. Dead `legacyUi.rewriteResponse`/`navigationUrl` helpers have been removed, and SSH settings opens the native LLM Connections tab via callback rather than `/llms`. Dynamic HTTP layouts, People and other SSR pages, Canvas kind documents and secure approval transports still have live consumers; see the [concrete compatibility map](docs/ui-architecture.md#residual-compatibility-consumers).

Extensions are trusted same-origin code, not a sandbox. Frontend grants and read-only controls never replace backend authentication, ownership, CSRF or explicit human approval. SDK `requestJson` writes require the existing cookie-bound CSRF token. `subscribeLive`/`useLiveSubscription` require resync and error callbacks, topic declarations and cleanup. Preserve themes, keyboard focus, accessibility and reduced motion; the [Apple Design guidance](docs/skills/apple-design/README.md) applies only to Hyper UI. Start with [UI architecture](docs/ui-architecture.md) and `frontend/src/test/fixtures/sdk-example.tsx`.

Read more in [architecture](docs/architecture.md), [settings](docs/settings.md), and [tool-call protocols](docs/toolcall-protocols.md).

## External coding harnesses

The `hyper` CLI exposes the live runtime to trusted local shell-capable harnesses. From a checkout, invoke it with `bun script/hyper.ts`:

```bash
bun script/hyper.ts plugin search "GitHub pull request review"
bun script/hyper.ts function read gh.pr
bun script/hyper.ts tools
bun script/hyper.ts tool call find --json '{"path":"src","pattern":"*.ts"}'
bun script/hyper.ts repl 'return await ctx.fns.gh.me({})'
bun script/hyper.ts skills mount
```

See [external harnesses](docs/external-harnesses.md) for CLI setup, authentication, and usage.

## Development

After configuring the database and provider, run Hyper in the foreground:

```bash
bun install
bun run start
```

Stop an existing background instance first if it uses the same port. For normal function changes, prefer hot-reload over restarting the server.

```bash
# Generate runtime types, then type-check.
bun script/cli.ts types
bunx tsc --noEmit

# Run tests with the configured test database available.
bun test --timeout 15000
```

The test suite uses Postgres; it is not an in-memory SQLite-only suite. Some integrations have additional requirements. See the [CI workflow](.github/workflows/test.yml) for the automated test environment.

Key directories:

| Path | Contents |
| --- | --- |
| `src/` | Core procedures, types, routes, and UI |
| `src/procs/` | Vendored procedural runtime |
| `plugins/` | Official plugins |
| `.hyper/` | Project-local runtime extensions |
| `script/` | Installer, service management, and CLI entry points |
| `docs/` | Architecture, operations, and design notes |

## Security

**An agent with shell and runtime access can execute code with the server's privileges.** It may access files, query stored conversations, and use credentials granted to connected integrations. Plugins and the external REPL are trusted code, not isolation boundaries.

- Run Hyper under an account with only the access it needs.
- Keep API keys and database credentials out of Git and chat transcripts.
- Review plugins before enabling them and limit connected-account permissions.
- Treat confirmations for sending, publishing, deleting, and other external actions as essential safeguards—not as a substitute for access control.
- Do not expose the HTTP server or REPL to the public internet without reviewing authentication and deployment configuration. The installer's loopback database binding does not secure every application endpoint.

See [authentication](docs/auth.md) and [HTTPS setup](docs/https.md).

## Community

Join the [Hyper community on Telegram](https://t.me/+9Q6Ir0piDno1Nzcy) to ask questions, share what you build, and follow updates. Joining requires admin approval. For reproducible bugs and feature requests, please use [GitHub Issues](https://github.com/hyper-code-harness/hyper-code/issues/new/choose).


## Contributing

[Report a bug or propose a feature](https://github.com/hyper-code-harness/hyper-code/issues/new/choose). Include reproduction steps, relevant logs with secrets removed, and your platform and provider when reporting a problem.

For code changes, follow the procedural conventions: one function per file, calls through `ctx.fns`, documented options, and focused tests. Keep credentials and private plugins out of pull requests. Start with [architecture](docs/architecture.md) and [plugin authoring](docs/plugin-authoring.md).
