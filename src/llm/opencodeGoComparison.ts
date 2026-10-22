/**
 * Parse official Go and Go Plus model comparison limits
 *
 * Combine featured HTML rows with all Go/Go Plus limit and estimated-request rows in the official documentation, including models behind View all. Join exact display labels to endpoint IDs and rank by ascending Go request allowance, unlimited last. Ignore crossed-out promotional numbers and preserve unlimited values. Reject unsupported table shapes instead of fabricating limits. Does not fetch or access credentials.
 * @param opts.html HTML of the official OpenCode Go page containing Model, Est. requests / 5h and Monthly usage columns.
 * @param opts.markdown Official Go documentation Markdown with the Endpoints display-label to model-ID table.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** HTML of the official OpenCode Go page containing Model, Est. requests / 5h and Monthly usage columns. */
        html: string;
        /** Official Go documentation Markdown with the Endpoints display-label to model-ID table. */
        markdown: string;
    },
): Promise<Record<string, {go:NonNullable<types.llm.ModelPrice["go"]>;plus:NonNullable<types.llm.ModelPrice["plus"]>;order:number}>> {
    const clean=(text:string)=>text.replace(/~~[\s\S]*?~~/g,'').replace(/<s\b[^>]*>[\s\S]*?<\/s>/gi,'').replace(/<!--[\s\S]*?-->/g,'').replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&').replace(/&nbsp;/g,' ').replace(/&#39;/g,"'").replace(/&quot;/g,'"').replace(/\s+/g,' ').trim();
    const tables=[...opts.html.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)].map(m=>m[0]);
    const table=tables.find(t=>/Est\. requests \/ 5h/.test(clean(t))&&/Monthly usage/.test(clean(t)));
    if(!table)throw new Error('Official Go comparison table missing');
    const labels=new Map<string,string>();
    const endpoints=opts.markdown.split(/^## Endpoints\s*$/m)[1]?.split(/^## /m)[0];
    if(!endpoints)throw new Error('Official Go model IDs missing');
    for(const line of endpoints.split('\n')){const cells=line.split('|').slice(1,-1).map(s=>s.trim().replaceAll(String.fromCharCode(96),''));const [label,id,url]=cells;if(label&&id&&url?.startsWith('https://opencode.ai/inference/go/')&&/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(id))labels.set(clean(label),id);}
    const value=(text:string):number|'unlimited'|undefined=>{const t=clean(text).replace(/[$,]/g,'');if(t==='∞'||/^unlimited$/i.test(t))return 'unlimited';return /^\d+(?:\.\d+)?$/.test(t)?Number(t):undefined;};
    const result:Record<string,{go:NonNullable<types.llm.ModelPrice['go']>;plus:NonNullable<types.llm.ModelPrice['plus']>;order:number}>={};
    // The SSR page contains featured rows only. The official docs carry all rows
    // behind the site's View all button, with the same current plan figures.
    const docsLabel=(text:string)=>clean(text.split(/<br\s*\/?\s*>/i)[0]??'').replace(/\*\*/g,'').trim();
    const docValue=(text:string)=>value(clean(text).replace(/\*\*/g,'').replace(/\s+limited time.*$/i,''));
    const monthly=new Map<string,number|'unlimited'>();
    const requests=new Map<string,number|'unlimited'>();
    for(const [section,kind] of [[opts.markdown.split(/^## Usage limits\s*$/m)[1]?.split(/^### Estimated requests\s*$/m)[0]??'','monthly'],[opts.markdown.split(/^### Estimated requests\s*$/m)[1]?.split(/^### /m)[0]??'','requests']] as const){
        for(const block of section.matchAll(/<div\s+slot="(go|go-plus)"[^>]*>([\s\S]*?)<\/div>/g)){
            for(const line of block[2]!.split('\n')){
                if(!line.trim().startsWith('|'))continue;
                const cells=line.split('|').slice(1,-1).map(s=>s.trim());
                const id=labels.get(docsLabel(cells[0]??'').replace(/\s+\((?:[≤>]\s*[\d.]+K tokens|Off-Peak|Peak)\)$/,''));if(!id)continue;
                const amount=kind==='monthly'?docValue((cells.at(-1)??'').split(/<br\s*\/?\s*>/i)[0]??''):docValue(cells[1]??'');
                if(amount!==undefined)(kind==='monthly'?monthly:requests).set((block[1]==='go-plus'?'plus':'go')+':'+id,amount);
            }
        }
    }
    for(const id of labels.values()){
        const a=requests.get('go:'+id),b=requests.get('plus:'+id),c=monthly.get('go:'+id),d=monthly.get('plus:'+id);
        if(a!==undefined&&b!==undefined&&c!==undefined&&d!==undefined)result[id]={go:{requests5h:a,monthlyUsd:c},plus:{requests5h:b,monthlyUsd:d},order:0};
    }
    for(const row of table.matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi)){
     const label=clean(row[0].match(/<bdi\b[^>]*>([\s\S]*?)<\/bdi>/i)?.[1]??'');const id=labels.get(label);if(!id)continue;
     const cells=[...row[0].matchAll(/<td\b[^>]*data-slot=["']number["'][^>]*>([\s\S]*?)<\/td>/gi)].map(m=>[...m[1]!.matchAll(/<span\b[^>]*>([\s\S]*?)<\/span>/gi)].map(s=>value(s[1]!)));
     const requests=cells[0],monthly=cells[1];if(!requests||!monthly||requests.length!==2||monthly.length!==2)continue;
     const [a,b]=requests;const [c,d]=monthly;if(a===undefined||b===undefined||c===undefined||d===undefined)continue;
     result[id]={go:{requests5h:a,monthlyUsd:c},plus:{requests5h:b,monthlyUsd:d},order:0};
    }
    if(!Object.keys(result).length)throw new Error('Official Go comparison rows did not match exact model IDs');
    const expected=Number(/View all\s+(\d+)\s+models/i.exec(clean(opts.html))?.[1]??0);
    if(expected&&Object.keys(result).length<expected)throw new Error('Official Go comparison is incomplete');
    const sorted=Object.entries(result).sort((a,b)=>{
        const x=a[1].go.requests5h,y=b[1].go.requests5h;
        if(x===y)return 0;
        return x==='unlimited'?1:y==='unlimited'?-1:x-y;
    });
    return Object.fromEntries(sorted.map(([id,row],order)=>[id,{...row,order}]));
}
