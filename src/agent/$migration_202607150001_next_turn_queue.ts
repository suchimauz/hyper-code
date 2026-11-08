/** Durable next-turn submissions, kept outside the active transcript until a worker boundary. */
export default { async up(ctx: Context) {
 await ctx.fns.procs.db.exec({sql:`CREATE TABLE IF NOT EXISTS agent_turn_queue (
 id text PRIMARY KEY, agent_id text NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
 sequence bigserial UNIQUE, request_id text NOT NULL, fingerprint text NOT NULL,
 text text NOT NULL, files jsonb NOT NULL DEFAULT '[]', version integer NOT NULL DEFAULT 1,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','promoted','removed')),
 created_at bigint NOT NULL, message_idx integer, UNIQUE(agent_id,request_id));
 CREATE INDEX IF NOT EXISTS agent_turn_queue_pending ON agent_turn_queue(agent_id,sequence) WHERE status='pending';`});
} };
