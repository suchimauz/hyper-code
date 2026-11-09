import { expect, test } from 'bun:test';
import itemRoute from './$route_$id_item_$itemId_POST';
import tabRoute from './$route_$id_POST';
import verifyCsrf from '../auth/verifyCsrf';
import csrfToken from '../auth/csrfToken';

// No database or live mutations: exercise the actual cookie-bound token implementation.
function fixture() {
    const calls: string[] = [];
    const ctx: any = { fns: {
        procs: { auth: { cookieName: () => 'session', verify: async ({token}: any) => token === 'signed-a' || token === 'signed-b' ? { sub: 'owner', exp: Date.now()/1000+60 } : null } },
        auth: {},
        canvas: {
            authorizeHttp: async () => null,
            setState: async ({state}: any) => { calls.push('state'); return {state}; },
            ping: async () => { calls.push('ping'); return true; },
            close: async () => { calls.push('close'); },
            reopen: async () => { calls.push('reopen'); },
            show: async () => { calls.push('show'); },
            navigate: async () => { calls.push('navigate'); },
            update: async () => { calls.push('update'); return {}; },
            revision: async () => ({panel:'rev'}),
        },
    }};
    ctx.fns.auth.csrfToken = (opts: any) => csrfToken(ctx, null, opts);
    ctx.fns.auth.verifyCsrf = (opts: any) => verifyCsrf(ctx, null, opts);
    const request = (body: object, token?: string, cookie = 'signed-a') => new Request('http://localhost/canvas/a', {
        method:'POST', headers: {'content-type':'application/json', cookie:`session=${cookie}`, ...(token === undefined ? {} : {'x-csrf-token':token})}, body:JSON.stringify(body),
    });
    return {ctx,calls,request};
}
for (const [label, route, body] of [
    ['state', itemRoute, {state:{n:1}}], ['ping', itemRoute, {ping:{text:'hello'}}],
    ['tabs', tabRoute, {open:true,activeItemId:7,chatWidth:500}],
    ['close', tabRoute, {closeItemId:7}], ['reopen', tabRoute, {reopenItemId:7}],
    ['url show', tabRoute, {show:{kind:'url',args:{url:'https://example.org'}}}],
    ['url navigate', tabRoute, {navigate:{itemId:7,url:'https://example.org'}}],
] as const) {
    test(`${label}: missing, wrong and other-cookie CSRF reject before mutation; valid token accepted`, async () => {
        const f = fixture();
        const token = await f.ctx.fns.auth.csrfToken({req:f.request({})});
        for (const req of [f.request(body), f.request(body,'wrong'), f.request(body,token,'signed-b')]) {
            expect((await route(f.ctx,null,{req,params:{id:'a',itemId:'7'}})).status).toBe(403);
            expect(f.calls).toEqual([]);
        }
        expect((await route(f.ctx,null,{req:f.request(body,token),params:{id:'a',itemId:'7'}})).status).toBe(200);
        expect(f.calls.length).toBeGreaterThan(0);
    });
}
