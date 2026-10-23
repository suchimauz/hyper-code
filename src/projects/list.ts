/**
 * List persistent and discovered exact workspace projects without writes.
 *
 * Reads all navigation workspaces without a discovery cap. Null and relative workspaces remain unassigned. Includes personal archive state, active-chat running and viewer-specific native unread counts. A new navigation agent created after archival reactivates the project. Does not mutate agents or filesystem.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {},
): Promise<types.projects.Project[]> {
    const principal = await ctx.fns.projects.principal({});
    const stored = await ctx.fns.procs.db.select({sql:'SELECT p.id,m.title,p.dir,p.host,m.archived_at FROM projects p JOIN project_members m ON m.project_id=p.id WHERE m.principal=?',params:[principal]});
    const result = new Map<string,types.projects.Project>();
    const archiveTimes = new Map<string,number>();
    for (const p of stored) {
     if (p.archived_at != null) archiveTimes.set(p.id,Number(p.archived_at));
     result.set(p.id,{id:p.id,title:p.title,dir:p.dir,host:p.host,archived:p.archived_at != null,virtual:false,runningCount:0,unreadCount:0});
    }
    const viewer = await ctx.fns.auth.viewerId({});
    // Match session.list: single-user instances retain the native legacy read watermarks.
    const legacyKv = (await ctx.fns.auth.listUsers({})).length <= 1;
    const teamActivity = await ctx.fns.agent.teamActivity({});
    const rows = await ctx.fns.procs.db.select({sql:`SELECT a.workspace_dir AS dir, COALESCE(a.workspace_host,'') AS host,
      MAX(a.created_at) AS latest_created_at,
      SUM(CASE WHEN a.archived_at IS NULL AND a.run_state <> '' AND a.run_state <> 'idle' THEN 1 ELSE 0 END) AS running_count,
      SUM(CASE WHEN a.archived_at IS NULL AND a.last_notifiable_at IS NOT NULL AND a.last_notifiable_at > COALESCE(s.seen_at,
        (SELECT CAST(k.value AS BIGINT) FROM kv k WHERE k.key='seen-at:' || a.id AND ?=1),
        (SELECT MAX(m.ts) FROM messages m WHERE m.agent_id=a.id AND m.idx <= COALESCE((SELECT CAST(k.value AS INTEGER) FROM kv k WHERE k.key='seen:' || a.id),-1)), -1) THEN 1 ELSE 0 END) AS unread_count
      FROM agents a LEFT JOIN user_agent_state s ON s.agent_id=a.id AND s.user_id=?
      WHERE a.visibility='nav' AND a.workspace_dir IS NOT NULL
      GROUP BY a.workspace_dir,COALESCE(a.workspace_host,'')`,params:[legacyKv?1:0,viewer??'']});
    for (const row of rows) {
     if (!row.dir.startsWith('/')) continue;
     const identity = await ctx.fns.projects.identity({dir:row.dir,host:row.host});
     if (!result.has(identity.id)) result.set(identity.id,{...identity,title:identity.dir.split('/').filter(Boolean).pop() || '/',virtual:true,runningCount:0,unreadCount:0});
     const project=result.get(identity.id)!;
     // A newly created navigation agent reactivates its project for every viewer
     // who archived it before that creation. Team/hidden agents never reactivate.
     const archivedAt=archiveTimes.get(identity.id);
     if (archivedAt !== undefined && Number(row.latest_created_at) > archivedAt) project.archived=false;
     project.runningCount=(project.runningCount??0)+Number(row.running_count);
     project.unreadCount=(project.unreadCount??0)+Number(row.unread_count);
    }
    // Add idle roots with working descendants exactly once; own-running roots are already counted above.
    const activeTeamIds=Object.keys(teamActivity).filter(id=>(teamActivity[id]??0)>0);
    if(activeTeamIds.length){
     const teamRoots=await ctx.fns.procs.db.select({sql:`SELECT id,workspace_dir AS dir,COALESCE(workspace_host,'') AS host FROM agents WHERE id IN (${activeTeamIds.map(()=>'?').join(',')}) AND visibility='nav' AND archived_at IS NULL AND (run_state IS NULL OR run_state IN ('','idle')) AND workspace_dir IS NOT NULL`,params:activeTeamIds});
     for(const row of teamRoots){
      if(!row.dir.startsWith('/')) continue;
      const identity=await ctx.fns.projects.identity({dir:row.dir,host:row.host});
      const project=result.get(identity.id);
      if(project) project.runningCount=(project.runningCount??0)+1;
     }
    }
    return [...result.values()].sort((a,b)=>a.title.localeCompare(b.title)||a.id.localeCompare(b.id));
}
