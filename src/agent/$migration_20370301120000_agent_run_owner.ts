/**
 * Record which server process instance owns an in-flight run, so a process that acquires the worker
 * lock can return runs of a dead previous holder to the queue at once instead of after the lease.
 * A trigger clears the owner whenever the run token is cleared, covering every release path.
 */
export default {
    async up(ctx: Context) {
        await ctx.fns.procs.db.exec({ sql: `
            ALTER TABLE agents ADD COLUMN IF NOT EXISTS run_owner TEXT;
            CREATE OR REPLACE FUNCTION mauzcode_clear_run_owner() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN
                IF NEW.run_token IS NULL THEN NEW.run_owner := NULL; END IF;
                RETURN NEW;
            END $$;
            DROP TRIGGER IF EXISTS agent_clear_run_owner ON agents;
            CREATE TRIGGER agent_clear_run_owner BEFORE UPDATE ON agents FOR EACH ROW EXECUTE FUNCTION mauzcode_clear_run_owner();
        ` });
    },
    async down(ctx: Context) {
        await ctx.fns.procs.db.exec({ sql: `
            DROP TRIGGER IF EXISTS agent_clear_run_owner ON agents;
            DROP FUNCTION IF EXISTS mauzcode_clear_run_owner();
            ALTER TABLE agents DROP COLUMN IF EXISTS run_owner;
        ` });
    },
};
