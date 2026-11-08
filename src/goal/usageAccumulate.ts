/**
 * Accumulate immutable goal-bound per-request usage with strict replay deduplication
 *
 * Use for one source/run/goal accounting epoch. Deduplicates identical request IDs and rejects changed request evidence or source binding. Partial aggregates sum only reported components and retain each request’s missing fields. Incomplete aggregates never regain exact quality. Pure in-memory arithmetic without DB access; rejects totals beyond signed i64 instead of silently saturating exact counters.
 * @param opts.usage Normalized per-request evidence with immutable source and goal attribution.
 * @param opts.state Previous accumulator for the same source/run/root/goal; omit to start a new epoch.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Normalized per-request evidence with immutable source and goal attribution. */
        usage: types.goal.UsageNormalized;
        /** Previous accumulator for the same source/run/root/goal; omit to start a new epoch. */
        state?: types.goal.UsageAccumulator;
    },
): Promise<types.goal.UsageAccumulator> {
    const u = opts.usage, previous = opts.state;
    const keys = ['sourceAgentId','runId','rootAccountingAgentId','goalIdAtBoundary'] as const;
    for (const key of ['provider','requestId','sourceAgentId','runId','rootAccountingAgentId'] as const) if (typeof u[key] !== 'string' || !u[key].trim()) throw new Error('Invalid usage identity');
    if (u.goalIdAtBoundary !== null && (typeof u.goalIdAtBoundary !== 'string' || !u.goalIdAtBoundary.trim())) throw new Error('Explicit goal binding required');
    if (!['exact','partial','unknown','unsupported'].includes(u.quality)) throw new Error('Invalid usage quality');
    const max=9223372036854775807n;
    const parse=(v:string|null):bigint => { if(typeof v !== 'string' || !/^(0|[1-9][0-9]*)$/.test(v) || v.length > 19 || BigInt(v)>max) throw new Error('Invalid normalized i64 count'); return BigInt(v); };
    if (u.quality === 'exact') { if(parse(u.cachedInputTokens)>parse(u.inputTokens)) throw new Error('Cached input exceeds inclusive input'); parse(u.outputTokens); }
    else { for (const value of [u.inputTokens,u.cachedInputTokens,u.outputTokens]) if(value !== null) parse(value); }
    if(previous) for(const key of keys) if(previous[key] !== u[key]) throw new Error('Usage source/run/goal binding changed');
    const fields=['provider','requestId',...keys,'format','quality','reason','inputTokens','cachedInputTokens','outputTokens'] as const;
    const old=previous && Object.hasOwn(previous.requests,u.requestId) ? previous.requests[u.requestId] : undefined;
    if(old) { if(fields.some(key=>old[key]!==u[key])) throw new Error('Conflicting usage request replay'); return previous!; }
    const quality:types.goal.UsageAccumulator['quality'] = (previous?.quality ?? 'exact') === 'exact' && u.quality === 'exact' ? 'exact' : 'partial';
    // These counters sum reported components only. Missing observations remain null
    // in requests; zero here is the additive identity, not invented provider usage.
    const input=parse(previous?.inputTokens ?? '0')+parse(u.inputTokens ?? '0');
    const cached=parse(previous?.cachedInputTokens ?? '0')+(u.inputTokens === null ? 0n : parse(u.cachedInputTokens ?? '0'));
    const output=parse(previous?.outputTokens ?? '0')+parse(u.outputTokens ?? '0');
    if(input>max || cached>max || output>max) throw new Error('Usage aggregate exceeds i64');
    const inputTokens=String(input),cachedInputTokens=String(cached),outputTokens=String(output);
    const requests:Record<string,types.goal.UsageNormalized>=Object.create(null);
    if(previous) for(const [id,evidence] of Object.entries(previous.requests)) requests[id]=Object.freeze({...evidence});
    requests[u.requestId]=Object.freeze({...u});
    return Object.freeze({sourceAgentId:u.sourceAgentId,runId:u.runId,rootAccountingAgentId:u.rootAccountingAgentId,goalIdAtBoundary:u.goalIdAtBoundary,quality,inputTokens,cachedInputTokens,outputTokens,requests:Object.freeze(requests)});
}
