/** Durable advisory collaboration state, independent of executable task tracking. */
export default { async up(ctx: Context) {
    await ctx.fns.procs.db.exec({ sql: `CREATE TABLE IF NOT EXISTS agent_planning (
        agent_id text PRIMARY KEY REFERENCES agents(id) ON DELETE CASCADE,
        mode text NOT NULL DEFAULT 'execute' CHECK (mode IN ('plan','execute')),
        revision integer NOT NULL DEFAULT 0,
        proposal jsonb,
        updated_at bigint NOT NULL
    );
    CREATE TABLE IF NOT EXISTS agent_command_requests (
        agent_id text NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        request_id text NOT NULL,
        command_text text NOT NULL,
        result jsonb NOT NULL,
        PRIMARY KEY(agent_id,request_id)
    );` });
} };
