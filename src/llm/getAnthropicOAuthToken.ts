/**
 * Return a valid Claude OAuth token without replaying an ambiguous refresh.
 * Serializes same-slot refreshes in process and durably marks rotation before sending.
 * A pre-send proxy failure clears the marker; an uncertain outcome requires reconnect.
 * @param opts.account Local managed OAuth credential slot.
 */
export default async function (ctx: Context, _session: Session | null, opts?: {
    /** Local credential slot. @default "default" */ account?: string;
}): Promise<string> {
    const provider='anthropic-oauth', account=String(opts?.account??'').trim()||'default';
    const root=ctx.state as typeof ctx.state & {claudeRefreshes?:Map<string,Promise<string>>};
    const flights=root.claudeRefreshes??=new Map<string,Promise<string>>();
    const active=flights.get(account);if(active)return active;
    const flight=(async()=>{
        const row=await ctx.fns.procs.db.transaction({fn:async()=>{
            const value=(await ctx.fns.procs.db.select({sql:'SELECT access_enc,refresh_enc,expires_at,version,refresh_uncertain FROM oauth_credentials WHERE provider=? AND account=? FOR UPDATE',params:[provider,account]}))[0];
            if(!value)throw new Error(`Anthropic OAuth is not connected for account "${account}"`);
            if(value.refresh_uncertain)throw Object.assign(new Error('OAUTH_OUTCOME_UNKNOWN: previous refresh outcome is unknown; reconnect the account'),{code:'OAUTH_OUTCOME_UNKNOWN',retryable:false,noFallback:true});
            value.needsRefresh=Number(value.expires_at)<=Date.now();
            if(value.needsRefresh)await ctx.fns.procs.db.run({sql:'UPDATE oauth_credentials SET refresh_uncertain=TRUE WHERE provider=? AND account=?',params:[provider,account]});
            return value;
        }}) as {access_enc:string;refresh_enc:string;expires_at:number;version:number;needsRefresh:boolean};
        if(!row.needsRefresh)return ctx.fns.llm.decryptOAuthSecret({provider,field:'access',envelope:row.access_enc});
        let sent=false;
        try {
            const refresh=await ctx.fns.llm.decryptOAuthSecret({provider,field:'refresh',envelope:row.refresh_enc});
            sent=true;
            const token=await ctx.fns.llm.exchangeAnthropicOAuth({grant:'refresh_token',refreshToken:refresh,account});
            const [accessEnc,refreshEnc]=await Promise.all([ctx.fns.llm.encryptOAuthSecret({provider,field:'access',value:token.access}),ctx.fns.llm.encryptOAuthSecret({provider,field:'refresh',value:token.refresh??refresh})]);
            const saved=await ctx.fns.procs.db.run({sql:'UPDATE oauth_credentials SET access_enc=?,refresh_enc=?,expires_at=?,scopes=COALESCE(?,scopes),version=version+1,updated_at=?,refresh_uncertain=FALSE WHERE provider=? AND account=? AND version=? AND refresh_uncertain=TRUE',params:[accessEnc,refreshEnc,token.expiresAt,token.scopes,Date.now(),provider,account,row.version]}) as {changes:number};
            if(!saved.changes)throw new Error('OAuth account changed during refresh');
            return token.access;
        } catch(error) {
            const e=error as Error & {requestSent?:boolean};
            if(!sent||e.requestSent===false){
                await ctx.fns.procs.db.run({sql:'UPDATE oauth_credentials SET refresh_uncertain=FALSE WHERE provider=? AND account=? AND version=?',params:[provider,account,row.version]});
                throw error;
            }
            throw Object.assign(new Error('OAUTH_OUTCOME_UNKNOWN: token rotation could not be completed safely; reconnect the account'+(/^(PROXY_|OAUTH_|Anthropic OAuth )/.test(e.message)?' ('+e.message.slice(0,300)+')':'')),{code:'OAUTH_OUTCOME_UNKNOWN',retryable:false,noFallback:true});
        }
    })();
    flights.set(account,flight);
    try{return await flight;}finally{if(flights.get(account)===flight)flights.delete(account);}
}
