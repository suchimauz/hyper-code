/**
 * Parse official OpenCode endpoint routes and public chat availability
 *
 * Parse the Console models Markdown Endpoints table including HTML wrappers. Exact supported official endpoint URLs override SDK packages. Documented Free labels and Free models prose identify public chat routes.
 * @param opts.plan Console billing plan whose exact endpoint prefix is allowed. @default payg
 * @param opts.markdown Official Console models Markdown with Endpoints table and Free models prose.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Official Console models Markdown with Endpoints table and Free models prose. */
        markdown: string;
        /** Console billing plan whose exact endpoint prefix is allowed. @default payg */
        plan?: 'go' | 'payg';
    },
): Promise<Array<{id:string;api:"openai"|"anthropic"|"responses"|"gemini";baseUrl:string;public:boolean}>> {
    const section = opts.markdown.split(/^## Endpoints\s*$/m)[1]?.split(/^## /m)[0];
    if (!section) throw new Error('OpenCode endpoint table is missing');
    const result: Array<{id:string;api:'openai'|'anthropic'|'responses'|'gemini';baseUrl:string;public:boolean}> = [];
    const freeSection = opts.markdown.split(/^### Free models\s*$/m)[1]?.split(/^#{1,3} /m)[0] ?? '';
    const seen = new Set<string>();
    const prefix = opts.plan === 'go' ? 'https://opencode.ai/inference/go' : 'https://opencode.ai/inference';
    for (const line of section.split('\n')) {
     if (!line.trim().startsWith('|')) continue;
     const [label,id,endpoint] = line.split('|').slice(1,-1).map(s=>s.trim().replaceAll(String.fromCharCode(96),''));
     if (!label || !id || !endpoint || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(id) || seen.has(id)) continue;
     let api: 'openai'|'anthropic'|'responses'|'gemini'; let baseUrl: string;
     if (endpoint === prefix+'/openai/v1/chat/completions') { api='openai';baseUrl=prefix+'/openai/v1'; }
     else if (endpoint === prefix+'/openai/v1/responses') { api='responses';baseUrl=prefix+'/openai/v1'; }
     else if (endpoint === prefix+'/anthropic/v1/messages') { api='anthropic';baseUrl=prefix+'/anthropic/v1'; }
     else if (endpoint === prefix+'/google/v1beta/models/'+id) { api='gemini';baseUrl=prefix+'/google/v1beta'; }
     else continue;
     const freeLabel = /\bFree$/i.test(label) || freeSection.split('\n').some(s=>s.startsWith('- '+label+' ') && /\bfree\b/i.test(s.slice(label.length+3)));
     result.push({id,api,baseUrl,public:opts.plan !== 'go' && api === 'openai' && freeLabel});seen.add(id);
    }
    if (!result.length) throw new Error('OpenCode endpoint table contains no supported routes');
    return result;
}
