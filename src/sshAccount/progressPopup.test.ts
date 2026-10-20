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
test('completed remote login hides authorization and code submission controls',async()=>{
 const html=await progress(fixture('connected'),null,{id:'f'});
 expect(html).not.toContain('sshAccount.submitFromPopup');expect(html).not.toContain('href="https://claude.ai');expect(html).toContain('remote account is connected');
});
