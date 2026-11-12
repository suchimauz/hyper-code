// Claude models compact on the server (Anthropic compact-2026-09-04 beta): the
// transcript goes out with `compaction: {type:"summarize"}` and comes back as a
// signed `compaction` block with a readable summary. toAnthropicMessages replays
// it byte-for-byte as the first block of the request; streamAnthropic adds the
// beta header. Models without support fall back to the generic text summary.
// The agent system prompt is NOT sent: its output-format rules (respondHtml…)
// leak into the summary; the block replays fine under any system prompt.

/**
 * Compacts a Claude transcript into a native signed server compaction block.
 * @param opts.model Claude model identifier.
 * @param opts.messages Effective transcript to compact.
 */
export default async function (ctx: Context, session: Session | null, opts: Parameters<types.compaction.Compactor>[2]): Promise<types.compaction.CompactionResult> {
    const endpoint=await ctx.fns.llm.resolveEndpoint({model:opts.model});
    for(let retry=0;;retry++) {
    try {
        const { block } = await ctx.fns.llm.compactAnthropic({ model: opts.model, focus: opts.focus, messages: opts.messages, signal: opts.signal });
        return { message: { role: "user", content: JSON.stringify(block), message_type: "anthropic_compaction" }, summary: block.content };
    } catch (error: any) {
        opts.signal?.throwIfAborted();
        const failure=error?.failure ?? ctx.fns.llm.proxyFailure({error,provider:endpoint.provider,account:endpoint.account});
        if(failure?.code.startsWith("PROXY_")) {
            const decision=await ctx.fns.llm.retryDecision({failure,retry});
            if(!decision.retry)throw error;
            await ctx.fns.llm.retryDelay({ms:decision.delayMs,signal:opts.signal});
            continue;
        }
        if(endpoint.noFallback || error?.noFallback)throw error;
        const fallback = (ctx.state as any).compaction?.compactors?.default as types.compaction.CompactorEntry | undefined;
        if (!fallback) throw error;
        ctx.fns.procs.log.warn({ event: "compaction.anthropic-fallback", msg: String(error?.message ?? error).slice(0, 300) });
        return fallback.compact(ctx, session, opts);
    }
    }
}
