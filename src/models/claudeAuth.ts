/**
 * Manage encrypted Claude subscription tokens with non-replayable rotating refresh.
 *
 * Use status for safe metadata, token internally, store after login, markLogin after rejection, clear for logout. Refresh uses the connection transport and durably marks uncertain outcomes before sending; never expose token results.
 * @param opts.conn Resolved connection supplying the network transport.
 * @param opts.op Credential operation.
 * @param opts.tokens OAuth response required for store, with refresh token and positive expiry.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Resolved connection supplying the network transport. */
        conn: types.models.ResolvedConnection;
        /** Credential operation. */
        op: "status" | "token" | "store" | "markLogin" | "clear";
        /** OAuth response required for store, with refresh token and positive expiry. */
        tokens?: {access_token:string;refresh_token?:string;expires_in?:number};
        /** Pending login abort signal; cancellation rolls back a serialized store before it completes. */
        signal?: AbortSignal;
    },
): Promise<{loggedIn:boolean;needsLogin:boolean;expiresAt:number|null;accessToken?:string}> {
    const { conn, op } = opts;
    const namespace = 'models', name = conn.id + '.claude-auth';
    type RecordValue = {accessToken:string;refreshToken:string;expiresAt:number;needsLogin:boolean;refreshUncertain:boolean};
    const fail = (code = 'LOGIN_REQUIRED') => Object.assign(new Error(code === 'OAUTH_OUTCOME_UNKNOWN' ? 'Claude refresh outcome unknown; login required' : 'Claude login required'), {code,status:409,retryable:false});
    const read = async () => {
     const rows = await ctx.fns.procs.db.select({sql:'SELECT value_enc, version FROM local_secrets WHERE namespace=? AND name=?',params:[namespace,name]}) as {value_enc:string;version:number}[];
     if (!rows[0]) return null;
     return {version:Number(rows[0].version),value:JSON.parse(await ctx.fns.secrets.decryptLocal({namespace,name,envelope:rows[0].value_enc})) as RecordValue};
    };
    const cas = async (version:number,value:RecordValue) => {
     const envelope = await ctx.fns.secrets.encryptLocal({namespace,name,value:JSON.stringify(value)});
     return (await ctx.fns.procs.db.select({sql:"UPDATE local_secrets SET value_enc=?, version=version+1, source='claude-refresh', updated_at=? WHERE namespace=? AND name=? AND version=? RETURNING version",params:[envelope,Date.now(),namespace,name,version]})).length > 0;
    };
    const summary = (r?:RecordValue|null) => ({loggedIn:!!r&&!r.needsLogin&&!r.refreshUncertain,needsLogin:!r||r.needsLogin||r.refreshUncertain,expiresAt:r?.expiresAt??null});
    const record = (t:{access_token?:unknown;refresh_token?:unknown;expires_in?:unknown}):RecordValue => {
     if(typeof t.access_token!=='string'||!t.access_token||typeof t.refresh_token!=='string'||!t.refresh_token||typeof t.expires_in!=='number'||!Number.isFinite(t.expires_in)||t.expires_in<=0) throw new Error('Incomplete Claude token response');
     return {accessToken:t.access_token,refreshToken:t.refresh_token,expiresAt:Date.now()+(t.expires_in-300)*1000,needsLogin:false,refreshUncertain:false};
    };
    const touch = async () => {
     await ctx.fns.procs.db.run({sql:'UPDATE llm_connections SET updated_at = GREATEST(updated_at + 1, ?) WHERE id=?',params:[Date.now(),conn.id]});
     try { await ctx.fns.procs.events.refresh({topic:'llm-models',reason:'models-claude-auth'}); } catch { /* Notification failure cannot invalidate saved credentials. */ }
    };
    if(op==='status') return summary((await read())?.value);
    if(op==='clear'||op==='store'){
     ctx.state.models ??= {};
     const mutations=(ctx.state.models as typeof ctx.state.models & {claudeMutations?:Record<string,Promise<void>>}).claudeMutations ??= {};
     const previous=mutations[conn.id] ?? Promise.resolve();
     let unlock!:()=>void;
     const lock=new Promise<void>(resolve=>{unlock=resolve;});
     mutations[conn.id]=previous.then(()=>lock);
     await previous;
     try {
      if(op==='clear'){await ctx.fns.secrets.deleteLocal({namespace,name});await touch();return summary();}
      if(opts.signal?.aborted)throw fail();
      if(!opts.tokens)throw new Error('Tokens required');
      const value=record(opts.tokens);
      await ctx.fns.secrets.putLocal({namespace,name,value:JSON.stringify(value),source:'claude-login'});
      if(opts.signal?.aborted){await ctx.fns.secrets.deleteLocal({namespace,name});await touch();throw fail();}
      await touch();
      if(opts.signal?.aborted){await ctx.fns.secrets.deleteLocal({namespace,name});await touch();throw fail();}
      return summary(value);
     }finally{unlock();}
    }
    if(op==='markLogin'){
     for(let i=0;i<3;i++){const cur=await read();if(!cur||cur.value.needsLogin)break;if(await cas(cur.version,{...cur.value,needsLogin:true})){await touch();break;}}
     return summary((await read())?.value);
    }
    ctx.state.models ??= {};
    const state = ctx.state.models as typeof ctx.state.models & {claudeRefresh?:Record<string,Promise<string>>};
    const flights = state.claudeRefresh ??= {};
    // Join before reading the uncertain marker written by this process's active refresh.
    flights[conn.id] ??= (async () => {
     const cur=await read();if(!cur||cur.value.needsLogin)throw fail();
     if(cur.value.refreshUncertain)throw fail('OAUTH_OUTCOME_UNKNOWN');
     if(cur.value.expiresAt>Date.now())return cur.value.accessToken;
     if(!cur.value.refreshToken)throw fail();
     if(!await cas(cur.version,{...cur.value,refreshUncertain:true}))throw fail();
     const constants=ctx.fns.llm.anthropicOAuthConstants({});
     try {
     const response=await ctx.fns.models.claudeRequest({conn,url:constants.tokenUrl,init:{method:'POST',headers:{'content-type':'application/json',accept:'application/json'},body:JSON.stringify({grant_type:'refresh_token',refresh_token:cur.value.refreshToken,client_id:constants.clientId})}});
     if(!response.ok){await response.body?.cancel();if(response.status===400||response.status===401||response.status===403){await cas(cur.version+1,{...cur.value,refreshUncertain:false,needsLogin:true});await touch();throw fail();}throw fail('OAUTH_OUTCOME_UNKNOWN');}
     const next=record(await response.json() as {access_token?:unknown;refresh_token?:unknown;expires_in?:unknown});
     if(!await cas(cur.version+1,next))throw fail('OAUTH_OUTCOME_UNKNOWN');
     await touch();return next.accessToken;
     }catch(error){if(error instanceof Error && 'code' in error && error.code==='LOGIN_REQUIRED')throw fail();throw fail('OAUTH_OUTCOME_UNKNOWN');}
    })().finally(()=>{delete flights[conn.id];});
    const accessToken=await flights[conn.id];return {...summary((await read())?.value),accessToken};
}
