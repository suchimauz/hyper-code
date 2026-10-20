import { expect, test } from 'bun:test';
import page from './$route_GET';
import field from '../procs/ui/field';
import card from '../procs/ui/card';
import textarea from '../procs/ui/textarea';
import button from '../procs/ui/button';
import checkboxGroup from '../procs/ui/checkboxGroup';
import attr from '../procs/ui/attr';

function fixture(items: any[]) {
    const ctx: any = { fns: { procs: { ui: { escape: ({text}: any) => Bun.escapeHTML(String(text ?? '')) } }, sshInstance: { list: async () => items } } };
    for (const [name, fn] of Object.entries({field, card, textarea, button, checkboxGroup, attr})) ctx.fns.procs.ui[name] = (opts: any) => (fn as any)(ctx, null, opts);
    return ctx;
}
const owner: any = { user: { role: 'owner' } };
const instance = { name: 'eu', user: 'runner', host: 'example.org', port: 22, publicKey: 'ssh-ed25519 public', pinnedHostKey: null };
test('SSH page uses shared input and button components and delegates accounts to LLM Connections', async () => {
    const result = await page(fixture([]), owner, { req: new Request('http://localhost/sshInstance'), params: {} });
    if (result instanceof Response) throw new Error('expected page');
    expect(result.main).toContain('input input-sm');
    expect(result.main).toContain('ui-button');
    expect(result.main).toContain('name="port"');
    expect(result.main).toContain('href="/llms"');
    expect(result.main).not.toContain('sshAccount.');
    expect(result.main).not.toContain('Remote accounts');
});
test('untrusted instance has shared host verification controls and disabled connection test', async () => {
    const result = await page(fixture([instance]), owner, { req: new Request('http://localhost/sshInstance'), params: {} });
    if (result instanceof Response) throw new Error('expected page');
    expect(result.main).toContain('textarea');
    expect(result.main).toContain('checkbox checkbox-sm');
    expect(result.main).toContain('disabled aria-disabled="true"');
    expect(result.main).toContain('name="confirmed"');
    expect(result.main).not.toContain('Add remote account');
});
test('verified host shows test action and collapses security detail without claiming connection success', async () => {
    const result = await page(fixture([{...instance, name: '<bad>', pinnedHostKey: 'ssh-ed25519 pinned'}]), owner, { req: new Request('http://localhost/sshInstance?result=error&message=%3Cscript%3E'), params: {} });
    if (result instanceof Response) throw new Error('expected page');
    expect(result.main).toContain('Host verified');
    expect(result.main).toContain('SSH keys &amp; security');
    expect(result.main).toContain('name="action" value="probe"');
    expect(result.main).not.toContain('disabled aria-disabled="true"');
    expect(result.main).toContain('&lt;bad&gt;');
    expect(result.main).toContain('&lt;script&gt;');
    expect(result.main).toContain('border-error/30');
});
test('instance exposes prefilled editing, explicit removal and host-key replacement forms', async () => {
    const result = await page(fixture([{...instance, pinnedHostKey: 'ssh-ed25519 pinned'}]), owner, {req:new Request('http://localhost/sshInstance'),params:{}});
    if(result instanceof Response) throw new Error('expected page');
    for(const text of ['Edit connection','Remove instance','Replace host key','name="action" value="save"','name="action" value="remove"','name="replace" value="yes"','value="example.org"','value="runner"','ui-button--danger','/etc/ssh/ssh_host_ed25519_key.pub']) expect(result.main).toContain(text);
    expect(result.main).not.toContain('name="confirmed" value="yes" checked');
    expect(result.main).toContain('Remote credentials and authorized_keys are not changed');
});
