/** Persist independent retrieval, pre-retrieval gate, rerank and opt-in context toggles without changing omitted settings. */
export default async function (ctx: Context, _session: Session | null, opts: {
    /** Identifier of the non-archived agent to update. */
    id: string;
    /** Master switch for the entire function retrieval pipeline. */
    functionRagEnabled?: boolean;
    /** Enable the heuristic pre-retrieval gate independently of reranking. */
    functionRagGateEnabled?: boolean;
    /** Enable candidate reranking independently of the gate. */
    jevRerankEnabled?: boolean;
    /** Opt in to sending the latest request and old tool-result excerpts to the configured Jev provider, independently of Function RAG. @default false */
    jevContextEnabled?: boolean;
    /** Allow advisory executor recommendations to send task text and selected child titles to Jev. @default false */
    jevAgentRoutingEnabled?: boolean;
    /** Send explicit task text and account-free model labels to configured Jev for advisory selection. @default false */
    jevModelRoutingEnabled?: boolean;
    /** Allow explicit advisory calls to share task text and supplied evidence with the external configured Jev provider; no automatic actions. @default false */
    jevEvidenceEnabled?: boolean;
    /** Allow explicit advisory calls to share task text and file candidate metadata with the external configured Jev provider; no automatic actions. @default false */
    jevFileRankingEnabled?: boolean;
    /** Allow explicit advisory calls to share task text, proposed result and supplied evidence with the external configured Jev provider; no automatic actions. @default false */
    jevResultReviewEnabled?: boolean;
    /** Allow explicit advisory calls to share task text, proposed action and supplied metadata with the external configured Jev provider; no automatic actions. @default false */
    jevRiskReviewEnabled?: boolean;
    /** Opt in to automatic bounded summary-preservation checks during compaction, sending source excerpts and the summary to the external configured Jev provider. Independent advisory check, not a security guarantee. @default false */
    jevCompactionEnabled?: boolean;
}): Promise<{ functionRagEnabled: boolean; functionRagGateEnabled: boolean; jevRerankEnabled: boolean; jevContextEnabled: boolean; jevAgentRoutingEnabled: boolean; jevModelRoutingEnabled: boolean; jevEvidenceEnabled: boolean; jevFileRankingEnabled: boolean; jevResultReviewEnabled: boolean; jevRiskReviewEnabled: boolean; jevCompactionEnabled: boolean }> {
    const row = (await ctx.fns.procs.db.select({ sql: 'SELECT function_rag_enabled, function_rag_gate_enabled, jev_rerank_enabled, jev_context_enabled, jev_agent_routing_enabled, jev_model_routing_enabled, jev_evidence_enabled, jev_file_ranking_enabled, jev_result_review_enabled, jev_risk_review_enabled, jev_compaction_enabled FROM agents WHERE id = ? AND archived_at IS NULL', params: [opts.id] }))[0];
    if (!row) throw new Error(`agent not found: ${opts.id}`);
    const enabled = (value: unknown) => value === true || value === 1 || value === 't';
    const flags = {
        functionRagEnabled: opts.functionRagEnabled ?? enabled(row.function_rag_enabled),
        functionRagGateEnabled: opts.functionRagGateEnabled ?? enabled(row.function_rag_gate_enabled),
        jevRerankEnabled: opts.jevRerankEnabled ?? enabled(row.jev_rerank_enabled),
        jevContextEnabled: opts.jevContextEnabled ?? enabled(row.jev_context_enabled),
        jevAgentRoutingEnabled: opts.jevAgentRoutingEnabled ?? enabled(row.jev_agent_routing_enabled),
        jevModelRoutingEnabled: opts.jevModelRoutingEnabled ?? enabled(row.jev_model_routing_enabled),
        jevEvidenceEnabled: opts.jevEvidenceEnabled ?? enabled(row.jev_evidence_enabled),
        jevFileRankingEnabled: opts.jevFileRankingEnabled ?? enabled(row.jev_file_ranking_enabled),
        jevResultReviewEnabled: opts.jevResultReviewEnabled ?? enabled(row.jev_result_review_enabled),
        jevRiskReviewEnabled: opts.jevRiskReviewEnabled ?? enabled(row.jev_risk_review_enabled),
        jevCompactionEnabled: opts.jevCompactionEnabled ?? enabled(row.jev_compaction_enabled),
    };
    await ctx.fns.procs.db.run({ sql: 'UPDATE agents SET function_rag_enabled = ?, function_rag_gate_enabled = ?, jev_rerank_enabled = ?, jev_context_enabled = ?, jev_agent_routing_enabled = ?, jev_model_routing_enabled = ?, jev_evidence_enabled = ?, jev_file_ranking_enabled = ?, jev_result_review_enabled = ?, jev_risk_review_enabled = ?, jev_compaction_enabled = ?, updated_at = ? WHERE id = ?', params: [flags.functionRagEnabled, flags.functionRagGateEnabled, flags.jevRerankEnabled, flags.jevContextEnabled, flags.jevAgentRoutingEnabled, flags.jevModelRoutingEnabled, flags.jevEvidenceEnabled, flags.jevFileRankingEnabled, flags.jevResultReviewEnabled, flags.jevRiskReviewEnabled, flags.jevCompactionEnabled, Date.now(), opts.id] });
    const live = ctx.state.agent?.[opts.id];
    if (live) Object.assign(live, flags);
    ctx.fns.events.refreshAgentMeta({ agentId: opts.id, section: 'automation', reason: 'automation' });
    return flags;
}
