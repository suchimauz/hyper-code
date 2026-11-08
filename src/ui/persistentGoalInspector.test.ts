import { expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import section from './agentMetaSection';
import sectionHtml from './agentMetaSectionHtml';
const script = await Bun.file(new URL('./$script_meta.js', import.meta.url)).text();
const ctx: any = { fns: { procs: { ui: { escape: ({text}: any) => String(text).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;') } }, ui: {} } };
const render = (enabled = true) => section(ctx, null, {agent: {id:'ab'} as any, section:'persistentGoal', persistentGoalEnabled:enabled});
const snapshot = (revision = 1) => ({version:1, enabled:true, agentId:'ab', goal:{goalId:'g',revision,objective:'Original <safe>',status:'paused',tokenBudget:100,tokensUsed:12,timeUsedSeconds:2},owner:{runToken:null,stoppedAt:4,runState:'idle'},csrfToken:'test'});
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
async function fixture() {
    const w = new Window(); let current = snapshot(); const posts: any[] = []; let reads = 0;
    w.document.body.innerHTML = `<div id="agent-meta-persistentGoal-ab" data-meta-section="persistentGoal">${render()}</div>`;
    (w as any).htmx = {ajax: () => {throw new Error('Goal must not morph');}};
    (w as any).hyperLive = {subscribe: (o: any) => {(w as any).live=o;}};
    (w as any).fetch = async (_url: string, opts: any = {}) => {
        if (opts.method === 'POST') {posts.push(JSON.parse(opts.body)); return {ok:false,status:409,json:async()=>({message:'Conflict'})};}
        reads++; return {ok:true,json:async()=>current};
    };
    w.eval(script); await tick();
    const root = w.document.querySelector('[data-persistent-goal]')!;
    const click = async (action: string) => { (root.querySelector(`[data-goal-action="${action}"]`) as any).click(); await tick(); };
    const type = (value: string) => {const input: any=root.querySelector('textarea');input.value=value;input.dispatchEvent(new w.Event('input',{bubbles:true}));};
    return {w,root,posts,click,type,reads:()=>reads,change:()=>{current=snapshot(2);}};
}
test('disabled renderer is empty and enabled renderer exposes only authorized-load placeholder', async () => {
    expect(render(false)).toBe(''); expect(render()).toContain('Постоянная цель'); expect(render()).not.toContain('Original');
    let reads=0;
    const mock: any={state:{agent:{ab:{id:'ab'}}},fns:{goal:{enabled:async()=>false,read:()=>{reads++;throw Error('schema');}},ui:{agentMetaSection:(o:any)=>section(ctx,null,o)}}};
    expect(await sectionHtml(mock,null,{agentId:'ab',section:'persistentGoal'})).toBe(''); expect(reads).toBe(0);
});
test('live changes preserve objective and original CAS; conflict never silently retries', async () => {
    const f=await fixture(); f.type('My draft'); f.change(); (f.w as any).live.resync(); await tick();
    expect(f.reads()).toBe(1); expect((f.root.querySelector('textarea') as any).value).toBe('My draft');
    await f.click('edit'); expect(f.posts[0]).toMatchObject({action:'edit',objective:'My draft',expectedGoalId:'g',expectedRevision:1,expectedRunToken:null,tokenBudget:100,csrfToken:'test'});
    await f.click('edit'); expect(f.posts.length).toBe(1);
    (f.root.querySelector('[data-goal-refresh]') as any).click(); await tick(); expect(f.reads()).toBe(1);
    await f.click('discard'); expect(f.reads()).toBe(2); expect((f.root.querySelector('textarea') as any).value).toBe('Original <safe>');
    await f.click('edit'); expect(f.posts[1].expectedRevision).toBe(2); await f.w.happyDOM.abort();
});
test('clear requires explicit confirmation and preserves exact CAS; accessible controls are touch sized', async () => {
    const f=await fixture(); await f.click('clear'); expect(f.posts.length).toBe(0);
    expect((f.root.querySelector('[data-goal-clear-confirm]') as any).hidden).toBe(false);
    await f.click('cancel-clear'); expect(f.posts.length).toBe(0);
    await f.click('clear'); await f.click('confirm-clear'); expect(f.posts[0]).toMatchObject({action:'clear',expectedRevision:1});
    expect(f.root.querySelector('[role="status"]')).not.toBeNull();
    for(const button of f.root.querySelectorAll('button')) expect((button as any).style.minHeight).toBe('44px');
    await f.w.happyDOM.abort();
});
test('ambiguous mutation failure blocks retry until explicit refresh', async () => {
    const f=await fixture(); let attempts=0;
    (f.w as any).fetch=async()=>{attempts++;throw Error('Network lost');};
    await f.click('edit'); await f.click('edit'); expect(attempts).toBe(1);
    expect(f.root.textContent).toContain('обновите'); await f.w.happyDOM.abort();
});
test('deferred resume reason survives the fresh authorized GET', async () => {
    const f=await fixture();
    (f.w as any).fetch=async(_url:string,opts:any={})=>({ok:true,json:async()=>opts.method==='POST'?{resume:{scheduled:false,reason:'provider_busy'}}:snapshot(2)});
    await f.click('resume'); expect(f.root.textContent).toContain('provider_busy'); await f.w.happyDOM.abort();
});
