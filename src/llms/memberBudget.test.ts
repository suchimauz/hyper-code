import {expect,test} from 'bun:test';
import usageDial from '../ui/usageDial';

test('OpenCode monthly budget is monetary text, never a ring',()=>{
 const ctx:any={fns:{procs:{ui:{escape:({text}:any)=>String(text)}},ui:{modelLogo:()=>'<i>logo</i>'}}};
 const entry={provider:'opencode',account:'default',label:'OpenCode Console',usedPercent:null,resetsAt:null,planType:'Pay as you go',parkedAgents:0,tone:'neutral' as const,memberBudgetText:'Monthly member budget $1.25 / $10.00'};
 const html=usageDial(ctx,null,{entries:[entry]});
 expect(html).toContain('Monthly member budget $1.25 / $10.00');
 expect(html).not.toContain('<circle');
 expect(html).not.toContain('quota-ring');
 expect(html).not.toContain('%');
});

test('Go desktop links Console Go with no dollars, unlimited budget or quota ring',()=>{
 const ctx:any={fns:{procs:{ui:{escape:({text}:any)=>String(text)}},ui:{modelLogo:()=>'<i>logo</i>'}}};
 const html=usageDial(ctx,null,{entries:[{provider:'opencode',account:'default',label:'OpenCode Go',usedPercent:null,resetsAt:null,planType:'Go subscription',parkedAgents:0,tone:'neutral',memberBudgetText:'Monthly member budget $5 / unlimited'}]});
 expect(html).toContain('Go quota unavailable');
 expect(html).toContain('Console Go');
 expect(html).toContain('href="https://opencode.ai/console"');
 for(const forbidden of ['<circle','unlimited','$5','Monthly member budget']) expect(html).not.toContain(forbidden);
});
