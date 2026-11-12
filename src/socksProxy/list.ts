/**
 * List saved SOCKS5 proxies without credentials or secret references
 *
 * Use for the owner settings registry. Returns stable UUIDs and revisions; never resolves secrets or contacts the network.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {},
): Promise<Array<{id:string;name:string|null;host:string;port:number;hasAuth:boolean;revision:number;users:Array<{provider:string;account:string}>}>> {
    return await ctx.fns.procs.db.select({sql:`SELECT p.id,p.name,p.host,p.port,(p.credential_ref IS NOT NULL) AS "hasAuth",p.revision, COALESCE((SELECT jsonb_agg(jsonb_build_object('provider',b.provider,'account',b.account) ORDER BY b.provider,b.account) FROM llm_account_proxies b WHERE b.proxy_id=p.id),'[]'::jsonb) AS users FROM socks_proxies p ORDER BY p.created_at,p.id`,params:[]});
}
