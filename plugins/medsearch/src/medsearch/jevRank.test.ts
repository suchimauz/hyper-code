import {test,expect} from 'bun:test';
import rank from './jevRank';
const papers=[{id:'1',title:'A',abstract:'Public abstract',publicationTypes:[],meshTerms:[],url:'https://pubmed.ncbi.nlm.nih.gov/1/'},{id:'2',title:'B',abstract:'Public abstract',publicationTypes:[],meshTerms:[],url:'https://pubmed.ncbi.nlm.nih.gov/2/'}] as any;
const opts={query:'Synthetic question',papers,limit:2,retries:0};
function fixture(decide:any){return {fns:{medsearch:{rank:async()=>papers},jev:{decide}}} as any;}
test('one batched request retains original links and forwards zero retries',async()=>{
 let calls=0;
 const ctx=fixture(async(o:any)=>{calls++;expect(o.retries).toBe(0);expect(Object.keys(o.questions)).toEqual(['p0','p1']);return {answers:{p0:{type:'noul',noul:0.2},p1:{type:'noul',noul:0.9}}};});
 const out=await rank(ctx,null,opts);expect(calls).toBe(1);expect(out.map(p=>p.id)).toEqual(['2','1']);expect(out[0]?.url).toBe(papers[1].url);
});
test('transport failure preserves lexical order without invented scores',async()=>{
 const out=await rank(fixture(async()=>{throw new Error('timeout');}),null,opts);
 expect(out).toEqual(papers);expect(out.every(p=>p.relevanceScore===undefined)).toBe(true);
});
test('missing or invalid answer preserves lexical fallback',async()=>{
 for(const value of [undefined,NaN,1.2]){
 const out=await rank(fixture(async()=>({answers:{p0:{type:'noul',noul:0.5},...(value===undefined?{}:{p1:{type:'noul',noul:value}})}})),null,opts);
 expect(out).toEqual(papers);
 }
});
