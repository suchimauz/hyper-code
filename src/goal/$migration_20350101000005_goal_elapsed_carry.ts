/** Definition only: goal-scoped fractional active root duration; deploy explicitly, never at agent edit time. */
export default { async up(ctx: Context) {
    await ctx.fns.procs.db.exec({sql:`
CREATE TABLE goal_elapsed_carry (
 agent_id text PRIMARY KEY REFERENCES agents(id) ON DELETE CASCADE,
 goal_id uuid NOT NULL,
 clock_epoch text NOT NULL,
 remainder_ms double precision NOT NULL CHECK(remainder_ms >= 0 AND remainder_ms < 1000)
);
`});
}};
