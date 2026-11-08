/** Durable observed run boundaries; historical events are deliberately not backfilled. */
export default { async up(ctx: Context) {
    await ctx.fns.procs.db.exec({ sql: `CREATE TABLE IF NOT EXISTS agent_runs (
        id text PRIMARY KEY, agent_id text NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        start_idx integer NOT NULL, end_idx integer, started_at bigint NOT NULL, ended_at bigint,
        status text NOT NULL CHECK (status IN ('open','completed','stopped','error')),
        answer_idx integer, has_interleaved_input boolean NOT NULL DEFAULT false
    ); CREATE INDEX IF NOT EXISTS agent_runs_agent_range ON agent_runs(agent_id,start_idx);` });
} };
