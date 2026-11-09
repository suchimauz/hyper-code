/** Annotate a user event with structured function-RAG metadata, preserving any historical HTML without regenerating presentation markup. */
export default async function (
    ctx: Context,
    _session: Session | null,
    opts: {
        /** Agent whose user event is annotated. */
        agent: types.agent.Agent;
        /** Message index associated with the user event. */
        messageIdx: number;
        /** Retrieved runtime function descriptions. */
        functions: Array<{ name: string; summary: string; signature: string; score?: number; rank?: number; bm25?: number | null; similarity?: number | null; jev?: number | null }>;
        /** Exact compact block appended to the outgoing user message. */
        injected: string;
        /** Whether a typed decision model reordered the candidates. */
        reranked?: boolean;
        /** Rerank outcome, including skipped retrieval and provider errors. */
        rerankStatus?: "off" | "skipped" | "ok" | "error";
        /** Whether the pre-retrieval gate ran and what it decided. */
        gate?: "open" | "closed" | "off" | "error";
        /** Heuristic pre-retrieval gate score, never a calibrated probability or reranker score. */
        needsTool?: number | null;
        /** How many candidates retrieval returned before reranking. */
        retrieved?: number;
    },
): Promise<{ updated: boolean }> {
    const events = await ctx.fns.session.getEvents({ id: opts.agent.id });
    const event = events.find((item: any) => item.type === "user" && Number(item.messageIdx) === Number(opts.messageIdx));
    if (!event) return { updated: false };
    event.functionRag = {
        functions: opts.functions.slice(0, 5),
        reranked: opts.reranked === true,
        gate: opts.gate ?? "off",
        rerankStatus: opts.rerankStatus ?? (opts.reranked ? 'ok' : 'off'),
        needsTool: opts.needsTool ?? null,
        retrieved: Number(opts.retrieved ?? 0),
        injected: String(opts.injected).slice(0, 6000),
    };

    const result = await ctx.fns.session.replaceEventAt({ id: opts.agent.id, idx: event.idx, event });
    if (result.updated) {
        await ctx.fns.session.syncAgentState({ agent: opts.agent });
        ctx.fns.procs.events.refresh({ topic: `agent:${opts.agent.id}`, reason: 'function-rag' });
    }
    return result;
}
