/** Handles the id automation post HTTP route.  * @param opts.req Incoming HTTP request.
 * @param opts.params Route path parameters.
*/
export default async function (ctx: Context, _session: Session | null, opts: {
        /** Incoming HTTP request. */
req: Request;
        /** Values bound to the operation. */
params: Record<string, string> }) {
    const form = await opts.req.formData();
    // Legacy toggles use checkbox absence as false. The context toggle has a
    // presence marker so old forms cannot silently reset its opt-in value.
    try {
        await ctx.fns.agent.setAutomation({
            id: opts.params.id!,
            functionRagEnabled: form.get('functionRagEnabled') === '1',
            jevRerankEnabled: form.get('jevRerankEnabled') === '1',
            functionRagGateEnabled: form.get('functionRagGateEnabled') === '1',
            jevCompactionEnabled: form.has('jevCompactionPresent') || form.has('jevCompactionEnabled')
                ? form.get('jevCompactionEnabled') === '1' : undefined,
            jevContextEnabled: form.has('jevContextPresent') || form.has('jevContextEnabled')
                ? form.get('jevContextEnabled') === '1' : undefined,
            jevAgentRoutingEnabled: form.has('jevAgentRoutingPresent') || form.has('jevAgentRoutingEnabled')
                ? form.get('jevAgentRoutingEnabled') === '1' : undefined,
            jevEvidenceEnabled: form.has('jevEvidencePresent') || form.has('jevEvidenceEnabled')
                ? form.get('jevEvidenceEnabled') === '1' : undefined,
            jevFileRankingEnabled: form.has('jevFileRankingPresent') || form.has('jevFileRankingEnabled')
                ? form.get('jevFileRankingEnabled') === '1' : undefined,
            jevResultReviewEnabled: form.has('jevResultReviewPresent') || form.has('jevResultReviewEnabled')
                ? form.get('jevResultReviewEnabled') === '1' : undefined,
            jevRiskReviewEnabled: form.has('jevRiskReviewPresent') || form.has('jevRiskReviewEnabled')
                ? form.get('jevRiskReviewEnabled') === '1' : undefined,
            jevModelRoutingEnabled: form.has('jevModelRoutingPresent') || form.has('jevModelRoutingEnabled')
                ? form.get('jevModelRoutingEnabled') === '1' : undefined,
        });
    } catch (error: any) {
        return new Response(error?.message ?? 'Invalid automation settings', { status: 400 });
    }
    return new Response(null, { status: 204 });
}
