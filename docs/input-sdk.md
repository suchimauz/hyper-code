# Chat input SDK

Use chat inputs for human answers that must survive refreshes and agent restarts. The backend owns the input row, validation, completion and queue gates; a React extension only presents a server-projected card. This is separate from transient `SecureInputDialog` and `/secureInput/*`.

## Request and durable waiting

```ts
// In an agent eval: make this the last operation, then end the turn.
await ctx.fns.input.request({
  kind: 'choice',
  title: 'Choose a target',
  spec: { options: ['staging', 'production'] },
  waitForAnswer: true,
  expiresAt: Date.now() + 10 * 60_000,
});
```

`input.request` returns immediately with `{ id, kind, state: 'open', agentId }`. `agentId` defaults to the current agent. `waitForAnswer` is **explicit**: only `true` creates a durable dispatch gate, for any registered kind; omission is nonblocking. `expiresAt` is optional and must be a future safe integer in epoch milliseconds. Do not set internal `_agentWait` or `_expiresAt` spec keys; the request strips them and derives them from explicit options and the trusted deadline hook.

A registered kind may implement `deadline?: (ctx, { spec }) => number | undefined | Promise<number | undefined>`. It runs after `prepare` with the normalized spec and must read any protected expiry from authoritative server state, not trust a caller-supplied timestamp. A returned value must be a future safe integer in epoch milliseconds; invalid or elapsed deadlines reject creation. The stored `_expiresAt` is the earlier of this deadline and explicit `expiresAt`; callers cannot extend the kind's deadline. Returning `undefined` adds no constraint. This does not change the explicit `waitForAnswer` default.

A waiting request ends the tool batch at its next safe boundary, including when an answer arrives early. It cannot interrupt JavaScript already running inside the eval: do not put writes or more work after the request. Do not poll or sleep. Terminal completion delivers a user message of the form `<input-result id="…" kind="…" state="…">`, with an outcome summary and safe JSON result. Cancellation and expiry are not approval.

### Queue and lifecycle

- Postgres is authoritative. The queue is inline in `agents` (`next_run_at`, `run_state`, `last_processed_msg_idx`), not a separate jobs table.
- An input with the explicit wait flag and state `open` **or** `processing` blocks dispatch. All outstanding wait gates must clear; answering one of several does not resume the agent prematurely. Ordinary messages and wakeups do not bypass these gates.
- Completion records the terminal result and schedules only an eligible agent. Stop (`stopped_at`), archive and a paused plan remain respected. Answering a card does not undo Stop. Restarting/resuming does not discard unanswered gates.
- Worker housekeeping calls `input.expireDue` on wake and on an idle cadence of at most 30 seconds. This is not a hard real-time deadline: worker availability, load and bounded batches can delay processing. No browser is needed.
- Only due **open** rows expire. A `processing` external approval is intentionally not auto-expired or retried: the owning plugin must reconcile external receipts after a crash. Never infer that an interrupted request failed and resend it blindly.

## Backend kind and ownership

A mounted plugin named `demo` can register `$input_demo-note.ts` in its source module. A kind default-exports `types.input.Kind` with required `open`, `submit` and `done` handlers, plus optional `prepare`, `projectCard`, `search`, `part`, `buttons`, `cancel`, `icon` and `completionAuthority`.

Registration checks the **mounted source owner**, not merely the namespace or filename. Non-core kinds must begin with `<owner>-`; a plugin cannot replace `choice`, `confirm`, `grid`, `secret`, `planning-review`, or another owner's kind. Same-owner reload is allowed. Keep the server HTML handlers: they support compatibility consumers even when the primary card is React.

`GET /input/cards?agentId=…` is owner-only and same-origin. It returns every open/processing card and the latest 100 terminal receipts. Core specs use allowlists. A plugin gets metadata only unless it supplies `projectCard(ctx, { input })`, returning a display-safe object or `null`. The hook receives a row with no raw result/error; project only named public fields. Never spread `input.spec` into the projection. Top-level private keys are filtered, but that is not recursive sanitization: the plugin must exclude credentials, transport tokens, authority objects and secret values everywhere. Titles and messages must also be display-safe.

### Minimal ordinary-input example

These snippets are for an existing mounted **private** plugin `demo`, not a core runtime dependency. This input collects a note; it does not authorize an external action.

`src/demo/$input_demo-note.ts`:

```ts
export default {
  prepare(_ctx, { spec }) {
    if (typeof spec.prompt !== 'string' || spec.prompt.length > 500)
      throw new Error('A prompt of at most 500 characters is required');
    return { prompt: spec.prompt };
  },
  projectCard(_ctx, { input }) {
    return { prompt: String(input.spec.prompt) };
  },
  open(_ctx, { input }) {
    return `<label>${Bun.escapeHTML(String(input.spec.prompt))}`
      + '<input name="note" required maxlength="500"></label>';
  },
  submit(_ctx, { values }) {
    if (typeof values.note !== 'string' || !values.note.trim()
        || values.note.length > 500) throw new Error('Enter a note (1–500 characters)');
    return { result: { note: values.note.trim() }, summary: 'Note received' };
  },
  done() { return '<p>Note received.</p>'; },
} satisfies types.input.Kind;
```

Merge this grant into the plugin's existing `package.json` (do not replace its other metadata):

```json
{ "procs": { "ui": { "inputKinds": ["demo-note"] } } }
```

`ui/index.tsx`:

```tsx
import { useState } from 'react';
import { Button, TextField, requestJson,
  type ExtensionInputProps, type UiExtension } from '@mauzcode/ui';

function NoteCard({ context, input, onDone }: ExtensionInputProps) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const locked = context.readOnly || input.state !== 'open' || busy;
  async function send() {
    if (locked) return;
    setBusy(true); setError('');
    try {
      await requestJson<{ state: string; error: string | null }>(
        `/input/${encodeURIComponent(input.id)}`, {
          method: 'POST', body: { values: { note } },
        });
      onDone(); // Refetch authoritative state, not local completion.
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the note');
    } finally { setBusy(false); }
  }
  return <form onSubmit={event => { event.preventDefault(); void send(); }}>
    <TextField label={typeof input.spec?.prompt === 'string' ? input.spec.prompt : 'Note'}
      value={note} onChange={event => setNote(event.target.value)}
      required maxLength={500} disabled={locked} />
    <Button type="submit" disabled={locked}>{busy ? 'Saving…' : 'Submit'}</Button>
    {error && <p role="alert">{error}</p>}
  </form>;
}

export default {
  id: 'demo', apiVersion: 1,
  inputKinds: [{ kind: 'demo-note', component: NoteCard }],
} satisfies UiExtension;
```

After mounting/reloading the backend and building the plugin UI through the normal plugin workflow, a human must manually approve a non-official plugin's exact bundle hash in Plugins. Changing source or grants invalidates that approval. Do not auto-approve a bundle. The host builds and loads approved plugin UI without frontend edits or a core rebuild. Request the example with:

```ts
await ctx.fns.input.request({
  kind: 'demo-note', title: 'Add a note',
  spec: { prompt: 'What should we remember?' }, waitForAnswer: true,
});
```

## React contract

Import only `react`, public `@mauzcode/ui` and the plugin's declared package dependencies. Do not deep-import host modules or bundle another React runtime. `UiExtension.inputKinds` entries are `{ kind, component }`, require matching `procs.ui.inputKinds` grants, and must use the plugin's owner prefix. These are trusted same-origin extensions, **not sandboxes**.

The public props exported by `@mauzcode/ui` are:

```ts
type ExtensionInputProps = {
  context: Readonly<{
    agentId: string | null;
    theme: 'light' | 'dark';
    readOnly: boolean;
  }>;
  input: Readonly<{
    id: string; kind: string; title: string;
    message?: string; spec?: Record<string, unknown>; state?: string;
  }>;
  onDone: () => void;
};
```

The host supplies `readOnly: input.state !== 'open'` (not a check for a nonexistent `pending` state), renders lifecycle status and refetches on live updates. Handle missing projection fields safely. `onDone()` **only refreshes server state**: it neither approves, completes, cancels nor resumes anything. Frontend read-only controls and grants never substitute for endpoint authorization. Preserve semantic themes, labels, focus and reduced motion; use the public SDK components.

## Ordinary submission versus protected completion

For ordinary kinds, `POST /input/:id` accepts form data or JSON `{ values, cancel? }`. JSON `values` must be an object of **strings or string arrays**, not booleans, numbers, objects or files. `cancel` is an optional boolean; cancellation still sends `values: {}`. `_action` and prototype-related keys are rejected in JSON. The route enforces owner access, same-origin and cookie-bound CSRF. `requestJson` uses the existing CSRF token (explicit `csrfToken` or the page meta token), sends JSON, rejects redirects and does not retry writes. Its type parameter does not validate a response. Handle errors, including 401/403, without treating every 403 as a login failure.

`input.submit` validates ordinary results with the registered kind and refuses **both** generic submit and cancel for kinds declaring `completionAuthority`. A protected plugin must use its dedicated authenticated, CSRF-protected endpoint and verify the exact immutable action, current input/draft binding, actor, expiry and one-time claim before any external write. A generic confirm card or agent message is not a substitute for that protocol.

After its authoritative handler succeeds (or records a valid cancellation), the plugin calls `input.complete({ id, state, summary, result, actor, authority })`. States are `submitted`, `cancelled` or the server expiry path `expired`; results must be safe JSON, never secrets. The authority must be the **current registered object's identity**, resolved after hot reload, never serialized to the browser. It is a server dispatch fence, not a security sandbox and not authorization to perform an external action. Ordinary kinds use `input.submit`, not `complete`.

Completion atomically transitions the row and appends a single terminal message while respecting queue gates. Repeated completion does not duplicate the result. When joining an existing framework transaction, the caller must refresh and wake the worker **after commit**. External services are not part of that Postgres transaction: use immutable snapshots, idempotency/receipts and explicit reconciliation rather than automatic retries.

A private Redmine integration may adopt this lifecycle and a granted native card while retaining its independent exact-draft browser approval. It must not turn generic submission, `onDone`, bundle approval or possession of an input ID into Redmine write authority. Core must not import or depend on a private Redmine plugin.

## Compatibility and source of truth

Absent/unapproved plugin views continue through the secure-input compatibility host; a failed native card offers a compatibility link. Keep `input.compatView`, server `open`/`done` rendering, protected transports and necessary SSR documents. This SDK is not a declaration that all HTML/HTMX is removed. See [UI architecture](ui-architecture.md).

Authoritative contracts: `src/input/{request,Kind,cards,submit,complete,expireDue}.ts`, `src/input/$loader_input.ts`, `src/input/$route_$id_POST.ts`, `src/agent/workerLoop.ts`, `frontend/src/extensions/{types,registry,pluginRuntime}.ts`, `frontend/src/components/mauzcode/PluginInputHost.tsx` and `frontend/src/sdk/index.ts`.
