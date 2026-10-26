import { describe, expect, test } from 'bun:test';
// Load native renderers into a tiny read-only fixture: no database boot or migrations.
async function fixtureCtx(): Promise<any> {
    const ctx: any = { fns: { agent:{teamActivity:async()=>({})}, procs: { db: {}, ui: {} }, dock: {}, chat: {}, ui: {}, projects: {list: async()=>[]} } };
    for (const [namespace, name, path] of [
        ['dock', 'runningAgents', './runningAgents.ts'],
        ['projects', 'identity', '../projects/identity.ts'],
        ['chat', 'icon', '../chat/icon.ts'],
        ['ui', 'live', '../ui/live.ts'],
        ['procs.ui', 'button', '../procs/ui/button.ts'],
        ['procs.ui', 'attr', '../procs/ui/attr.ts'],
        ['procs.ui', 'escape', '../procs/ui/escape.ts'],
    ]) {
        const fn = (await import(path!)).default;
        const target = namespace!.split('.').reduce((obj: any, key: string) => obj[key], ctx.fns);
        target[name!] = (opts: object) => fn(ctx, null, opts);
    }
    ctx.fns.ui.modelLogo = () => '<span class="model-logo"></span>';
    return ctx;
}

describe('dock.runningAgents', () => {
    test('reads all running nav rows and draws native icons with readable labels', async () => {
        const ctx: any = await fixtureCtx();
        let query = '';
        // Fixtures replace only the database read; no persisted chat is changed.
        ctx.fns.procs.db.select = async ({ sql }: { sql: string }) => {
            query = sql;
            return Array.from({ length: 501 }, (_, i) => ({ id: `fixture-${i}`, title: '<Running & chat>', run_state: 'running', model: 'test', icon: null }));
        };
        const html = await ctx.fns.dock.runningAgents({});
        expect(query).toContain("archived_at IS NULL AND visibility = 'nav'");
        expect(query).toContain('run_state FROM agents');
        expect(query.toLowerCase()).not.toContain('limit');
        expect(html).toContain('id="dock-running-agents"');
        expect(html).toContain('data-live-topic="agents"');
        expect(html).toContain('every 5s');
        expect(html).toContain('hx-target="this"');
        expect(html).toContain('class="dock-running-list"');
        expect(html).not.toContain('overflow-x-auto');
        expect(html).toContain('chat-icon-ring');
        expect(html).toContain('/agent/fixture-500');
        expect(html).not.toContain('<Running & chat>');
        expect(html).toContain('&lt;Running &amp; chat&gt;');
    });

    test('start and stop are reflected by successive read-only region renders', async () => {
        const ctx: any = await fixtureCtx();
        let running = false;
        ctx.fns.procs.db.select = async () => running ? [{ id: 'fixture', title: 'Fixture', icon: null, run_state: 'running', model: 'test' }] : [];
        expect(await ctx.fns.dock.runningAgents({})).toContain('Нет работающих чатов');
        running = true;
        const active = await ctx.fns.dock.runningAgents({});
        expect(active).toContain('/agent/fixture');
        expect(active).not.toContain('Нет работающих чатов');
        running = false;
        const idle = await ctx.fns.dock.runningAgents({});
        expect(idle).toContain('Нет работающих чатов');
        expect(idle).not.toContain('/agent/fixture');
    });
});

test('shows actual own state separately from active descendants, and visible escaped title', async()=>{
 const ctx=await fixtureCtx();
 ctx.fns.agent.teamActivity=async()=>({parent:2});
 ctx.fns.procs.db.select=async()=>[
  {id:'parent',title:'Parent <chat>',run_state:'idle',model:null,icon:null},
  {id:'queued',title:'Queued',run_state:'queued',model:null,icon:null},
  {id:'idle',title:'Idle',run_state:'idle',model:null,icon:null},
 ];
 const html=await ctx.fns.dock.runningAgents({});
 expect(html).toContain('class="dock-running-title">Parent &lt;chat&gt;</span>');
 expect(html).toContain('class="dock-running-status">Ожидает · Подагенты: 2</span>');
 expect(html).toContain('class="dock-running-status">В очереди</span>');
 expect(html).not.toContain('/agent/idle');
 expect(html).toContain('hx-target="#main"');
});

test('names exact projects and remote hosts with escaped accessible labels', async()=>{
 const ctx=await fixtureCtx();
 const local=await ctx.fns.projects.identity({dir:'/work/app'});
 const remote=await ctx.fns.projects.identity({dir:'/work/app',host:'server'});
 ctx.fns.projects.list=async()=>[{...local,title:'Local <app>'},{...remote,title:'Remote & app'}];
 ctx.fns.procs.db.select=async()=>[
  {id:'local',title:'Chat',run_state:'running',workspace_dir:'/work/app/'},
  {id:'remote',title:'Chat',run_state:'running',workspace_dir:'/work/app',workspace_host:'server'},
  {id:'discovered',title:'Other',run_state:'running',workspace_dir:'/work/fresh'},
  {id:'none',title:'No workspace',run_state:'running',workspace_dir:'relative'},
 ];
 const html=await ctx.fns.dock.runningAgents({});
 expect(html).toContain('class="dock-running-project">Local &lt;app&gt;</span>');
 expect(html).toContain('class="dock-running-project">Remote &amp; app · server</span>');
 expect(html).toContain('class="dock-running-project">fresh</span>');
 expect(html).toContain('class="dock-running-project">Без проекта</span>');
 expect(html).toContain('aria-label="Chat — Remote &amp; app · server (/work/app) — Работает"');
 expect(html).toContain('title="Chat — Local &lt;app&gt; (/work/app) — Работает"');
});
