/**
 * Select a bounded recent transcript suffix without splitting tool-call exchanges
 *
 * Use when retaining verbatim messages after context compaction. The returned tailStart is a message offset; all earlier messages must remain represented by the summary. Both estimated-token and serialized-character budgets are hard limits, regardless of how few text messages remain. Assistant tool calls and their results form indivisible spans, including parallel results. If the newest span alone exceeds a limit, return an empty tail rather than overflowing or dropping part of an exchange. This function never edits the transcript.
 * @param opts.messages Canonical ordered transcript whose newest complete exchanges should be retained.
 * @param opts.maxTokens Maximum estimated tokens in the retained suffix; zero permits only an empty tail. @default 30000 @minimum 0
 * @param opts.maxChars Maximum serialized content and tool-call characters, including encoded payloads, retained verbatim. @default 120000 @minimum 0
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Canonical ordered transcript whose newest complete exchanges should be retained. */
        messages: Array<{ role: string; content?: unknown; tool_calls?: Array<{ id?: string }>; tool_call_id?: string; message_type?: string }>;
        /** Maximum estimated tokens in the retained suffix; zero permits only an empty tail. @default 30000 @minimum 0 */
        maxTokens?: number;
        /** Maximum serialized content and tool-call characters, including encoded payloads, retained verbatim. @default 120000 @minimum 0 */
        maxChars?: number;
    },
): Promise<{ tailStart: number; tokens: number; chars: number }> {
    const maxTokens = opts.maxTokens ?? 30000, maxChars = opts.maxChars ?? 120000;
    if (!Number.isFinite(maxTokens) || maxTokens < 0 || !Number.isFinite(maxChars) || maxChars < 0) throw new TypeError("Tail budgets must be finite and nonnegative");
    const messages = opts.messages, changes = new Int32Array(messages.length + 1);
    const calls = new Map<string, number>();
    let adjacentCall = -1;
    for (let i = 0; i < messages.length; i++) {
        const message = messages[i]!;
        if (message.role === "assistant" && message.tool_calls?.length) {
            adjacentCall = i;
            for (const call of message.tool_calls) if (call.id) calls.set(call.id, i);
        } else if (message.role !== "tool") adjacentCall = -1;
        if (message.role !== "tool") continue;
        const start = (message.tool_call_id ? calls.get(message.tool_call_id) : undefined) ?? adjacentCall;
        // No cut may orphan a result. Unknown legacy IDs still keep the adjacent
        // assistant and parallel results; a bare result cannot begin a suffix.
        const first = start >= 0 ? start + 1 : i;
        changes[first] = changes[first]! + 1;
        changes[i + 1] = changes[i + 1]! - 1;
    }
    const boundaries: number[] = [];
    let open = 0;
    for (let i = 0; i < messages.length; i++) {
        open += changes[i]!;
        if (open === 0) boundaries.push(i);
    }
    boundaries.push(messages.length);
    let tailStart = messages.length, tokens = 0, chars = 0;
    for (let i = boundaries.length - 2; i >= 0; i--) {
        const start = boundaries[i]!, group = messages.slice(start, tailStart);
        const groupChars = group.reduce((sum, m) => sum + (typeof m.content === "string" ? m.content.length : JSON.stringify(m.content ?? "").length) + JSON.stringify(m.tool_calls ?? []).length, 0);
        if (chars + groupChars > maxChars) break;
        const groupTokens = await ctx.fns.compaction.estimateTokens({ messages: group });
        if (tokens + groupTokens > maxTokens) break;
        tailStart = start; chars += groupChars; tokens += groupTokens;
    }
    return { tailStart, tokens, chars };
}
