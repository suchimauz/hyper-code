/**
 * Read a single OpenCode member monthly budget without exposing member identities
 *
 * Use for Usage monetary spend and monthly budget. This is not the prepaid credit balance or a subscription allowance. Ambiguous multi-member responses and permission errors return unavailable; never aggregate members or return identifying data.
 * @param opts.timeoutMs Request deadline in milliseconds. @default 8000 @minimum 500 @maximum 30000
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Request deadline in milliseconds. @default 8000 @minimum 500 @maximum 30000 */
        timeoutMs?: number;
    },
): Promise<{available:boolean;spentUsd?:number;limitUsd?:number|null;resetsAt?:number;reason?:string}> {
    const plan = await ctx.fns.settings.getString({module:'llm',scopeType:'global',key:'opencodePlan'}) ?? 'payg';
    if (plan === 'go') return {available:false,reason:'Go subscription quota is available in Console; no documented quota API'};
    try {
    const res=await ctx.fns.llm.opencodeFetch({url:'https://opencode.ai/console/api/v1/budgets/members',init:{method:'GET',signal:AbortSignal.timeout(Math.max(500,Math.min(30000,opts.timeoutMs ?? 8000)))}});
    if(!res.ok) return {available:false,reason:'Member budget unavailable (HTTP '+res.status+')'};
    const rows=await res.json() as Array<{spent_micro_cents?:string;limit_micro_cents?:string|null;resets_at?:string}>;
    if(!Array.isArray(rows)||rows.length!==1) return {available:false,reason:'Member budget requires a single unambiguous member'};
    const row=rows[0]!;
    const money=(value:string|undefined)=>typeof value==='string'&&/^[0-9]+$/.test(value)&&Number.isSafeInteger(Number(value))?Number(value)/100000000:null;
    const spent=money(row.spent_micro_cents);const limit=row.limit_micro_cents===null?null:money(row.limit_micro_cents);
    if(spent===null || (row.limit_micro_cents!==null&&limit===null)) return {available:false,reason:'Unrecognized member budget amounts'};
    const resetsAt=typeof row.resets_at==='string'?Date.parse(row.resets_at):NaN;
    return {available:true,spentUsd:spent,limitUsd:limit,...(Number.isFinite(resetsAt)?{resetsAt}: {})};
    } catch { return {available:false,reason:'Member budget unavailable'}; }
}
