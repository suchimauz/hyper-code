import { describe, expect, test } from "bun:test";
import route from "./$route_v1_agents_$id_events_GET";

describe("GET /api/v1/agents/:id/events", () => {
    test('projects actual batch choice event identities but never private forms or input HTML', async () => {
        const events = [
            { idx: 1096, messageIdx: 1026, ts: 1794102189919, type: 'input', inputId: 'inb5151a163e137ade', kind: 'choice', title: 'Question one', html: '<form>never expose</form>' },
            { idx: 1097, messageIdx: 1026, ts: 1794102189920, type: 'input', inputId: 'inbc7a809ea1b342b6', kind: 'choice', html: '<form>never expose</form>' },
            { idx: 1098, messageIdx: 1026, ts: 1794102189921, type: 'input', inputId: 'inconfirm', kind: 'confirm', html: '<form>never expose</form>' },
            { idx: 1099, messageIdx: 1026, ts: 1794102189922, type: 'input', inputId: 'ingrid', kind: 'grid', html: '<form>never expose</form>' },
            ...['secret', 'tbank-login', 'redmine-approval'].map((kind, i) => ({ idx: 1100 + i, ts: 1, type: 'input', inputId: 'private', kind, html: 'private form' })),
        ];
        const ctx: any = { state: {}, fns: { auth: { author: async () => null }, mentions: { parse: async () => [] }, procs: { db: { select: async ({ sql }: any) => sql.includes('SELECT 1') ? [{ exists: 1 }] : [{ run_state: 'idle', next_run_at: null }] } }, session: { getEvents: async () => events, getMaxEventIdx: async () => 1100 } } };
        const response = await route(ctx, null, { req: new Request('http://local/api/v1/agents/ebo/events'), params: { id: 'ebo' } });
        const body: any = await response.json();
        expect(body.events).toHaveLength(4);
        expect(body.events.map(({ inputId, kind, type, html, text, messageIdx }: any) => ({ inputId, kind, type, html, text, messageIdx }))).toEqual(events.slice(0, 4).map(event => ({ inputId: event.inputId, kind: event.kind, type: 'input', html: null, text: null, messageIdx: 1026 })));
        expect(JSON.stringify(body)).not.toContain('never expose');
        expect(JSON.stringify(body)).not.toContain('private');
    });
    test("returns lifecycle and mobile fields and initially requests the newest page", async () => {
        let eventOpts: any;
        const ctx: any = { state: { agent: { ab: { scratchpad: { mobileStream: { text: "live", revision: 3, startedAt: 9 } } } } }, fns: {
            auth: { author: async () => null },
            mentions: { parse: async ({ text }: any) => text.includes("@anna") ? ["anna"] : [] },
            procs: { db: { select: async ({ sql }: any) => sql.includes("SELECT 1") ? [{ exists: 1 }] : [{ mascot: "deepy", run_state: "running", next_run_at: null, last_error: null }] } },
            session: {
                getEvents: async (opts: any) => { eventOpts = opts; return [{ idx: 1, ts: 10, type: "wake_up", reason: "x" }, { idx: 2, ts: 11, type: "assistant", text: "hello @anna", usage: { tokens: 1 } }]; },
                getMaxEventIdx: async () => 2,
            },
        } };
        const response = await route(ctx, null, { req: new Request("http://localhost/api/v1/agents/ab/events?limit=10"), params: { id: "ab" } });
        expect(eventOpts).toMatchObject({ id: "ab", beforeIdx: 3, limit: 10 });
        expect(await response.json()).toMatchObject({ version: 1, agentId: "ab", mascot: "deepy", nextAfter: 3, isRunning: true, partial: { text: "live", revision: 3, startedAt: 9 }, events: [{ idx: 1, type: "wake_up", lifecycle: { reason: "x" } }, { idx: 2, type: "assistant", text: "hello @anna", mentions: ["anna"] }] });
    });

    test("includes resolved authors for multiuser messages", async () => {
        const ctx: any = { state: {}, fns: {
            auth: { author: async ({ userId }: any) => ({ id: userId, name: "Alice", initials: "A", hue: 42, picture: "https://example.com/alice.jpg" }) },
            mentions: { parse: async () => [] },
            procs: { db: { select: async ({ sql }: any) => sql.includes("SELECT 1") ? [{ exists: 1 }] : [{ run_state: "idle", next_run_at: null, last_error: null }] } },
            session: {
                getEvents: async () => [{ idx: 1, ts: 10, type: "user", text: "hello", actor: "u1" }],
                getMaxEventIdx: async () => 1,
            },
        } };
        const response = await route(ctx, null, { req: new Request("http://localhost/api/v1/agents/ab/events"), params: { id: "ab" } });
        expect(await response.json()).toMatchObject({ events: [{ type: "user", author: { id: "u1", name: "Alice", initials: "A", hue: 42 } }] });
    });

    test('preserves durable planning command and proposal notices', async () => {
        const notices = [{idx:0,ts:1,type:'planning_mode',text:'Planning mode enabled'}, {idx:1,ts:2,type:'planning_proposal',text:'Plan ready for review'}, {idx:2,ts:3,type:'command_invocation',text:'/compact focus',commandName:'compact',commandText:'/compact focus',argsText:'focus',requestId:'key',operationId:'op',status:'running'}, {idx:3,ts:4,type:'command_result',text:'Context compaction: not_needed',commandName:'compact',requestId:'key',operationId:'op',status:'completed',result:{status:'not_needed'}}];
        const ctx:any={state:{},fns:{auth:{author:async()=>null},mentions:{parse:async()=>[]},procs:{db:{select:async({sql}:any)=>sql.includes('SELECT 1')?[{exists:1}]:[{run_state:'idle',next_run_at:null}]}},session:{getEvents:async()=>notices,getMaxEventIdx:async()=>1}}};
        const response=await route(ctx,null,{req:new Request('http://local/api/v1/agents/a/events'),params:{id:'a'}});
        const body:any=await response.json();
        expect(body.events.map(({type,text}:any)=>({type,text}))).toEqual(notices.map(({type,text})=>({type,text})));
        expect(body.events[2]).toMatchObject({commandName:'compact',argsText:'focus',operationId:'op',requestId:'key',status:'running',messageIdx:null});
        expect(body.events[3]).toMatchObject({status:'completed',result:{status:'not_needed'},messageIdx:null});
    });

    test('projects retry metadata and resolves lifecycle markers across pagination without exposing marker rows', async () => {
        const retry = (idx: number, retryId: string, attempt: number, maxRetries: number | null) => ({
            idx, ts: idx * 10, type: 'llm_retry', retryId, retry: attempt, maxRetries,
            mode: maxRetries === null ? 'always' : 'bounded', delayMs: 2500, provider: 'openai',
            failure: { code: 'rate_limit', message: 'Please retry', status: 429, privateDetail: 'hidden' },
        });
        const markers = [
            { type: 'llm_retry_started', retryId: 'started', retry: 2 },
            { type: 'llm_retry_started', retryId: 'cancelled', retry: 3 },
            { type: 'llm_retry_cancelled', retryId: 'cancelled', retry: 3 },
            { type: 'llm_retry_cancelled', retryId: 'scheduled', retry: 99 },
        ];
        let query: any;
        const events = [retry(1, 'scheduled', 1, null), retry(2, 'started', 2, 5), retry(3, 'cancelled', 3, 5),
            { idx: 4, ts: 40, ...markers[0] }, { idx: 5, ts: 50, ...markers[2] }];
        const ctx: any = { state: {}, fns: {
            auth: { author: async () => null }, mentions: { parse: async () => [] },
            procs: { db: { select: async (opts: any) => {
                if (opts.sql.includes('SELECT payload FROM events')) {
                    query = opts;
                    return markers.map((payload, idx) => ({ payload: idx % 2 ? payload : JSON.stringify(payload) }));
                }
                return opts.sql.includes('SELECT 1') ? [{ exists: 1 }] : [{ run_state: 'idle', next_run_at: null }];
            } } }, session: { getEvents: async () => events, getMaxEventIdx: async () => 100 },
        } };
        const response = await route(ctx, null, { req: new Request('http://local/api/v1/agents/ab/events?before=6'), params: { id: 'ab' } });
        const body: any = await response.json();
        expect(body.events).toHaveLength(3);
        expect(body.events.map((event: any) => event.retryState)).toEqual(['scheduled', 'started', 'cancelled']);
        expect(body.events[0]).toMatchObject({ retryId: 'scheduled', retry: 1, maxRetries: null, retryMode: 'always', delayMs: 2500,
            failureCode: 'rate_limit', failureMessage: 'Please retry', failureStatus: 429, provider: 'openai' });
        expect(body.events[1]).toMatchObject({ maxRetries: 5, retryMode: 'bounded' });
        expect(query.params).toEqual(['ab', 'scheduled', 'started', 'cancelled']);
        expect(query.sql).not.toContain('idx <');
        expect(JSON.stringify(body.events)).not.toContain('privateDetail');
        expect(JSON.stringify(body.events)).not.toContain('llm_retry_started');
    });

    test('keeps absent retry failure status nullable and hides marker-only pages', async () => {
        let events: any[] = [{ idx: 1, ts: 1, type: 'llm_retry', retryId: 'one', retry: 1, mode: 'always', maxRetries: null,
            failure: { code: 'network', message: 'Unavailable' } }];
        const ctx: any = { state: {}, fns: { auth: { author: async () => null }, mentions: { parse: async () => [] },
            procs: { db: { select: async ({ sql }: any) => sql.includes('SELECT payload') ? [] : sql.includes('SELECT 1') ? [{ exists: 1 }] : [{ run_state: 'idle' }] } },
            session: { getEvents: async () => events, getMaxEventIdx: async () => 2 } } };
        const opts = { req: new Request('http://local/api/v1/agents/ab/events?after=1'), params: { id: 'ab' } };
        const scheduledBody: any = await (await route(ctx, null, opts)).json();
        expect(scheduledBody.events[0]).toMatchObject({ failureStatus: null, retryState: 'scheduled' });
        events = [{ idx: 2, ts: 2, type: 'llm_retry_cancelled', retryId: 'one', retry: 1 }];
        expect(await (await route(ctx, null, opts)).json()).toMatchObject({ events: [], nextAfter: 3 });
    });

});

test('lifecycle projection allowlists display fields without leaking arbitrary payload or input state', async () => {
    const events = [
        {idx:0,ts:1,type:'parked',provider:'p',account:'a',message:'limit',resetsAt:123,token:'secret'},
        {idx:1,ts:1,type:'team_update',event:'plan.completed',memberId:'b',summary:'done',private:'secret'},
        {idx:2,ts:1,type:'attachment_event',source:'telegram',payload:{text:'message',senderName:'Person',token:'secret'}},
        {idx:3,ts:1,type:'wake_up',watchId:'w',watchStatus:'ready',resultRef:{id:'stored',private:'secret'},result:{ok:true}},
        {idx:4,ts:1,type:'input',inputId:'private',kind:'secret',prompt:'secret',html:'secret'},
        {idx:5,ts:1,type:'assistant',html:'<p>saved respondHtml</p>'},
        {idx:6,ts:1,type:'assistant',html:'<p>explicit</p>',htmlSource:'assistant-answer'},
        {idx:7,ts:1,type:'user',html:'<p>untrusted</p>',htmlSource:'assistant-answer'},
        {idx:8,ts:1,type:'tool_result',html:'<p>untrusted</p>',htmlSource:'assistant-answer'},
    ];
    const ctx:any={state:{},fns:{auth:{author:async()=>null},mentions:{parse:async()=>[]},procs:{db:{select:async({sql}:any)=>sql.includes('SELECT 1')?[{exists:1}]:[{run_state:'idle',next_run_at:null}]}},session:{getEvents:async()=>events,getMaxEventIdx:async()=>5}}};
    const response=await route(ctx,null,{req:new Request('http://local/api/v1/agents/a/events'),params:{id:'a'}});
    const body:any=await response.json();
    expect(body.events[0].lifecycle).toEqual({provider:'p',account:'a',message:'limit',resetsAt:123});
    expect(body.events[1].lifecycle).toEqual({event:'plan.completed',memberId:'b',summary:'done'});
    expect(body.events[2].lifecycle).toEqual({source:'telegram',text:'message',senderName:'Person'});
    expect(body.events[3].lifecycle).toEqual({watchId:'w',watchStatus:'ready',resultId:'stored',dataPreview:'{"ok":true}'});
    expect(body.events.some((event:any) => event.type === 'input')).toBe(false);
    expect(body.events[4].html).toBe('<p>saved respondHtml</p>');
    expect(events[5].html).toBe('<p>saved respondHtml</p>');
    expect(body.events[4].htmlSource).toBeNull();
    expect(body.events[5].htmlSource).toBe('assistant-answer');
    expect(body.events[6].htmlSource).toBeNull();
    expect(body.events[7].htmlSource).toBeNull();
});
