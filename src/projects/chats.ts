/**
 * List active or archived navigation chats for an exact project workspace.
 *
 * Uses persisted archive state, excludes team and hidden chats, and compares normalized tuples without prefix matching or result caps.
 * @param opts.projectId Visible project ID.
 * @param opts.archived Return archived chats rather than active chats. @default false
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Visible project ID. */
        projectId: string;
        /** Return archived chats rather than active chats. @default false */
        archived?: boolean;
    },
): Promise<types.projects.Chat[]> {
    const project=await ctx.fns.projects.get({projectId:opts.projectId});
    if(!project) throw new Error('Project not found');
    const viewer=await ctx.fns.auth.viewerId({});
    // Same watermark precedence as session.list, including legacy single-user instances.
    const legacyKv=(await ctx.fns.auth.listUsers({})).length<=1;
    const rows=await ctx.fns.procs.db.select({sql:`SELECT a.id,a.title,a.model,a.icon,a.run_state,a.workspace_dir,a.workspace_host,a.archived_at,
      (a.last_notifiable_at IS NOT NULL AND a.last_notifiable_at > COALESCE(s.seen_at,
        (SELECT CAST(k.value AS BIGINT) FROM kv k WHERE k.key='seen-at:' || a.id AND ?=1),
        (SELECT MAX(m.ts) FROM messages m WHERE m.agent_id=a.id AND m.idx <= COALESCE((SELECT CAST(k.value AS INTEGER) FROM kv k WHERE k.key='seen:' || a.id),-1)), -1)) AS has_unread
      FROM agents a LEFT JOIN user_agent_state s ON s.agent_id=a.id AND s.user_id=?
      WHERE a.visibility='nav' AND a.workspace_dir IS NOT NULL AND (a.archived_at IS NOT NULL)=? ORDER BY a.created_at,a.id`,params:[legacyKv?1:0,viewer??'',opts.archived??false]});
    const teamActivity=await ctx.fns.agent.teamActivity({});
    const result:types.projects.Chat[]=[];
    for(const row of rows){
     if(!row.workspace_dir.startsWith('/')) continue;
     const identity=await ctx.fns.projects.identity({dir:row.workspace_dir,host:row.workspace_host??''});
     if(identity.id===project.id) result.push({id:row.id,title:row.title||row.id,model:row.model,icon:row.icon??null,archived:row.archived_at!==null,runState:row.run_state,teamRunningCount:teamActivity[row.id]??0,hasUnread:row.has_unread===true||row.has_unread==='t'||row.has_unread===1,workspaceDir:identity.dir,workspaceHost:identity.host});
    }
    return result;
}
