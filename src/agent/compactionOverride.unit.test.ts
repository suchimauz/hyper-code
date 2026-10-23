import { expect, test } from 'bun:test';
import setCompaction from './setCompaction';
import post from './compactionPost';
import save from '../session/save';
import load from '../session/load';
import section from '../ui/agentMetaSection';
import button from '../procs/ui/button';
import redraw from '../ui/agentMetaSectionHtml';

function fixture() {
 const live:any={id:'fixture',model:'test:model',createdBy:'owner',messages:[],events:[],scratchpad:{}};
 const updates:any[]=[];const events:any[]=[];
 const ctx:any={state:{agent:{fixture:live}},fns:{procs:{db:{select:async(o:any)=>{updates.push(o);return [{id:'fixture'}];},run:async(o:any)=>updates.push(o)},ui:{escape:({text}:any)=>Bun.escapeHTML(String(text))}},events:{refreshAgentMeta:(e:any)=>events.push(e)},agent:{},ui:{},settings:{getNumber:async()=>65}}};
 ctx.fns.procs.ui.attr=()=>'';
 ctx.fns.procs.ui.button=(o:any)=>button(ctx,null,o);
 ctx.fns.agent.setCompaction=(o:any)=>setCompaction(ctx,null,o);
 return {ctx,live,updates,events};
}
test('setter validates finite bounds, updates only target, and reset persists null',async()=>{
 const f=fixture();
 for(const percent of [NaN,Infinity,-Infinity,29,96,'65',undefined]) await expect(setCompaction(f.ctx,null,{id:'fixture',percent} as any)).rejects.toThrow();
 expect(f.updates).toHaveLength(0);
 for(const percent of [30,65.5,95,null]) {await setCompaction(f.ctx,null,{id:'fixture',percent});expect(f.live.autoCompactWindowPercent).toBe(percent);expect(f.updates.at(-1).params[0]).toBe(percent);expect(f.updates.at(-1).params[2]).toBe('fixture');expect(f.events.at(-1).section).toBe('compaction');}
});
test('POST rejects absent blank nonfinite and file values; reset needs no valid number',async()=>{
 const f=fixture();
 for(const raw of [null,'',' ','NaN','Infinity','29','96',new Blob(['65'])]) {const form=new FormData();if(raw!==null)form.set('percent',raw);expect((await post(f.ctx,null,{id:'fixture',req:new Request('http://local',{method:'POST',body:form})})).status).toBe(400);}
 for(const form of [new URLSearchParams({percent:'71.5'}),new URLSearchParams({action:'inherit',percent:'invalid'})]) expect((await post(f.ctx,null,{id:'fixture',req:new Request('http://local',{method:'POST',body:form})})).status).toBe(204);
 expect(f.live.autoCompactWindowPercent).toBeNull();
});
test('save and load preserve explicit override and null inheritance',async()=>{
 for(const percent of [null,72.5]) {
 const f=fixture();f.live.autoCompactWindowPercent=percent;await save(f.ctx,null,{agent:f.live});
 const q=f.updates.find(x=>x.sql.includes('INSERT INTO agents'));expect(q.params[0]).toBe(percent);expect(q.sql).toContain('auto_compact_window_percent = excluded.auto_compact_window_percent');expect((q.sql.match(/\?/g)||[]).length).toBe(q.params.length);
 f.ctx.fns.procs.db.select=async()=>[{id:'fixture',auto_compact_window_percent:percent,tools:'[]',scratchpad:'{}'}];
 f.ctx.fns.session={syncAgentState:async({agent}:any)=>agent,getMessages:async()=>[],getEvents:async()=>[]};
 const loaded=await load(f.ctx,null,{id:'fixture'});expect(loaded?.autoCompactWindowPercent).toBe(percent);
 }
});
test('renderer labels dynamic inherited and explicit values and separate reset form',async()=>{
 const f=fixture();
 for(const globalCompactionPercent of [65,80]) {const html=section(f.ctx,null,{agent:f.live,section:'compaction',globalCompactionPercent});expect(html).toContain(`Following global setting: ${globalCompactionPercent}%`);expect(html).toContain('role="alert"');expect(html).toContain('min="30" max="95"');expect(html).toContain('global token limit');}
 f.live.autoCompactWindowPercent=75;
 const html=section(f.ctx,null,{agent:f.live,section:'compaction',globalCompactionPercent:80});expect(html).toContain('Agent override: 75%. Global setting: 80%.');expect(html).toContain('Follow global setting (80%)');expect(html).toContain('>Reset</button>');expect(html.match(/<form/g)).toHaveLength(2);
 f.ctx.fns.ui.agentMetaSection=(o:any)=>section(f.ctx,null,o);
 expect(await redraw(f.ctx,null,{agentId:'fixture',section:'compaction'})).toContain('Global setting: 65%.');
 f.ctx.fns.settings.getNumber=async()=>90;
 f.live.autoCompactWindowPercent=null;
 expect(await redraw(f.ctx,null,{agentId:'fixture',section:'compaction'})).toContain('Following global setting: 90%.');
});
