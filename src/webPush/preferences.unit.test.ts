import {describe,expect,test} from 'bun:test';
import preferences from './preferences';
import settingsHtml from './settingsHtml';
import savePreferences from './savePreferences';
import toggle from '../ui/toggle';
import button from '../procs/ui/button';
import { Window } from 'happy-dom';

function fixture(rows: object[] = [{input_enabled:null,error_enabled:null}]) {
 const calls: any[]=[];
 const ctx:any={fns:{procs:{db:{select:async(o:any)=>{calls.push(o);return rows;}},auth:{cookieName:()=> 'sid'}},webPush:{sessionBinding:async()=>({ownerId:'owner',expiresAt:Date.now()+60000}),preferences:async()=>({input:true,error:true,eligible:true}),settingsHtml:async()=>'<form>saved</form>'},http:{publicOrigin:async()=> 'https://hyper.test'},auth:{verifyCsrf:async()=>true,csrfToken:async()=> 'csrf<token'}}};
 ctx.fns.procs.ui={escape:({text}:any)=>Bun.escapeHTML(String(text)),attr:()=>''};
 ctx.fns.ui={toggle:(opts:any)=>toggle(ctx,null,opts)};
 ctx.fns.procs.ui.button=(opts:any)=>button(ctx,null,opts);
 const session:any={user:{id:'owner'},req:new Request('https://hyper.test/a/main')};
 return {ctx,session,calls};
}
function request(body='agentId=main&csrf=token&input=true&error=true',headers:Record<string,string>={}) {
 return new Request('https://hyper.test/webPush/preferences',{method:'POST',headers:{cookie:'sid=signed',origin:'https://hyper.test','content-type':'application/x-www-form-urlencoded',...headers},body});
}
describe('owner push preferences',()=>{
 test('missing preference defaults both on, owner and main eligibility enforced in SQL',async()=>{
  const {ctx,calls}=fixture(); expect(await preferences(ctx,null,{agentId:'main'})).toEqual({input:true,error:true,eligible:true});
  expect(calls[0].params).toEqual(['main']); for(const clause of ['p.owner_id=a.created_by','a.parent_id IS NULL',"COALESCE(a.visibility,'nav')='nav'",'u.disabled_at IS NULL','a.archived_at IS NULL']) expect(calls[0].sql).toContain(clause);
 });
 test('missing eligible agent is denied, persisted switches independent',async()=>{
  expect(await preferences(fixture([]).ctx,null,{agentId:'child'})).toEqual({input:false,error:false,eligible:false});
  expect(await preferences(fixture([{input_enabled:false,error_enabled:true}]).ctx,null,{agentId:'main'})).toEqual({input:false,error:true,eligible:true});
 });
 test('inspector has two checked controls with escaped values',async()=>{
  const {ctx,session}=fixture(); const html=await settingsHtml(ctx,session,{agentId:'a"<'});
  expect(html).toContain('Push Notifications'); expect(html.match(/ checked/g)?.length).toBe(2); expect(html).toContain('Action required');expect(html).toContain('Work stopped by error');expect(html).toContain('a&quot;&lt;'); expect(html).toContain('csrf&lt;token');
 });
 test('compact shared controls preserve the true/absent POST contract and explicit Save',async()=>{
  const {ctx,session,calls}=fixture();
  const win=new Window();
  try {
   win.document.body.innerHTML=await settingsHtml(ctx,session,{agentId:'main'});
   const form=win.document.querySelector('form')!;
   expect(form.getAttribute('hx-post')).toBe('/webPush/preferences');
   expect(form.getAttribute('hx-target')).toBe('this');
   expect(form.getAttribute('hx-swap')).toBe('outerHTML');
   expect(form.querySelector('legend')?.textContent).toBe('Push Notifications');
   expect(form.querySelectorAll('.ui-toggle-input')).toHaveLength(2);
   expect(form.querySelectorAll('.ui-button--xs.ui-button--default[type="submit"]')).toHaveLength(1);
   expect(form.innerHTML).not.toContain('underline');
   expect(form.querySelectorAll('[hx-trigger]')).toHaveLength(0);
   const input=form.querySelector('input[name="input"]') as any;
   input.checked=false;
   const data=new win.FormData(form as any);
   expect(data.get('input')).toBeNull(); expect(data.get('error')).toBe('true');
   expect(data.get('csrf')).toBe('csrf<token');
   const body=new URLSearchParams([...data.entries()] as [string,string][]).toString();
   calls.length=0;
   const response=await savePreferences(ctx,session,{req:request(body)});
   expect(response.status).toBe(200); expect(calls[0].params.slice(0,2)).toEqual([false,true]);
  } finally {await win.happyDOM.close();}
 });
 test('no controls for non-owner, child or unauthenticated viewer',async()=>{
  const {ctx,session}=fixture([]); expect(await settingsHtml(ctx,session,{agentId:'other'})).toBe('');
  expect(await settingsHtml(ctx,null,{agentId:'main'})).toBe('');
  ctx.fns.procs.db.select=async()=>[{id:'child'}];ctx.fns.webPush.preferences=async()=>({eligible:false}); expect(await settingsHtml(ctx,session,{agentId:'child'})).toBe('');
 });
 test('save derives owner server-side and writes unchecked flags false',async()=>{
  const {ctx,session,calls}=fixture([{agent_id:'main'}]);const res=await savePreferences(ctx,session,{req:request('agentId=main&csrf=token&error=true')});expect(res.status).toBe(200);const html=await res.text();expect(html).toContain('Notification preferences saved.');expect(html).toContain('role="status"');
  expect(calls[0].params.slice(0,2)).toEqual([false,true]);expect(calls[0].params.slice(3)).toEqual(['main','owner']);expect(calls[0].sql).toContain('a.created_by=?');expect(calls[0].sql).toContain('a.parent_id IS NULL');
 });
 test('rejects forged owner, duplicate fields, invalid checkbox, large form',async()=>{
  for(const body of ['agentId=main&ownerId=other','agentId=main&agentId=other','agentId=main&input=false','x'.repeat(5000)]){const {ctx,session,calls}=fixture();expect((await savePreferences(ctx,session,{req:request(body)})).status).toBe(body.length>4096?413:400);expect(calls).toHaveLength(0);}
 });
 test('rejects missing user, mismatched session, cross origin, CSRF failure, nonowner/ineligible agent',async()=>{
  let f=fixture(); expect((await savePreferences(f.ctx,null,{req:request()})).status).toBe(401);
  f=fixture();f.ctx.fns.webPush.sessionBinding=async()=>({ownerId:'other',expiresAt:Date.now()+60000});expect((await savePreferences(f.ctx,f.session,{req:request()})).status).toBe(401);expect(f.calls).toHaveLength(0);
  f=fixture();expect((await savePreferences(f.ctx,f.session,{req:request(undefined,{origin:'https://evil.test'})})).status).toBe(403);expect(f.calls).toHaveLength(0);
  f=fixture();f.ctx.fns.auth.verifyCsrf=async()=>false;expect((await savePreferences(f.ctx,f.session,{req:request()})).status).toBe(403);expect(f.calls).toHaveLength(0);
  f=fixture([]);expect((await savePreferences(f.ctx,f.session,{req:request()})).status).toBe(403);
 });
});
