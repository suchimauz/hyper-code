import { expect, test } from 'bun:test';
import route from './$route_items_GET';

test('React application catalogue includes declared pages only, without chats or unsafe destinations', async () => {
    let options: unknown;
    const ctx = { fns: { nav: { items: async (opts: unknown) => {
        options = opts;
        return [{id:'news',label:'News',href:'/news'}, {id:'external',label:'External',href:'https://example.com'}, {id:'network',label:'Network',href:'//example.com'}, {id:'slash',label:'Slash',href:'/\\example.com'}];
    } } } } as unknown as Context;
    const response = await route(ctx, null, {req:new Request('http://localhost/nav/items', {headers:{accept:'application/json'}}),params:{}});
    expect(options).toEqual({includeAgents:false,limit:500});
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({items:[{id:'news',label:'News',href:'/news'}]});
});

test('HTML fragments retain the existing widget transport without becoming the React shell', async () => {
    const ctx = {fns:{nav:{home:async()=>'<p>Widget</p>'}}} as unknown as Context;
    const response = await route(ctx,null,{req:new Request('http://localhost/nav/items'),params:{}});
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(await response.text()).toBe('<p>Widget</p>');
});
