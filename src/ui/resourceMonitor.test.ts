import { expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import monitor from './resourceMonitor';
import route from './$route_server-resources_GET';

const source = await Bun.file(new URL('./$script_resources.js', import.meta.url)).text();
const ctx = { fns: { procs: { ui: { escape: ({text}: {text:string}) => Bun.escapeHTML(text) } } } } as unknown as Context;
const GiB = 1024 ** 3;
const sample = () => ({sampledAt:Date.now(),host:'local<host>',platform:'linux',cpuCount:8,cpu:{machine:38,hyper:18},memory:{total:32*GiB,used:11.8*GiB,hyper:2.4*GiB},swap:{total:4*GiB,used:GiB,hyper:160*1024**2},processCount:3,groups:[{name:'<script>bad</script>',count:3,cpu:18,memory:2.4*GiB,swap:160*1024**2}],memoryBasis:'PSS',supported:true,note:null});
const flush = () => new Promise(resolve => setTimeout(resolve, 15));
async function fixture(collapsed = false) {
    const w = new Window({url:'https://hyper.test/agent/test'});
    const html = await monitor(ctx,null,{agentId:'test'});
    w.document.write(`<style>.agent-meta-collapsed [data-agent-meta-content]{display:none}[hidden]{display:none!important}</style><div data-page="agent"><section id="chat-panel" data-agent-id="test"><textarea>draft</textarea>${html}</section><aside id="agent-meta-test" class="${collapsed?'agent-meta-collapsed':''}"><div data-agent-meta-content>Plan</div></aside></div>`);
    Object.defineProperty(w.document,'hidden',{value:false,configurable:true});
    const timeouts = new Map<number,()=>void>(); let next = 0;
    w.setTimeout = ((fn:()=>void) => {const n=++next;timeouts.set(n,fn);return n;}) as any;
    w.clearTimeout = ((id:number) => timeouts.delete(id)) as any;
    let requests=0,fail=false,value=sample();
    w.fetch = (async () => {requests++;if(fail)throw new Error('offline');return new w.Response(JSON.stringify(value));}) as any;
    w.eval(source); await flush();
    return {w,doc:w.document,timeouts,html,requests:()=>requests,setFail:()=>{fail=true;},setValue:(v:any)=>{value=v;},async refresh(){w.dispatchEvent(new w.Event('online'));for(const [id,fn] of [...timeouts]){timeouts.delete(id);fn();}await flush();},async done(){Object.defineProperty(w.document,'hidden',{value:true,configurable:true});w.document.dispatchEvent(new w.Event('visibilitychange'));await w.happyDOM.abort();}};
}

test('renderer has accessible unique names and no invented metrics',async()=>{
    const html=await monitor(ctx,null,{agentId:'a"<'});
    expect(html).toContain('aria-labelledby="resource-title-a&quot;&lt;"');
    expect(html).toContain('CPU — · RAM — · Swap —');
    expect(html).not.toContain('38%');
});

test('expanded inspector receives the same live panel, compact footer is hidden',async()=>{
    const f=await fixture();try{
        expect(f.doc.querySelector('#agent-meta-test > [data-resource-panel]')).not.toBeNull();
        expect((f.doc.querySelector('[data-resource-dock]') as any).hidden).toBe(true);
        expect(f.doc.querySelector('[data-resource-metric="cpu"] [data-resource-machine]')!.textContent).toBe('38%');
        expect(f.doc.querySelector('[data-resource-metric="cpu"] [data-resource-hyper]')!.textContent).toBe('18%');
        expect(f.doc.querySelector('[data-resource-host]')!.textContent).toContain('local<host>');
        expect(f.doc.querySelector('[data-resource-groups] script')).toBeNull();
        expect(f.doc.querySelectorAll('[data-resource-panel]').length).toBe(1);
        expect(f.requests()).toBe(1);
    }finally{await f.done();}
});

test('collapsed inspector leaves a compact row and independent keyboard-dismissible popup',async()=>{
    const f=await fixture(true);try{
        const panel=f.doc.querySelector('[data-resource-panel]') as any,trigger=f.doc.querySelector('[data-resource-open]') as any;
        expect(panel.hidden).toBe(true);
        expect((f.doc.querySelector('[data-resource-dock]') as any).hidden).toBe(false);
        trigger.click();expect(panel.hidden).toBe(false);expect(trigger.getAttribute('aria-expanded')).toBe('true');
        expect(f.doc.activeElement).toBe(panel.querySelector('[data-resource-close]'));
        f.doc.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
        expect(panel.hidden).toBe(true);expect(f.doc.activeElement).toBe(trigger);
        trigger.click();(f.doc.querySelector('textarea') as any).click();expect(panel.hidden).toBe(true);
        expect((f.doc.querySelector('textarea') as any).value).toBe('draft');
        f.doc.getElementById('agent-meta-test')!.classList.remove('agent-meta-collapsed');await flush();
        expect(f.doc.querySelector('#agent-meta-test > [data-resource-panel]')).toBe(panel);
        expect(panel.hidden).toBe(false);expect(trigger.getAttribute('aria-expanded')).toBe('false');
        f.doc.getElementById('agent-meta-test')!.classList.add('agent-meta-collapsed');await flush();
        expect(panel.hidden).toBe(true);expect(f.doc.querySelectorAll('[data-resource-panel]').length).toBe(1);
    }finally{await f.done();}
});

test('network loss preserves last values and null does not become zero',async()=>{
    const f=await fixture();try{
        const value=sample();value.cpu.hyper=null as any;value.memory.hyper=null as any;value.swap.total=0;value.swap.used=0;value.swap.hyper=0;
        f.setValue(value);await f.refresh();
        expect(f.doc.querySelector('[data-resource-metric="cpu"] [data-resource-hyper]')!.textContent).toBe('н/д');
        expect(f.doc.querySelector('[data-resource-metric="swap"] [data-resource-machine]')!.textContent).toBe('не настроен');
        f.setFail();await f.refresh();
        expect(f.doc.querySelector('[data-resource-status]')!.textContent).toContain('последний замер');
        expect(f.doc.querySelector('[data-resource-metric="cpu"] [data-resource-machine]')!.textContent).toBe('38%');
        expect(f.doc.querySelector('[data-resource-panel]')!.hasAttribute('data-resource-stale')).toBe(true);
    }finally{await f.done();}
});

test('polling stops hidden and page removal cleans up an inspector-docked panel',async()=>{
    const f=await fixture();try{
        Object.defineProperty(f.doc,'hidden',{value:true,configurable:true});f.doc.dispatchEvent(new f.w.Event('visibilitychange'));await flush();
        expect(f.timeouts.size).toBe(0);
        f.doc.querySelector('[data-page]')!.remove();await flush();
        expect(f.doc.querySelector('[data-resource-panel]')).toBeNull();expect(f.requests()).toBe(1);
    }finally{await f.done();}
});

test('script installed twice does not duplicate fetches or listeners',async()=>{
    const f=await fixture();try{f.w.eval(source);await flush();expect(f.requests()).toBe(1);expect(f.doc.querySelectorAll('[data-resource-panel]').length).toBe(1);}finally{await f.done();}
});

test('snapshot HTTP route uses no-store and fails without exposing internal errors',async()=>{
    let fail=false;const logs:unknown[]=[];
    const c={fns:{resources:{collectSnapshot:async()=>{if(fail)throw new Error('private path');return sample();}},procs:{log:{warn:(value:unknown)=>logs.push(value)}}}} as unknown as Context;
    const ok=await route(c,null,{req:new Request('https://hyper.test/ui/server-resources')});
    expect(ok.status).toBe(200);expect(ok.headers.get('cache-control')).toBe('no-store');expect((await ok.json() as ReturnType<typeof sample>).cpu.machine).toBe(38);
    fail=true;const bad=await route(c,null,{req:new Request('https://hyper.test/ui/server-resources')});
    expect(bad.status).toBe(503);expect(await bad.text()).not.toContain('private path');expect(logs.length).toBe(1);
});
