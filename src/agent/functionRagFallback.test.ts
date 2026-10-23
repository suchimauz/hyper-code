import {test, expect} from 'bun:test';
import functionRag from './functionRag';

function fixture() {
    const calls={rerank:0,warnings:0};
    const hits=[
        {name:'agent.search',summary:'Find agents',signature:'({query:string}) => unknown',score:0.001,evidence:'bm25'},
        {name:'files.read',summary:'Read files',signature:'({path:string}) => string',score:12,evidence:'bm25'},
        {name:'tmp.private',summary:'Excluded',signature:'()',score:20,evidence:'bm25'},
        {name:'agent.bad',summary:'Zero score',signature:'()',score:0,evidence:'bm25'},
    ];
    const ctx:any={fns:{runtime:{docs:{search:async()=>hits}},jev:{selectFunctions:async()=>{calls.rerank++;throw new Error('timeout');}},procs:{log:{warn:()=>{calls.warnings++;}}}}};
    const opts:any={agent:{id:'synthetic',functionRagEnabled:true,jevRerankEnabled:false},messages:[{role:'user',content:'Find an agent',idx:0}]};
    return {ctx,calls,opts,hits};
}
test('raw BM25 candidates survive with embeddings off and retain retrieval order',async()=>{
    const {ctx,calls,opts}=fixture();
    const result=await functionRag(ctx,null,opts);
    expect(result?.functions.map(f=>f.name)).toEqual(['agent.search','files.read']);
    expect(result?.rerankStatus).toBe('off');expect(calls.rerank).toBe(0);
});
test('Jev timeout restores raw BM25 recommendations',async()=>{
    const {ctx,calls,opts}=fixture();opts.agent.jevRerankEnabled=true;
    const result=await functionRag(ctx,null,opts);
    expect(result?.functions.map(f=>f.name)).toEqual(['agent.search','files.read']);
    expect(result?.rerankStatus).toBe('error');expect(result?.reranked).toBe(false);expect(calls.warnings).toBe(1);
});
test('RRF evidence retains existing score floor and ignores unsupported evidence',async()=>{
    const {ctx,opts,hits}=fixture();hits.splice(0,hits.length,
        {name:'agent.search',summary:'Find',signature:'()',score:0.016,evidence:'intersection'},
        {name:'files.read',summary:'Read',signature:'()',score:0.014,evidence:'bm25-only'},
        {name:'other.fn',summary:'Other',signature:'()',score:5,evidence:'unknown'});
    expect((await functionRag(ctx,null,opts))?.functions.map(f=>f.name)).toEqual(['agent.search']);
});
