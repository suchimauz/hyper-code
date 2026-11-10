/**
 * Check a private batch answer against its unchanged codec and return canonical values without persistence.
 *
 * Server-side atomic batch collection support; use through the dedicated owner-authorized batch routes.
 * @param opts.item Normalized stored batch item with codec fingerprint.
 * @param opts.values Private canonical values held only inside the operation.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Normalized stored batch item with codec fingerprint. */
        item: Record<string, any>;
        /** Private canonical values held only inside the operation. */
        values: types.input.FormValues;
    },
): Promise<types.input.BatchValidation & {ok:true}> {
    const stable=(v:any):any=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
    const item=opts.item;const kind=(ctx.state as any).input?.kinds?.[item.kind];const codec=kind?.batch;
    const fail=(code='codec_unavailable',message='The answer editor changed or is unavailable')=>{throw Object.assign(new Error(message),{batchError:{code,message}});};
    if(!codec||kind.completionAuthority||codec.version!==1)return fail();
    const fingerprint=new Bun.CryptoHasher('sha256').update(JSON.stringify(stable(item.spec))+[codec.version,codec.normalizeSpec,codec.validate,codec.projectSpec,codec.projectDraft,codec.history].map(String).join('|')).digest('hex');
    if(fingerprint!==item.fingerprint)return fail();
    if(item.expiresAt&&item.expiresAt<=Date.now())return fail();
    let value;try{value=codec.validate({spec:item.spec,values:opts.values});}catch{return fail();}
    if(value?.ok===false&&typeof value.error?.code==='string'&&typeof value.error?.message==='string')return fail(value.error.code.slice(0,100),value.error.message.slice(0,500));
    if(!value||value.then||value.ok!==true)return fail();
    return value;
}
