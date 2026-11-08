import { afterEach, expect, it, vi } from 'vitest';
import { getDraftModelSettings, normalizeEffort } from '../lib/models';
import { rememberSessionSelection } from '../lib/newSession';
afterEach(()=>{vi.unstubAllGlobals(); localStorage.clear();});
const config = {model:'default',defaultModel:'default',label:'Default',icon:null,models:['first','default','remembered'].map(model=>({model,label:model,provider:'test',disabled:false,icon:null})),effort:{requested:'auto',applied:'medium',supported:['auto','low','medium','high'],mode:'openai-effort'}};
it('uses remembered available model, but first enabled when a removed model is remembered', async()=>{
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>{const model=new URL(url,'http://test').searchParams.get('model')||'default';return Response.json({...config,model});}));
 rememberSessionSelection({model:'remembered'});
 expect((await getDraftModelSettings('','high')).model).toBe('remembered');
 rememberSessionSelection({model:'gone'});
 const restored=await getDraftModelSettings('gone','xhigh');
 expect(restored.model).toBe('first');expect(restored.effort.requested).toBe('auto');
 expect((await getDraftModelSettings('default','low')).effort.requested).toBe('low');
});
it('never silently downgrades unsupported draft effort to another explicit level',()=>{
 expect(normalizeEffort('xhigh',['auto','low','high'])).toBe('auto');
 expect(normalizeEffort('',['auto','low'])).toBe('auto');
 expect(normalizeEffort('high',['auto','high'])).toBe('high');
});
