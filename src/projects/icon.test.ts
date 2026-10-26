import {test,expect} from 'bun:test';
import setIcon from './setIcon.ts';
import sanitizeSvg from '../chat/sanitizeSvg.ts';
import iconPopup from './iconPopup.ts';
import saveIcon from './saveIcon.ts';

function fixture(visible=true){
 const writes:any[]=[];
 const project:any={id:'p',title:'<Project>',icon:null};
 const ctx:any={fns:{projects:{get:async()=>visible?project:null,principal:async()=> 'owner',materialize:async()=>project},chat:{sanitizeSvg:(o:any)=>sanitizeSvg(null as any,null,o)},procs:{db:{run:async(o:any)=>{writes.push(o);project.icon=o.params[0];}},ui:{escape:({text}:any)=>String(text).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),button:({label}:any)=>'<button>'+label+'</button>'}},ui:{popupContent:({title,html}:any)=>html}}};
 ctx.fns.projects.setIcon=(o:any)=>setIcon(ctx,null,o);
 ctx.fns.projects.iconPopup=(o:any)=>iconPopup(ctx,null,o);
 return {ctx,writes,project};
}
test('project logos sanitize SVG, isolate membership updates and reset',async()=>{
 const {ctx,writes}=fixture();
 const out=await setIcon(ctx,null,{projectId:'p',svg:'<svg viewBox="0 0 8 8"><rect width="8" height="8" onclick="evil()"/></svg>'});
 expect(out.icon).not.toContain('onclick');expect(writes[0].sql).toContain('WHERE project_id=? AND principal=?');expect(writes[0].params.slice(1)).toEqual(['p','owner']);
 expect((await setIcon(ctx,null,{projectId:'p',emoji:'HC'})).icon).toContain('HC');
 expect((await setIcon(ctx,null,{projectId:'p',reset:true})).icon).toBeNull();
 await expect(setIcon(ctx,null,{projectId:'p',emoji:'x',background:'red;"'})).rejects.toThrow('CSS colour');
 await expect(setIcon(ctx,null,{projectId:'p',svg:'<div/>'})).rejects.toThrow();
 await expect(setIcon(ctx,null,{projectId:'p',emoji:'x',reset:true})).rejects.toThrow('exactly one');
});
test('unknown project cannot write or open an editor',async()=>{
 const {ctx,writes}=fixture(false);
 await expect(setIcon(ctx,null,{projectId:'secret',emoji:'x'})).rejects.toThrow('Project not found');
 expect((await iconPopup(ctx,null,{projectId:'secret'})).status).toBe(404);expect(writes).toHaveLength(0);
});
test('popup uses project-bound forms, offers reset and refreshes on save',async()=>{
 const {ctx,project}=fixture();project.icon='<svg/>';
 const html=await (await iconPopup(ctx,null,{projectId:'p'})).text();
 expect(html).toContain('projects.saveIcon');expect(html).toContain('projectId');expect(html).toContain('Back to folder icon');expect(html).not.toContain('chat.saveIcon');
 const result=await saveIcon(ctx,null,{projectId:'p',emoji:'HC'});expect(result.headers.get('HX-Refresh')).toBe('true');
 const invalid=await saveIcon(ctx,null,{projectId:'p',svg:'<div/>'});expect(await invalid.text()).toContain('text-error');
});
