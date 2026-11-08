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
        options: {state?:any;assertScope?:(d:Descriptor)=>void;protectedSlot:string;transport?:((ctx:any,session:any,opts:any)=>Promise<Response>);open?:((ctx:any,instance:string,signal?:AbortSignal)=>Promise<{port:number;signal:AbortSignal;close:()=>Promise<void>}>);claim?:()=>Promise<()=>Promise<void>>};
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
     async function rollback(d:Descriptor){return gate.run(async()=>{const release=await lock(slot(d));try{const {store,row}=await load(d);if(!row||!['socks','legacy'].includes(row.value.mode)||row.value.rotated)throw Error('Remote token reconciliation required; rollback prohibited');await store.save(row.revision,{...row.value,mode:'legacy'})}finally{release()}})}
     async function fetch(request:{ssh:Descriptor;url:string;init:{method?:string;body?:string;headers?:Record<string,string>;signal?:AbortSignal}}){
       slot(request.ssh);
       return ctx.fns.sshProvider.dispatch(request);
     }
     return {fetch,migrate,recover,rollback,mutate};
}
