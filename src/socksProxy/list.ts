/**
 * List saved SOCKS5 proxies without credentials or secret references
 *
 * Use for the owner settings registry. Returns stable UUIDs and revisions; never resolves secrets or contacts the network.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {},
): Promise<Array<{id:string;name:string|null;host:string;port:number;hasAuth:boolean;revision:number}>> {
    return await ctx.fns.procs.db.select({sql:'SELECT id,name,host,port,(credential_ref IS NOT NULL) AS "hasAuth",revision FROM socks_proxies ORDER BY created_at,id',params:[]});
}
