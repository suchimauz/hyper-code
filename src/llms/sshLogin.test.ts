import { expect, test } from 'bun:test';
import popup from './loginPopup';
import popupFor from './loginPopupFor';
import start from './startLoginFromPopup';
import card from './accountsCard';

function fixture() {
 const calls: Array<[string, any]> = [];
 const record = (name: string, result: any) => (o: any) => { calls.push([name,o]); return result; };
 const ctx: any = { state: {sshAccount: {flows: new Map()}}, fns: {
 procs: {ui: {field: ({name}: any) => `<input name="${name}">`, escape: ({text}: any) => Bun.escapeHTML(String(text)), button: (o: any) => JSON.stringify(o), select: ({name, value, options}: any) => `<select name="${name}" value="${value}">${options.map((o: any) => `<option value="${o.value}">${o.label}</option>`).join('')}</select>`, row: (o: any) => JSON.stringify(o), heading: (o: any) => o.title, empty: () => '', toolbar: () => ''}},
 ui: {popupContent: ({html}: any) => html, popup: (o: any) => JSON.stringify(o), modelLogo: () => '', live: ({html}: any) => html},
 llms: {loginPopup: (o: any) => popup(ctx,null,o)},
 sshInstance: {list: record('instances',[])},
 sshAccount: {startLogin: record('remote',{id:'flow'}), progressPopup: record('progress','remote-progress')},
 llm: {startAccountLogin: record('local',null), startXaiOAuth: record('xai',null), accountLoginStatus: () => []}
 }};
 return {ctx,calls};
}
test('selectors only appear for new CLI accounts when instances exist', async () => {
 const {ctx} = fixture();
 for(const provider of ['codex','claude-code'] as const) {
 expect(await popupFor(ctx,null,{provider})).not.toContain('name="instance"');
 const instances = [{name:'untrusted',pinnedHostKey:null},{name:'trusted',pinnedHostKey:'key'}];
 const html = popup(ctx,null,{provider,instances});
 expect(html).toContain('name="instance"'); expect(html).toContain('Local (this machine)'); expect(html).toContain('trust required'); expect(html).toContain('trusted');
 expect(popup(ctx,null,{provider,instances,account:'local'})).not.toContain('name="instance"');
 }
 expect(popup(ctx,null,{provider:'xai',instances:[{name:'remote',pinnedHostKey:null}]})).not.toContain('name="instance"');
});
test('routes local and SSH independently, rejecting remote Grok', async () => {
 for(const provider of ['codex','claude-code'] as const) {
 const {ctx,calls} = fixture();
 await start(ctx,null,{provider,account:'work',instance:''}); expect(calls[0]?.[0]).toBe('local');
 calls.length=0;
 expect(await start(ctx,null,{provider,account:'work',instance:'box'})).toBe('remote-progress');
 expect(calls).toEqual([['remote',{provider,account:'work',instance:'box'}],['progress',{id:'flow'}]]);
 calls.length=0;
 ctx.fns.sshAccount.startLogin = () => {throw new Error('Trust the SSH host first');};
 await expect(start(ctx,null,{provider,account:'work',instance:'box'})).rejects.toThrow('Trust'); expect(calls).toEqual([]);
 }
 const {ctx,calls} = fixture();
 await expect(start(ctx,null,{provider:'xai',account:'work',instance:'box'})).rejects.toThrow('does not support'); expect(calls).toEqual([]);
 await start(ctx,null,{provider:'xai',account:'work'}); expect(calls[0]?.[0]).toBe('xai');
});
test('remote reconnect keeps target fixed and excludes managed/local routing', async () => {
 const {ctx,calls} = fixture();
 const html = await popupFor(ctx,null,{provider:'claude-code',account:'work',instance:'box'});
 expect(html).toContain('name="instance" value="box"'); expect(html).not.toContain('startClaudeManagedOAuth'); expect(calls).toEqual([]);
});
test('SSH accounts are provider grouped with target badge, remote reconnect and pending progress', () => {
 const {ctx} = fixture();
 for(const provider of ['codex','claude-code'] as const) {
 const account: any = {provider,account:'ssh.box.work',label:'remote',model:`ssh/box:${provider}/work:`,source:'ssh',available:true,usedPercent:null,planType:null,resetsAt:null,parkedAgents:0,needsReconnect:true};
 const html = card(ctx,null,{accounts:[account]});
 expect(html).toContain(`data-provider="${provider === 'codex' ? 'codex' : 'claude'}"`); expect(html).toContain('SSH · box'); expect(html).toContain('llms.loginPopupFor'); expect(html).toContain('\\"instance\\":\\"box\\"'); expect(html).not.toContain('llms.removeAccount'); expect(html).not.toContain('/llms/codex/reset');
 ctx.state.sshAccount.flows.set('flow',{id:'flow',provider,instance:'box',account:'work',status:'pending'});
 expect(card(ctx,null,{accounts:[account]})).toContain('sshAccount.progressPopup');
 }
});
