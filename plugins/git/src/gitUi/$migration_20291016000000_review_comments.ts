/** Store agent-owned Git review comments; deleting an agent cascades to its comments. */
export default {
  up: async (ctx: Context): Promise<void> => {
    await ctx.fns.procs.db.exec({ sql: `
      CREATE TABLE git_review_comments (
        id uuid PRIMARY KEY,
        agent_id text NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        host text NOT NULL,
        dir text NOT NULL,
        scope text NOT NULL CHECK (scope IN ('commit', 'worktree')),
        commit_hash text,
        worktree_group text CHECK (worktree_group IN ('staged', 'unstaged', 'untracked')),
        path text NOT NULL,
        old_path text,
        side text NOT NULL CHECK (side IN ('old', 'new')),
        line_start integer NOT NULL CHECK (line_start >= 1),
        line_end integer NOT NULL CHECK (line_end >= line_start),
        line_text text NOT NULL CHECK (octet_length(line_text) <= 2048),
        body text NOT NULL CHECK (octet_length(body) BETWEEN 1 AND 8192),
        status text NOT NULL CHECK (status IN ('open', 'resolved')),
        resolution_note text CHECK (octet_length(resolution_note) <= 2048),
        resolved_by text CHECK (resolved_by IN ('user', 'agent')),
        sent_at bigint,
        resolved_at bigint,
        created_at bigint NOT NULL,
        updated_at bigint NOT NULL,
        CONSTRAINT git_review_comments_anchor_check CHECK (
          (scope = 'commit' AND commit_hash IS NOT NULL
            AND commit_hash ~ '^([0-9a-fA-F]{40}|[0-9a-fA-F]{64})$'
            AND worktree_group IS NULL)
          OR (scope = 'worktree' AND commit_hash IS NULL AND worktree_group IS NOT NULL)
        )
      );
      CREATE INDEX git_review_comments_agent_repository_status_idx
        ON git_review_comments (agent_id, host, dir, status);
    ` });
  },
  down: async (ctx: Context): Promise<void> => {
    await ctx.fns.procs.db.exec({ sql: 'DROP TABLE IF EXISTS git_review_comments' });
  },
};
