/**
 * Atomically create a saved SOCKS5 proxy and encrypted credentials
 *
 * Use for owner registry additions. Generates an independent UUID; validates locally and rolls back both secret and record on failure.
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
    const v=await ctx.fns.socksProxy.validate(opts);
    if(v.auth&&v.username===undefined)throw Object.assign(new Error('Credentials required'),{status:400});
    const id=crypto.randomUUID();const ref=v.auth?'secret://socksProxy/'+id:null;const now=Date.now();
    return await ctx.fns.procs.db.transaction({fn:async()=>{
    if(v.auth)await ctx.fns.secrets.putLocal({namespace:'socksProxy',name:id,value:JSON.stringify({username:v.username,password:v.password}),source:'socksProxy'});
    await ctx.fns.procs.db.run({sql:'INSERT INTO socks_proxies(id,name,host,port,credential_ref,revision,created_at,updated_at) VALUES (?,?,?,?,?,1,?,?)',params:[id,v.name,v.host,v.port,ref,now,now]});
    return {id,name:v.name,host:v.host,port:v.port,hasAuth:v.auth,revision:1};}}) as {id:string;name:string|null;host:string;port:number;hasAuth:boolean;revision:number};
}
