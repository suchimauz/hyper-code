/** Reschedule pending next turns in the existing worker finalization transaction, including hot-loaded workers. */
export default { async up(ctx: Context) {
 await ctx.fns.procs.db.exec({sql:`CREATE OR REPLACE FUNCTION hyper_schedule_next_turn() RETURNS trigger LANGUAGE plpgsql AS $$
 BEGIN
 IF OLD.run_state='running' AND NEW.run_state='idle'
 AND OLD.run_token IS NOT NULL AND NEW.run_token IS NULL
 AND NEW.stopped_at IS NULL AND NEW.archived_at IS NULL
 AND NEW.parent_id IS NULL AND NEW.last_error IS NULL
 AND NEW.last_processed_msg_idx > OLD.last_processed_msg_idx
 AND NEW.next_run_at IS NULL
 AND EXISTS(SELECT 1 FROM agent_turn_queue WHERE agent_id=NEW.id AND status='pending')
 THEN NEW.next_run_at := (extract(epoch from clock_timestamp())*1000)::bigint + 100;
 END IF;
 RETURN NEW;
 END $$;
 DROP TRIGGER IF EXISTS agent_next_turn_schedule ON agents;
 CREATE TRIGGER agent_next_turn_schedule BEFORE UPDATE ON agents FOR EACH ROW EXECUTE FUNCTION hyper_schedule_next_turn();`});
} };
