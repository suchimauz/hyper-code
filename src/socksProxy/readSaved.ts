/**
 * Read a saved SOCKS5 endpoint and decrypt its credentials for backend checks
 *
 * Internal backend-only capability, never expose directly over HTTP. Locks a consistent record snapshot while reading the uncached encrypted secret; returns no secret reference.
 * @param opts.id Stable server-generated proxy UUID.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Stable server-generated proxy UUID. */
        id: string;
    },
): Promise<{id:string;host:string;port:number;revision:number;username?:string;password?:string}> {
    await ctx.fns.socksProxy.validateIdentity(opts);return await ctx.fns.procs.db.transaction({fn:async()=>{const rows=await ctx.fns.procs.db.select({sql:'SELECT id,host,port,revision,credential_ref FROM socks_proxies WHERE id=? FOR SHARE',params:[opts.id]});const row=rows[0];if(!row)throw Object.assign(new Error('Proxy not found'),{status:404});let credentials:{username?:string;password?:string}={};if(row.credential_ref){if(row.credential_ref!=='secret://socksProxy/'+row.id)throw new Error('Invalid credential ownership');const raw=await ctx.fns.secrets.getLocal({namespace:'socksProxy',name:row.id});if(raw===null)throw new Error('Proxy credentials unavailable');const pair=JSON.parse(raw);if(typeof pair.username!=='string'||typeof pair.password!=='string')throw new Error('Proxy credentials unavailable');credentials={username:pair.username,password:pair.password};}return {id:row.id,host:row.host,port:row.port,revision:row.revision,...credentials};}}) as {id:string;host:string;port:number;revision:number;username?:string;password?:string};
}
