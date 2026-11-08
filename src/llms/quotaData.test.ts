import {test, expect, spyOn} from "bun:test";
const quotaData = (await import("./quotaData.ts")).default;
const route = (await import("../api/$route_v1_quotas_GET.ts")).default;
const entry = (extra = {}) => ({provider:"codex",account:"default",label:"Codex",model:"codex:",models:[],usedPercent:80,resetsAt:Date.now()+100000,updatedAt:Date.now(),planType:null,parkedAgents:2,tone:"neutral",...extra});
const context = (entries: any[], gateway: any = null) => {
 const store = new Map<string,string>();
 return {store,fns:{llms:{usageData:async()=>({entries,gateway})},llm:{listAccounts:async()=>entries},procs:{db:{select:async()=>[...store].map(([key,value])=>({key,value})),run:async({sql,params}:any)=>{if(sql.startsWith("DELETE"))store.delete(params[0]);else store.set(params[0],params[1]);}}},settings:{getNumber:async({fallback}:any)=>fallback}}} as any;
};
test("classifies weekly primary by duration and computes threshold tones",async()=>{
 const q=await quotaData(context([entry({windows:{primary:{usedPercent:80,windowMinutes:10080},secondary:{usedPercent:35,windowMinutes:300}}})]),null,{});
 expect(q.accounts[0].windows?.weekly?.usedPercent).toBe(80);
 expect(q.accounts[0].windows?.fiveHour?.tone).toBe("warning");
 expect(q.accounts[0].tone).toBe("error");
 expect(q.accounts[0].model).toBe("codex/default:");
 expect(q.entries[0].tone).toBe("error");
});
test("preserves SSH identity and does not invent unknown periods",async()=>{
 const q=await quotaData(context([entry({account:"ssh.host.alice",windows:{primary:{usedPercent:80}}})]),null,{});
 expect(q.accounts[0].id).toBe("codex:alice@host");
 expect(q.accounts[0].connection).toBe("ssh");
 expect(q.accounts[0].windows).toEqual({});
});
test("status-only providers and disabled gateway have no quota",async()=>{
 const q=await quotaData(context([entry({provider:"xai",available:true})],{status:"unknown",reason:"disabled",models:[]}),null,{});
 expect(q.accounts[0].kind).toBe("status");
 expect(q.accounts[0].windows).toBeUndefined();
 expect(q.accounts.find(a=>a.provider === "oneapi")?.status).toBe("disabled");
});
test("expired windows do not report consumed quota",async()=>{
 const q=await quotaData(context([entry({usedPercent:null,windows:{primary:{usedPercent:90,windowMinutes:300,resetsAt:1}}})]),null,{});
 expect(q.accounts[0].windows?.fiveHour?.usedPercent).toBeNull();
 expect(q.accounts[0].quotaStatus).toBe("unavailable");
});
test("API only returns public envelope and disables caching",async()=>{
 const response=await route({fns:{llms:{quotaData:async()=>({updatedAt:123,accounts:[],entries:["private"],gateway:null})}}} as any,null,{req:new Request("http://localhost/api/v1/quotas"),params:{}});
 expect(await response.json()).toEqual({updatedAt:123,accounts:[]});
 expect(response.headers.get("cache-control")).toBe("no-store");
});

test("stable order ignores status and usage",async()=>{
 const values=[entry({provider:"zebra"}),entry({provider:"oneapi"}),entry({provider:"opencode"}),entry({provider:"minimax-coding"}),entry({provider:"zai-coding"}),entry({provider:"kimi-coding"}),entry({provider:"claude-code"}),entry({account:"ssh.b.b"}),entry({account:"a",node:"a"}),entry({account:"z"}),entry({account:"a"}),entry({provider:"alpha"})];
 const c=context(values);
 const first=await quotaData(c,null,{});
 expect(first.accounts.map(a=>a.provider)).toEqual(["codex","codex","codex","codex","claude-code","kimi-coding","zai-coding","minimax-coding","opencode","oneapi","alpha","zebra"]);
 expect(first.accounts.slice(0,4).map(a=>[a.connection,a.account])).toEqual([["local","a"],["local","z"],["hyper","a"],["ssh","b"]]);
 c.fns.llms.usageData=async()=>({entries:values.toReversed().map(e=>({...e,usedPercent:0,available:false,quotaStatus:"unavailable"})),gateway:null});
 expect((await quotaData(c,null,{})).accounts.map(a=>a.id)).toEqual(first.accounts.map(a=>a.id));
});
test("durable empty/thrown fallback, exact expiry, refresh, no TTL extension",async()=>{
 const start=1700000000000;
 const clock=spyOn(Date,"now").mockReturnValue(start);
 try {
 const values=[entry({windows:{primary:{usedPercent:80,windowMinutes:300,resetsAt:start+7200000}}})];
 const c=context(values);
 expect((await quotaData(c,null,{})).accounts[0].quotaUpdatedAt).toBe(start);
 c.fns.llms.usageData=async()=>({entries:[],gateway:null});
 clock.mockReturnValue(start+60000);
 const empty=await quotaData(c,null,{});
 expect(empty.accounts[0].quotaStatus).toBe("stale");
 expect(empty.accounts[0].windows?.fiveHour?.usedPercent).toBe(80);
 expect(empty.entries[0].windows?.primary?.usedPercent).toBe(80);
 c.fns.llms.usageData=async()=>{throw new Error("offline test");};
 clock.mockReturnValue(start+1799999);
 expect((await quotaData(c,null,{})).accounts[0].quotaUpdatedAt).toBe(start);
 clock.mockReturnValue(start+1800000);
 const expired=await quotaData(c,null,{});
 expect(expired.accounts[0].windows).toEqual({});
 expect(expired.accounts[0].quotaStatus).toBe("unavailable");
 expect(expired.accounts[0].quotaUpdatedAt).toBe(start);
 expect(expired.entries[0].usedPercent).toBeNull();
 c.fns.llms.usageData=async()=>({entries:[{...values[0],updatedAt:Date.now(),windows:{primary:{usedPercent:20,windowMinutes:300}}}],gateway:null});
 const refreshed=await quotaData(c,null,{});
 expect(refreshed.accounts[0].quotaStatus).toBe("fresh");
 expect(refreshed.accounts[0].quotaUpdatedAt).toBe(start+1800000);
 expect(refreshed.accounts[0].windows?.fiveHour?.usedPercent).toBe(20);
 } finally {clock.mockRestore();}
});
test("empty connected snapshot retains last good; explicit disconnect removes it",async()=>{
 const c=context([entry({windows:{primary:{usedPercent:80,windowMinutes:300}}})]);
 await quotaData(c,null,{});
 c.fns.llms.usageData=async()=>({entries:[entry({windows:{},updatedAt:0,usedPercent:null,quotaStatus:"unavailable"})],gateway:null});
 expect((await quotaData(c,null,{})).accounts[0].quotaStatus).toBe("stale");
 c.fns.llm.listAccounts=async()=>[];
 expect((await quotaData(c,null,{})).accounts).toEqual([]);
 expect(c.store.size).toBe(0);
});
