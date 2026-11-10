/**
 * Computes a per-model factor that scales local token estimates to provider-reported prompt tokens
 *
 * Use to correct local token estimates for a model: the median ratio prompt_tokens / estimatedPromptTokens over the latest 20 context_usage events of that model whose estimate used the same method (model tokenizer or chars/4 heuristic) as now. Clamped to 0.5–3; fewer than 3 samples returns 1. Cached in memory for 60 seconds. Multiply estimates by factor; never apply it to provider-reported counts.
 * @param opts.model Provider-qualified model route whose estimates are corrected.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Provider-qualified model route whose estimates are corrected. */
        model: string;
    },
): Promise<{ factor: number; samples: number; source: 'tokenizer' | 'heuristic' }> {
    const state = (((ctx.state as any).compaction ??= {}) as any);
        const cache: Map<string, { at: number; value: { factor: number; samples: number; source: 'tokenizer' | 'heuristic' } }> = (state.calibration ??= new Map());
        const source = await ctx.fns.compaction.tokenizer({ model: opts.model }) ? 'tokenizer' as const : 'heuristic' as const;
        const key = opts.model + '|' + source;
        const hit = cache.get(key);
        if (hit && Date.now() - hit.at < 60_000) return hit.value;
        // Bounded scan: the 20 most recently updated agents on this model, 20 latest usage events each (uses the (agent_id, idx) key).
        const rows = await ctx.fns.procs.db.select({ sql: "SELECT e.payload, e.ts FROM (SELECT id FROM agents WHERE model = ? ORDER BY updated_at DESC NULLS LAST LIMIT 20) a CROSS JOIN LATERAL (SELECT payload, ts FROM events WHERE agent_id = a.id AND type = 'context_usage' ORDER BY idx DESC LIMIT 20) e ORDER BY e.ts DESC", params: [opts.model] }) as Array<{ payload: string }>;
        const ratios: number[] = [];
        for (const row of rows) {
            let p: any;
            try { p = JSON.parse(row.payload); } catch { continue; }
            const prompt = Number(p?.usage?.prompt_tokens), estimate = Number(p?.estimatedPromptTokens);
            if (p?.model !== opts.model || (p?.estimateSource ?? 'heuristic') !== source || !(prompt > 0) || !(estimate > 0)) continue;
            ratios.push(prompt / estimate);
            if (ratios.length >= 20) break;
        }
        let factor = 1;
        if (ratios.length >= 3) {
            ratios.sort((a, b) => a - b);
            const mid = ratios.length >> 1;
            const median = ratios.length % 2 ? ratios[mid]! : (ratios[mid - 1]! + ratios[mid]!) / 2;
            factor = Math.min(3, Math.max(0.5, median));
        }
        const value = { factor, samples: ratios.length, source };
        cache.set(key, { at: Date.now(), value });
        return value;
}
