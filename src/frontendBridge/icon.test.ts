import { test, expect } from 'bun:test';
import iconData from './iconData';
import modelLogo from '../ui/modelLogo';
const ctx = { fns: { procs: { ui: { escape: ({text}: {text:string}) => text } }, ui: { modelLogo: (opts: any) => modelLogo(ctx as any, null, opts) } } };
test('custom SVG wins over provider and stays an inert image URL', async () => {
 const svg='<svg viewBox="0 0 24 24"><path fill="red" d="M1 1"/></svg>';
 const result=await iconData(ctx as any,null,{icon:svg,model:'openai:gpt-4'});
 expect(result?.custom).toBe(true);expect(decodeURIComponent(result!.src)).toContain('fill="red"');expect(decodeURIComponent(result!.src)).toContain('xmlns="http://www.w3.org/2000/svg"');
});
test('fallback uses native provider resolution including SSH and Hyper transport', async () => {
 const direct=await iconData(ctx as any,null,{model:'openai:gpt-4'});
 expect(direct?.custom).toBe(false);expect(direct?.src).toContain('data:image/svg+xml,');
 expect(await iconData(ctx as any,null,{model:'ssh/host:openai:gpt-4'})).toEqual(direct);
 expect(await iconData(ctx as any,null,{model:'hyper/host:openai:gpt-4'})).toEqual(direct);
 expect(await iconData(ctx as any,null,{model:'anthropic:claude'})).not.toEqual(direct);
 expect(await iconData(ctx as any,null,{model:'unknown:model'})).toBeNull();
});
