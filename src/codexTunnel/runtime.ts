type Descriptor={instance:string;provider:'codex';account:string};
type RecordState={version:1;mode:'socks'|'legacy'|'recovery';binding:string;owner:string;rotated?:boolean;tokens:{access:string;refresh:string;accountId:string;expires:number}};
/**
 * Construct account lifecycle operations sharing a reload-stable owner mutation domain and body leases.
 *
 * Construct account lifecycle operations sharing a reload-stable owner mutation domain and body leases.
Staged candidate; use only from cold-bootstrapped owner runtime, never direct hot activation.
 * @param opts.options Explicit options input for this account operation.
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Explicit options input for this account operation. */
        options: {state?:any;assertScope?:(d:Descriptor)=>void;protectedSlot:string;legacy:(opts:{ssh:Descriptor;url:string;init:any})=>Promise<Response>;transport?:((ctx:any,session:any,opts:any)=>Promise<Response>);open?:((ctx:any,instance:string,signal?:AbortSignal)=>Promise<{port:number;signal:AbortSignal;close:()=>Promise<void>}>);claim?:()=>Promise<()=>Promise<void>>};
    },
): { fetch: (opts: { ssh: Descriptor; url: string; init: { method?: string; body?: string; headers?: Record<string, string>; signal?: AbortSignal; }; }) => Promise<Response>; migrate: (d: Descriptor, tokens: RecordState["tokens"]) => Promise<any>; recover: (d: Descriptor) => Promise<any>; rollback: (d: Descriptor) => Promise<any>; mutate: (d: Descriptor, work?: () => Promise<any>) => Promise<any>; } {
    const options=opts.options;
    
     // Must be retained across reloads, not scoped to one call or a factory instance.
     const st=options.state??((ctx as any).state.codexSocksCandidate??={tails:new Map<string,Promise<void>>(),pending:new Map<string,any>(),cold:false});
     const gate=st.gate??=(ctx as any).fns.codexTunnel.mutation({io: {claim:options.claim??(async()=>{throw Error('Cold bootstrap mutation authority missing')})}});
     const slot=(d:Descriptor)=>{options.assertScope?.(d);if(d.provider!=='codex'||!d.instance||!d.account)throw Error('Invalid provider identity');return JSON.stringify([d.instance,d.account])};
     async function lock(key:string){const previous=st.tails.get(key)??Promise.resolve();let release!:()=>void;const held=new Promise<void>(r=>release=r);st.tails.set(key,held);await previous;return ()=>{if(st.tails.get(key)===held)st.tails.delete(key);release()}}
     async function binding(d:Descriptor){slot(d);const b=await (ctx as any).fns.codexAccount.binding({instance:d.instance,account:d.account});const owner=d.instance==='aeza-criminal-amarant'&&d.account==='test'?await ctx.fns.codexAccount.inferenceOwner({}):String(session?.user?.id??'');if(!b.owner||b.owner!==owner)throw Error('Owner required');return b}
     async function load(d:Descriptor){const b=await binding(d),store=(ctx as any).fns.codexTunnel.encryptedStore({name: b.name}),row=await store.read();if(row&&(row.value.version!==1||row.value.binding!==b.fingerprint||row.value.owner!==b.owner))throw Error('Account binding changed');return {b,store,row}}
     async function mutate(d:Descriptor,work:()=>Promise<any>=async()=>undefined){return gate.run(async()=>{const {row}=await load(d);if(row&&row.value.mode!=='legacy')throw Error('Local account active: registry/login/host mutation prohibited');return work()})}
     async function migrate(d:Descriptor,tokens:RecordState['tokens']){return gate.run(async()=>{const key=slot(d);if(key===options.protectedSlot||(!options.assertScope&&st.cold!==true))throw Error('Migration prohibited: parent or unproven pre-gate streams');const release=await lock(key);try{if([...(((ctx as any).state.sshAccount?.flows??new Map()).values())].some((f:any)=>f.status==='pending'&&(!options.assertScope||(f.instance===d.instance&&f.account===d.account))))throw Error('Pending login blocks migration');const {b,store,row}=await load(d);if(row&&row.value.mode!=='legacy')throw Error('Already migrated or recovery required');(ctx as any).fns.codexTunnel.identity({t: tokens});if(tokens.expires<=Date.now()||!tokens.refresh)throw Error('Invalid tokens');await store.save(row?.revision??null,{version:1,mode:'socks',binding:b.fingerprint,owner:b.owner,tokens:{...tokens}})}finally{release()}})}
     async function recover(d:Descriptor){return gate.run(async()=>{const key=slot(d),release=await lock(key);try{const {store,row}=await load(d),pending=st.pending.get(key);if(!row||row.value.mode!=='recovery'||!pending||row.revision!==pending.revision)throw Error('Reauthorization required; no recoverable rotated token');await store.save(row.revision,{...row.value,tokens:pending.tokens,mode:'socks',rotated:true});st.pending.delete(key)}finally{release()}})}
     async function rollback(d:Descriptor){return gate.run(async()=>{const release=await lock(slot(d));try{const {store,row}=await load(d);if(!row||row.value.mode==='recovery'||row.value.rotated)throw Error('Remote token reconciliation required; rollback prohibited');await store.save(row.revision,{...row.value,mode:'legacy'})}finally{release()}})}
     async function fetch(opts:{ssh:Descriptor;url:string;init:{method?:string;body?:string;headers?:Record<string,string>;signal?:AbortSignal}}){
     const d={...opts.ssh},url=opts.url,init={...opts.init,headers:{...opts.init.headers}},key=slot(d);const ownerRelease=await gate.acquire();const release=await lock(key);let close=async()=>{},finished=false,signal=init.signal,abort=()=>{};
     const done=async()=>{if(finished)return;finished=true;signal?.removeEventListener('abort',abort);try{await close()}catch(e){st.poisoned=true;throw e}finally{release();if(!st.poisoned)await ownerRelease()}};
     try{if(st.poisoned)throw Error('Unconfirmed tunnel termination; cold operator recovery required');init.signal?.throwIfAborted();const {store,row}=await load(d);let response:Response;
     if(!row||row.value.mode==='legacy')response=await gate.within(()=>options.legacy({ssh:d,url,init}));
     else{if(row.value.mode!=='socks')throw Error('Credential recovery required');(ctx as any).fns.codexTunnel.endpoint({raw: url,method: init.method??'GET'});const tunnel=await (options.open??((c:any,i:string,s?:AbortSignal)=>(ctx as any).fns.codexTunnel.openProduction({instance:i,signal:s})))(ctx,d.instance,init.signal);close=tunnel.close;signal=init.signal?AbortSignal.any([init.signal,tunnel.signal]):tunnel.signal;let tokens=row.value.tokens;(ctx as any).fns.codexTunnel.identity({t: tokens});const transport=options.transport??((c:any,s:any,o:any)=>(ctx as any).fns.codexSocksIsolated.request(o));
     if(tokens.expires<=Date.now()+60000)tokens=await (ctx as any).fns.codexTunnel.rotate({store: store,row: row,refresh: async()=>{const r=await transport(ctx,session,{url:'https://auth.openai.com/oauth/token',method:'POST',proxyPort:tunnel.port,signal,headers:{'content-type':'application/json'},body:new TextEncoder().encode(JSON.stringify({grant_type:'refresh_token',refresh_token:tokens.refresh,client_id:'app_EMoamEEZ73f0CkXaXp7hrann'}))});if(!r.ok){await r.body?.cancel();throw Error('Refresh rejected')}const v=await r.json() as any;if(typeof v.access_token!=='string'||!Number.isFinite(v.expires_in)||v.expires_in<=0)throw Error('Invalid refresh response');return {...tokens,access:v.access_token,refresh:v.refresh_token??tokens.refresh,expires:Date.now()+v.expires_in*1000}},pending: st.pending,slot: key});
     // Preserve compact/catalogue caller metadata; authorization is always overwritten locally.
     const headers={...init.headers,authorization:`Bearer ${tokens.access}`,'chatgpt-account-id':tokens.accountId};for(const k of Object.keys(headers))if(['authorization','chatgpt-account-id'].includes(k.toLowerCase())&&!['authorization','chatgpt-account-id'].includes(k))delete headers[k as keyof typeof headers];
     response=await transport(ctx,session,{url,method:(init.method??'GET') as 'GET'|'POST',headers,body:init.body===undefined?undefined:new TextEncoder().encode(init.body),proxyPort:tunnel.port,signal,timeoutMs:120000});
     }
     if(!response.body){await done();return response}const reader=response.body.getReader();let terminal=false;
     const body=new ReadableStream<Uint8Array>({start(controller){abort=()=>{if(terminal)return;terminal=true;controller.error(Error('Aborted'));void reader.cancel().catch(()=>undefined);void done().catch(()=>undefined)};signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort()},async pull(controller){try{const r=await reader.read();if(terminal)return;if(r.done){terminal=true;controller.close();await done()}else controller.enqueue(r.value)}catch(e){if(!terminal){terminal=true;controller.error(e)}await done()}},async cancel(){terminal=true;void reader.cancel().catch(()=>undefined);await done()}});return new Response(body,{status:response.status,headers:response.headers,statusText:response.statusText})
     }catch{await done();throw Error('Account request failed; no fallback')}
     }
     return {fetch,migrate,recover,rollback,mutate};
}
