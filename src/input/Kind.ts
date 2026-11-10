// One kind of chat input — what a `$input_<kind>.ts` file default-exports.
//
// The framework owns the row (inputs table), the bubble around the form, the
// submit/cancel routes and the message that wakes the agent. A kind owns only
// what is specific to it: how its spec is checked, what the open form looks
// like, how a submission becomes a result, and how the answer looks afterwards.

export type Kind = {
    /** Server-only dispatch capability for dedicated authenticated completion; generic submit/cancel is denied. Resolve current registered identity after hot reload. Not an authorization sandbox. */
    completionAuthority?: object;
    /** Explicit public spec projection for owner-only React cards. Return only display-safe fields; never credentials, completion authority, transport tokens or raw results. Missing hook means metadata-only for plugin kinds. */
    projectCard?: (ctx: Context, opts: { input: types.input.Row }) => Record<string, unknown> | null | Promise<Record<string, unknown> | null>;
    /** Optional display-safe chat-history summary of a terminal input (submitted, cancelled or expired), computed on the server from the stored row including its result. Return null to hide the row. Never include secrets, transport tokens or completion authority. Kinds without this hook do not appear in chat history. */
    history?: (ctx: Context, opts: { input: types.input.Row }) => types.input.HistorySummary | null | Promise<types.input.HistorySummary | null>;
    /** Validate and normalise the spec when the agent opens the input; throw to refuse it. */
    prepare?: (ctx: Context, opts: { spec: Record<string, any> }) => Record<string, any> | Promise<Record<string, any>>;
    /** Trusted server deadline, read from authoritative state after prepare. Return a future safe epoch-millisecond integer or undefined for no constraint. The caller may shorten but cannot extend it. */
    deadline?: (ctx: Context, opts: { spec: Record<string, any> }) => number | undefined | Promise<number | undefined>;
    /** Form fields of the open input; the framework wraps them in the form with title, buttons and cancel. */
    open: (ctx: Context, opts: { input: types.input.Row; error?: string | null }) => string | Promise<string>;
    /** Turn submitted fields into a result; throw an Error to show its message under the form and keep it open. */
    submit: (ctx: Context, opts: { input: types.input.Row; values: types.input.FormValues }) => types.input.Outcome | Promise<types.input.Outcome>;
    /** The answer, shown in place of the form once submitted. */
    done: (ctx: Context, opts: { input: types.input.Row }) => string | Promise<string>;
    /** Optional extra fragment endpoint, served at GET /input/<id>/part?…, e.g. filtered grid rows. */
    part?: (ctx: Context, opts: { input: types.input.Row; query: URLSearchParams }) => string | Promise<string>;
    /** Optional JSON row search for native React cards, e.g. grid rows filtered by q; return only displayable cells. */
    search?: (ctx: Context, opts: { input: types.input.Row; q: string }) => Promise<{ rows: { value: string; cells: string[] }[]; page: number }>;
    /** Submit buttons under the fields; omitted → one primary "Submit" button, "" → none (fields submit themselves). */
    buttons?: (ctx: Context, opts: { input: types.input.Row }) => string | Promise<string>;
    /** Whether the framework shows its own Cancel button. @default true */
    cancel?: boolean;
    /** Phosphor icon name for the bubble header. */
    icon?: string;
};

