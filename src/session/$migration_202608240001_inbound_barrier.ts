/** Durable inbound delivery receipts and pending compaction-barrier messages. */
export default {
    async up(ctx: Context) {
        await ctx.fns.procs.db.exec({ sql: `CREATE TABLE IF NOT EXISTS session_inbound_deliveries (
            seq BIGSERIAL PRIMARY KEY,
            agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
            delivery_key TEXT NOT NULL,
            payload TEXT NOT NULL,
            message_idx INTEGER,
            event_idx INTEGER,
            created_at BIGINT NOT NULL,
            delivered_at BIGINT,
            UNIQUE(agent_id, delivery_key)
        );
        CREATE INDEX IF NOT EXISTS session_inbound_pending ON session_inbound_deliveries(agent_id, seq) WHERE delivered_at IS NULL;` });
    },
};
