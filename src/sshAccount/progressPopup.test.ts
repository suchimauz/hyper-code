import {expect,test} from 'bun:test';
import progress from './progressPopup';
import field from '../procs/ui/field';
import button from '../procs/ui/button';
import attr from '../procs/ui/attr';
function fixture(status='pending') {
 const ctx:any={fns:{sshAccount:{status:async()=>({id:'f',instance:'eu',provider:'claude-code',account:'work',status,verificationUri:'https://claude.ai/oauth/authorize',userCode:null,error:null})},procs:{ui:{escape:({text}:any)=>Bun.escapeHTML(String(text??''))}},ui:{popupContent:({html}:any)=>html}}};
 for(const [name,fn] of Object.entries({field,button,attr}))ctx.fns.procs.ui[name]=(o:any)=>(fn as any)(ctx,null,o);
 return ctx;
}
test('remote login progress uses shared fields/buttons and identifies remote host',async()=>{
 const html=await progress(fixture(),null,{id:'f'});
 expect(html).toContain('SSH eu');expect(html).toContain('input input-sm');expect(html).toContain('ui-button');expect(html).toContain('type="password"');expect(html).toContain('sshAccount.submitFromPopup');expect(html).toContain('rel="noopener noreferrer"');
});
test('missing link explains retry and hides unusable browser-code form',async()=>{
 const ctx=fixture();ctx.fns.sshAccount.status=async()=>({id:'f',instance:'eu',provider:'claude-code',account:'work',status:'pending',verificationUri:null,userCode:null,error:null});
 const html=await progress(ctx,null,{id:'f'});
 expect(html).toContain('cancel this attempt and start login again');
 expect(html).not.toContain('sshAccount.submitFromPopup');
 expect(html).toContain('sshAccount.cancelFromPopup');
 expect(html).toContain('sshAccount.progressPopup');
});
test('completed remote login hides authorization and code submission controls',async()=>{
 const html=await progress(fixture('connected'),null,{id:'f'});
 expect(html).not.toContain('sshAccount.submitFromPopup');expect(html).not.toContain('href="https://claude.ai');expect(html).toContain('account is connected');
});
test('callback instructions protect the URL and submitted callbacks cannot be sent again',async()=>{
 const ctx=fixture();const original=ctx.fns.sshAccount.status;let html=await progress(ctx,null,{id:'f'});expect(html).toContain('Browser callback URL');expect(html).toContain('Do not paste it in chat');expect(html).toContain('autocomplete="off"');
 ctx.fns.sshAccount.status=async()=>({...await original(),callbackSubmission:'uncertain'});html=await progress(ctx,null,{id:'f'});expect(html).not.toContain('sshAccount.submitFromPopup');expect(html).toContain('do not resend');
});
