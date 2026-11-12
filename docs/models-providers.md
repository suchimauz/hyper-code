# Model provider SDK v0

This SDK registers LLM connection providers beside the existing `llm` / `llms`
routing system. Registration does **not** change agent models, accounts or inference.
The current foundation provides the types, declaration loader and metadata catalogue.
Connection storage, transport execution, provider operations and the Models settings
UI are separate implementation stages; do not assume those APIs are available yet.

## Declare a provider

Put `$modelProvider_<id>.ts` in a mounted core module or mounted plugin source
namespace. Default-export a `types.models.ProviderDefinition`. The filename and
`id` must match and use lowercase kebab-case (`acme`, `acme-chat`, not `Acme`,
`acme_foo`, `acme--chat`). No plugin-owner prefix is required.

Minimal offline example, also verified by `src/models/providers.test.ts`:

```ts
export default {
    id: "acme",
    label: "Acme",
    description: "Fixture provider",
    icon: "Boxes",
    fields: [
        { key: "baseUrl", label: "Base URL", type: "url", required: true, default: "https://example.invalid" },
        { key: "apiKey", label: "API key", type: "secret", required: true },
    ],
    transports: ["direct"],
    test: async () => ({
        status: "configured",
        reason: "fixture",
        message: "Fixture only",
        checkedAt: 1,
    }),
} satisfies types.models.ProviderDefinition;
```

The example deliberately makes no network request. A real test should use the
connection's bound `fetch`, return the actual check time (`Date.now()`), and return
only safe messages. Providers run in the server process with the full `Context`;
this contract is **not** a security sandbox. Never log secrets or response bodies
that may contain credentials.

## Backend contract

`types.models.ProviderDefinition` requires `id`, `label`, `fields`, `transports`
and `test(ctx, conn)`. `description` and `icon` (Lucide name or data URL) are optional.

| Member | Result / purpose |
| --- | --- |
| `test(ctx, conn)` | `Promise<TestResult>`; required connection check |
| `listModels(ctx, conn)` | Optional `Promise<ModelInfo[]>` |
| `usage(ctx, conn)` | Optional `Promise<UsageReport>` |
| `validate(ctx, config)` | Optional synchronous/async validation; throw to reject |
| `actions[name]` | `{ label, run(ctx, conn, input) }` for provider-owned login/logout or other operations |

These callbacks belong to the declaration object, not the `ctx.fns` procedure
calling convention. Runtime procedures still take a single options object.

`ResolvedConnection` contains `id`, `provider`, `accountName`, non-secret `config`,
`secret(key): Promise<string | null>` and `fetch(url, init?): Promise<Response>`.
It contains no secret reference map and no other connections. Secret access is
lazy; absent values return `null`. Use `conn.fetch` rather than global `fetch`
so the connection's transport is respected. `config` values are strings, numbers,
booleans, null or string arrays (including manually configured model ids).

`TestResult` contains `status`, machine-readable `reason`, safe `message`, and
`checkedAt` in Unix epoch milliseconds. Status is `available`, `unavailable`,
`configured`, or `disabled`; core is responsible for returning `disabled` without
calling the provider. `ModelInfo` contains a provider-native `id` with optional
`label`, `description`, `contextWindow` and `maxOutputTokens`.

`UsageReport` contains `status`, optional `reason`, and `checkedAt`; optional
`windows` contain `label`, `usedPercent` (0–100), `remaining`, and `resetAt`
(epoch milliseconds). Optional `balance` is `{ amount, currency }`. The planned
status-only fallback contains no invented quota data. `State.health` reserves
cache entries with `expiresAt`, `result` and an in-flight `pending` promise;
cache execution is not implemented by the registry.

Provider actions accept and return JSON-compatible `ActionValue`. Returned values
must contain no credentials or secret references. Core does not implement
provider-specific authorization. Declaring an action does not itself expose an
HTTP endpoint or grant permission to invoke it.

## Field schemas and transports

Each `FieldSpec` has a unique safe `key`, `label`, `type`, optional `required`,
`help`, and `placeholder`. Supported types:

- `text` / `url`: optional string `default`.
- `select`: nonempty `options: { value, label }[]` with unique values; an optional
  default must match an option.
- `secret`: **no default**. Never put a credential in help, placeholders or labels.
- `number` / `boolean`: optional default of the matching type (finite for numbers).

The loader validates declaration shape, rejects secret defaults and malformed
optional callbacks. Connection-value validation and encrypted storage belong to
the later connection-management layer, not this catalogue.

`transports` is a nonempty list of distinct `direct`, `socks`, `ssh-tunnel` values.
`TransportSpec` is `{ kind: "direct" }`, `{ kind: "socks", proxyId }` or
`{ kind: "ssh-tunnel", instance }`. The latter two reference saved infrastructure,
not inline proxy credentials. Transport execution, validation, abort/timeout and
no-direct-fallback guarantees are implemented in the separate transport block.

## Ownership and reload

The loader resolves ownership from the declaring entry's mounted `root`,
`rootDir` and absolute path, checked against `procs.modules.list({})`. A namespace
name alone is not an identity. Metadata-free development reloads must match a
trusted boot entry. Unmounted paths and path escapes are rejected.

- The first mounted owner claims a provider id.
- Another owner cannot replace it, even if both files share a module path.
- `custom` is reserved for `core`, even before its declaration loads.
- The same owner may reload its declaration, replacing the definition.
- Invalid declarations throw an error naming the file, without replacing the
  previous definition or clearing other registered providers. A batch stops on
  the invalid declaration; it does not silently skip errors.

At boot, `$loader_modelProvider.ts` registers the kind automatically. Reload an
existing namespace with `await ctx.fns.procs.repl.load({ name: "yourNamespace" })`;
`modelProvider` is a hot-reloadable declarative kind. Reloading replaces found
entries; removing/renaming a declaration does **not** reconcile stale registry
entries. Plugin mount/unmount lifecycle is separate from this SDK foundation.

## Catalogue

`await ctx.fns.models.providers({})` returns a sorted `ProviderView[]` with only
`id`, `label`, optional `description`/`icon`, copied field schemas, allowed
transports and `{ name, label }[]` action metadata. It exposes neither executable
callbacks, ownership bookkeeping, connection values nor secret references.
Unknown internal properties are not spread into the result, and secret defaults
are stripped defensively. Provider authors remain responsible for keeping their
explicit public metadata free of secrets.

## UI slot `modelProviders`

A plugin can replace the schema-driven form for its own provider. Grant the id in
`package.json` and register a component from `ui/index.tsx` (React and the
public `@mauzcode/ui` entry only):

```json
{ "procs": { "ui": { "modelProviders": ["acme"] } } }
```

```tsx
import type { UiExtension, ExtensionModelProviderProps } from '@mauzcode/ui';
function AcmeForm({ provider, connection, onSaved, onCancel }: ExtensionModelProviderProps) { /* … */ }
export default { id: 'acme', apiVersion: 1, modelProviders: [{ provider: 'acme', component: AcmeForm }] } satisfies UiExtension;
```

Props: `context`, `provider` (`ModelProviderView`), optional `connection`
(`ModelConnectionView`, secret-free: `secrets` holds only booleans), `onSaved(connection)`
and `onCancel()`. The component saves through `POST /models/api` with SDK
`requestJson` (cookie-bound CSRF). Ids must be kebab-case and never `custom`.
The component is used only when the grant lists the id and the bundle is
approved; an ungranted entry is ignored and the schema form is used; two
extensions granting the same id is a registry error. Grants are part of the
approval comparison, so adding one sends the bundle back for review. UI
grants/approval never replace backend owner checks or CSRF protection, and plugin
UI approval does not sandbox backend code.

## Verification

```sh
bun test ./src/models/ --timeout 20000
bunx tsc --noEmit
```

After adding types or declarations, regenerate types with
`await ctx.fns.procs.dev.genTypes({})`. The loader, ownership, schema validation,
secret-free projection and documentation example are covered by unit tests;
boot/reload tests cover actual declaration discovery and replacement.
