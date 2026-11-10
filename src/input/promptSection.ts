// The input equivalent of markdown.promptSection: the system prompt lists the
// kinds that are actually loaded, so a plugin's kind is advertised exactly while
// it is mounted.
/**
 * Builds the system-prompt block that tells agents how to ask the person through chat inputs and lists the loaded kinds.
 */
export default function (ctx: Context, _session: Session | null, _opts: {}): string {
    const kinds = ctx.fns.input.kinds({}).filter(k => k.hint);
    if (!kinds.length) return "";
    return [
        "## Chat inputs",
        "",
        "To ask the person for something structured — a secret, a yes/no on an outward action, one of several options, a pick from a table — open a form in the chat instead of asking in prose: `await ctx.fns.input.request({ kind, title, message?, spec, waitForAnswer: true })`. Waiting is explicit for every kind; omitting waitForAnswer never blocks dispatch. Optional expiresAt is a future epoch-millisecond deadline, expired by the worker without a browser. It returns at once with the input id; end your turn. The answer arrives later as a user turn `<input-result id kind state>` with a one-line summary and JSON result (state `cancelled` when the person declined). Never ask for secrets in plain chat.",
        "",
        ...(kinds.some(kind => kind.name === "batch") ? [
            "For a chain of questions of different compatible kinds, use ONE input.request with kind:'batch', spec:{items:[{key,kind,title,message?,spec?,expiresAt?},...]}, and waitForAnswer:true. Each key is unique; 1–30 steps. The person can edit drafts until the final send. The agent receives one aggregate input-result with answers:[{key,kind,result}] only after atomic success. Cancel/expiry discards drafts; a final-save error cancels the entire batch with a safe error and no partial answers. Batch collects answers only: no external actions, nested batches, planning reviews or protected approval forms. Plugin kinds must explicitly implement the batch collection contract; never fall back to their ordinary submit. Keep secrets in secret fields. Only a submitted batch's confirmed:true answer can represent its described generic confirmation; protected actions still require their own exact approval. End the tool turn after requesting; do not poll.",
            "",
        ] : []),
        ...kinds.map(k => `- \`${k.name}\` — ${k.hint!.trim()}`),
    ].join("\n");
}
