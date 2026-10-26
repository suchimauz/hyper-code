import {expect,test} from 'bun:test';
import render from './meBadge';

const fixture=()=>({fns:{procs:{ui:{escape:({text}:{text:string})=>Bun.escapeHTML(text)}},auth:{listUsers:async()=>[{},{}]},ui:{inplacePopup:async(o:any)=>`<button ${o.triggerAttrs}>${o.triggerHtml}</button><div ${o.panelAttrs}>${o.contentHtml}</div>`}}});
const person={id:'person',name:'A <Name>',role:'member',picture:null,email:'a@example.test'};
test('account exposes real name and role while retaining sign-out and owner permissions',async()=>{
 const member=await render(fixture() as any,{user:person} as any,{});
 expect(member).toContain('class="account-name">A &lt;Name&gt;</span>');
 expect(member).toContain('class="account-role">Member</span>');
 expect(member).toContain('/auth/logout');
 expect(member).not.toContain('/auth/users');
 const owner=await render(fixture() as any,{user:{...person,role:'owner'}} as any,{});
 expect(owner).toContain('class="account-role">Owner</span>');
 expect(owner).toContain('/auth/users');
 expect(owner).toContain('data-placement="side"');
});
test('signed-out account stays empty without fabricated identity',async()=>{
 expect(await render(fixture() as any,null,{})).toBe('');
});
