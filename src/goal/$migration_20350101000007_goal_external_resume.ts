/** Definition only: explicit idle resume receipts and origin-scoped admissions. Never apply without operator approval. */
export default { async up(ctx: Context) {
 await ctx.fns.procs.db.transaction({fn:async()=>{
 await ctx.fns.procs.db.exec({sql:`
CREATE TABLE goal_resume_requests (
 agent_id text NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
 resume_request_id uuid NOT NULL,
 request_payload jsonb NOT NULL,
 result jsonb NOT NULL,
 created_at bigint NOT NULL,
 PRIMARY KEY(agent_id,resume_request_id)
);
ALTER TABLE goal_continuation_admissions DROP CONSTRAINT goal_continuation_admissions_pkey;
ALTER TABLE goal_continuation_admissions ALTER COLUMN run_token DROP NOT NULL;
ALTER TABLE goal_continuation_admissions ADD COLUMN admission_id uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE goal_continuation_admissions ADD PRIMARY KEY(admission_id);
ALTER TABLE goal_continuation_admissions ADD COLUMN origin text NOT NULL DEFAULT 'worker_finalize';
ALTER TABLE goal_continuation_admissions ADD COLUMN resume_request_id uuid;
ALTER TABLE goal_continuation_admissions ADD COLUMN capability_fingerprint text;
ALTER TABLE goal_continuation_admissions ADD CONSTRAINT goal_admission_origin CHECK (
 (origin='worker_finalize' AND run_token IS NOT NULL AND resume_request_id IS NULL) OR
 (origin='external_resume' AND run_token IS NULL AND resume_request_id IS NOT NULL)
);
CREATE UNIQUE INDEX goal_admission_worker_identity ON goal_continuation_admissions(agent_id,goal_id,run_token) WHERE origin='worker_finalize';
CREATE UNIQUE INDEX goal_admission_resume_identity ON goal_continuation_admissions(agent_id,resume_request_id) WHERE origin='external_resume';
ALTER TABLE goal_continuation_admissions ADD CONSTRAINT goal_admission_resume_receipt FOREIGN KEY(agent_id,resume_request_id) REFERENCES goal_resume_requests(agent_id,resume_request_id) DEFERRABLE INITIALLY DEFERRED;
`});
 }});
}};
