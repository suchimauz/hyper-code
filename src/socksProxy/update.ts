/**
 * Atomically update proxy settings and preserve, replace or remove credentials
 *
 * Use for owner edits with an observed revision. Locks the record and rejects stale writes; auth enabled with both credentials omitted preserves the saved pair.
 * @param opts.id Stable server-generated proxy UUID.
 * @param opts.revision Last observed positive integer revision for optimistic concurrency. @minimum 1
 * @param opts.name Optional display name, at most 100 characters.
 * @param opts.host DNS hostname or IP literal without URL components.
 * @param opts.port Integer SOCKS5 port. @minimum 1 @maximum 65535
 * @param opts.auth Enable username/password authentication.
 * @param opts.username Replacement username, requires password, at most 255 UTF-8 bytes.
 * @param opts.password Replacement password preserved verbatim, requires username, at most 255 UTF-8 bytes.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Stable server-generated proxy UUID. */
        id: string;
        /** Last observed positive integer revision for optimistic concurrency. @minimum 1 */
        revision: number;
        /** Optional display name, at most 100 characters. */
        name?: string | null;
        /** DNS hostname or IP literal without URL components. */
        host: string;
        /** Integer SOCKS5 port. @minimum 1 @maximum 65535 */
        port: number;
        /** Enable username/password authentication. */
        auth: boolean;
        /** Replacement username, requires password, at most 255 UTF-8 bytes. */
        username?: string;
        /** Replacement password preserved verbatim, requires username, at most 255 UTF-8 bytes. */
        password?: string;
    },
): Promise<{id:string;name:string|null;host:string;port:number;hasAuth:boolean;revision:number}> {
    await ctx.fns.socksProxy.validateIdentity({id:opts.id,revision:opts.revision});if(opts.revision===undefined)throw Object.assign(new Error('Revision required'),{status:400});const v=await ctx.fns.socksProxy.validate({name:opts.name,host:opts.host,port:opts.port,auth:opts.auth,username:opts.username,password:opts.password});
    return await ctx.fns.procs.db.transaction({fn:async()=>{
    const rows=await ctx.fns.procs.db.select({sql:'SELECT * FROM socks_proxies WHERE id=? FOR UPDATE',params:[opts.id]});const row=rows[0];if(!row)throw Object.assign(new Error('Proxy not found'),{status:404});if(row.revision!==opts.revision)throw Object.assign(new Error('Proxy changed'),{status:409});
    const expected='secret://socksProxy/'+row.id;if(row.credential_ref&&row.credential_ref!==expected)throw new Error('Invalid credential ownership');
    if(v.auth&&v.username===undefined&&!row.credential_ref)throw Object.assign(new Error('Credentials required'),{status:400});
    if(v.auth&&v.username!==undefined)await ctx.fns.secrets.putLocal({namespace:'socksProxy',name:row.id,value:JSON.stringify({username:v.username,password:v.password}),source:'socksProxy'});
    if(!v.auth&&row.credential_ref)await ctx.fns.secrets.deleteLocal({namespace:'socksProxy',name:row.id});
    await ctx.fns.procs.db.run({sql:'UPDATE socks_proxies SET name=?,host=?,port=?,credential_ref=?,revision=revision+1,updated_at=? WHERE id=?',params:[v.name,v.host,v.port,v.auth?expected:null,Date.now(),row.id]});return {id:row.id,name:v.name,host:v.host,port:v.port,hasAuth:v.auth,revision:row.revision+1};}}) as {id:string;name:string|null;host:string;port:number;hasAuth:boolean;revision:number};
}
