/**
 * Search literal text in the viewer-owned persisted conversation with bounded previews and cursor pages
 *
 * Use for the chat search dialog. Checks every ancestor owner before reading messages, includes persisted excluded messages and inherited fork prefixes, and never reads result files or other chats. Searches user and assistant message text, extracts only text blocks from multimodal arrays, and excludes system, tool and metadata rows; previews are plain text. Numeric cursor is a conversation ordinal, not authorization.
 * @param opts.agentId Conversation identifier owned by the authenticated viewer.
 * @param opts.query Literal case-insensitive search text, 1–200 characters. @minimum 1 @maximum 200
 * @param opts.after Exclusive conversation ordinal returned by the previous page. @default -1
 * @param opts.limit Maximum matching message previews. @default 30 @minimum 1 @maximum 50
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Conversation identifier owned by the authenticated viewer. */
        agentId: string;
        /** Literal case-insensitive search text, 1–200 characters. @minimum 1 @maximum 200 */
        query: string;
        /** Exclusive conversation ordinal returned by the previous page. @default -1 */
        after?: number;
        /** Maximum matching message previews. @default 30 @minimum 1 @maximum 50 */
        limit?: number;
    },
): Promise<{results: Array<{ordinal:number;agentId:string;idx:number;role:string;snippet:string;truncated:boolean}>;next:number|null}> {
    const viewer = await ctx.fns.auth.viewerId({});
    if (!viewer) throw new Error('Search requires an authenticated viewer');
    const q=opts.query, after=opts.after??-1, limit=opts.limit??30;
    if(typeof q!=='string'||!q.trim()||q.length>200||q.includes(String.fromCharCode(0))||!Number.isSafeInteger(after)||after< -1||!Number.isInteger(limit)||limit<1||limit>50||!opts.agentId) throw new Error('Invalid search parameters');
    type Node={id:string;parent_id:string|null;fork_offset:number|null;created_by:string};
    const chain:Node[]=[], seen=new Set<string>(); let id:string|null=opts.agentId;
    while(id){
     if(chain.length>=64||seen.has(id)) throw new Error('Invalid conversation lineage');
     seen.add(id);
     const rows=await ctx.fns.procs.db.select({sql:'SELECT id,parent_id,fork_offset,created_by FROM agents WHERE id=? AND created_by=?',params:[id,viewer]});
     const row=rows[0] as Node|undefined;
     if(!row) throw new Error('Conversation unavailable');
     chain.push(row); id=row.parent_id;
    }
    let segments:Array<{id:string;count:number}>=[];
    for(const node of chain.reverse()){
     if(node.fork_offset!==null){let remaining=Math.max(0,Number(node.fork_offset));segments=segments.map(s=>{const count=Math.min(remaining,s.count);remaining-=count;return {...s,count};}).filter(s=>s.count>0);}
     const rows=await ctx.fns.procs.db.select({sql:'SELECT count(*) AS n FROM messages WHERE agent_id=?',params:[node.id]});
     segments.push({id:node.id,count:Number(rows[0]?.n??0)});
    }
    let offset=0; const params:Array<string|number>=[];
    const parts=segments.map(s=>{const start=offset;offset+=s.count;params.push(start,s.id,s.count);return '(SELECT agent_id,idx,role,content,message_type,rn + ? AS ordinal FROM (SELECT agent_id,idx,role,content,message_type,row_number() OVER (ORDER BY idx)-1 AS rn FROM messages WHERE agent_id=?) numbered WHERE rn < ?)';});
    const sql="WITH scoped AS ("+parts.join(' UNION ALL ')+"), parsed AS (SELECT *,CASE WHEN left(content,1)='[' AND pg_input_is_valid(content,'jsonb') THEN content::jsonb ELSE NULL END AS blocks FROM scoped WHERE role IN ('user','assistant') AND COALESCE(message_type,'message') IN ('message','agent_message')), readable AS (SELECT agent_id,idx,role,ordinal,CASE WHEN jsonb_typeof(blocks)='array' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(blocks) b WHERE COALESCE(b->>'type','') NOT IN ('text','image','document','image_ref','document_ref')) THEN (SELECT string_agg(b->>'text',E'\\n' ORDER BY ord) FROM jsonb_array_elements(blocks) WITH ORDINALITY AS items(b,ord) WHERE b->>'type'='text') ELSE content END AS content FROM parsed), matches AS (SELECT *,strpos(lower(COALESCE(content,'')),lower(?)) AS hit FROM readable WHERE ordinal>?) SELECT agent_id,idx,role,ordinal,substring(content FROM greatest(1,hit-160) FOR 1200) AS snippet,(length(content)>1200) AS truncated FROM matches WHERE hit>0 ORDER BY ordinal LIMIT ?";
    const rows=await ctx.fns.procs.db.select({sql,params:[...params,q,after,limit+1]});
    const more=rows.length>limit;const results=rows.slice(0,limit).map(r=>({ordinal:Number(r.ordinal),agentId:String(r.agent_id),idx:Number(r.idx),role:String(r.role),snippet:String(r.snippet??''),truncated:Boolean(r.truncated)}));
    return {results,next:more?results[results.length-1]!.ordinal:null};
}
