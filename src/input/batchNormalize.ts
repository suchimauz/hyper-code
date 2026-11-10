/**
 * Validate ordered batch members and bind their pure codec contracts before creating a parent input.
 *
 * Server-side atomic batch collection support; use through the dedicated owner-authorized batch routes.
 * @param opts.spec Untrusted batch definition containing an ordered items array.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Untrusted batch definition containing an ordered items array. */
        spec: Record<string, unknown>;
    },
): Promise<Record<string, unknown>> {
    const stable=(v:any):any=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
    const fail=()=>{throw new Error('Invalid batch definition');};
    const plain=(v:unknown,seen=new Set<object>()):boolean=>{if(v===null||typeof v==='string'||typeof v==='boolean')return true;if(typeof v==='number')return Number.isFinite(v);if(typeof v!=='object'||seen.has(v))return false;seen.add(v);if(!Array.isArray(v)&&Object.getPrototypeOf(v)!==Object.prototype&&Object.getPrototypeOf(v)!==null)return false;const ok=Object.entries(v).every(([k,x])=>!['__proto__','constructor','prototype'].includes(k)&&plain(x,seen));seen.delete(v);return ok;};
    const spec=opts.spec;
    if(!plain(spec))return fail();
    if (!spec || Object.keys(spec).some(k=>k!=='items') || !Array.isArray(spec.items) || spec.items.length<1 || spec.items.length>30 || new TextEncoder().encode(JSON.stringify(spec)).byteLength>1_000_000) return fail();
    const keys=new Set<string>(); const destinations=new Set<string>(); const items=[];
    for(const raw of spec.items){
     if(!raw || typeof raw!=='object' || Array.isArray(raw) || Object.keys(raw).some(k=>!['key','kind','title','message','spec','expiresAt'].includes(k))) return fail();
     const item=raw as Record<string,unknown>;
     if(typeof item.key!=='string'||!/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(item.key)||keys.has(item.key)||typeof item.kind!=='string'||typeof item.title!=='string'||!item.title.trim()||(item.message!==undefined&&typeof item.message!=='string')) return fail();
     keys.add(item.key);
     const kind=(ctx.state as any).input?.kinds?.[item.kind];const codec=kind?.batch;
     if(['batch','planning-review'].includes(item.kind)||kind?.completionAuthority||!codec||codec.version!==1) return fail();
     if(item.expiresAt!==undefined&&(!Number.isSafeInteger(item.expiresAt)||Number(item.expiresAt)<=Date.now()))return fail();
     const supplied=item.spec??{};if(typeof supplied!=='object'||Array.isArray(supplied)||Object.keys(supplied).some(k=>k.startsWith('_')||['__proto__','constructor','prototype'].includes(k)))return fail();
     let normalized;try{normalized=codec.normalizeSpec({spec:supplied});}catch{return fail();}
     if(!plain(normalized)||!normalized || typeof normalized!=='object'||Array.isArray(normalized)||normalized?.then||Object.keys(normalized).some(k=>k.startsWith('_')))return fail();
     if(item.kind==='secret'){const ref=String(normalized.saveAs);if(destinations.has(ref))throw new Error('Duplicate secret destination');destinations.add(ref);}
     const fingerprint=new Bun.CryptoHasher('sha256').update(JSON.stringify(stable(normalized))+[codec.version,codec.normalizeSpec,codec.validate,codec.projectSpec,codec.projectDraft,codec.history].map(String).join('|')).digest('hex');
     items.push({key:item.key,kind:item.kind,title:item.title,message:item.message??'',spec:normalized,contractVersion:1,fingerprint,...(item.expiresAt?{expiresAt:item.expiresAt}:{})});
    }
    if(new TextEncoder().encode(JSON.stringify(items)).byteLength>1_000_000)throw new Error('Batch definition exceeds one megabyte');
    return {items};
}
