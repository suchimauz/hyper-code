import { expect, test } from 'bun:test';
import mobile from './$id/mobile/$route__GET';

for (const [name, route] of [['mobile', mobile]] as const) {
    for (const status of [401, 404]) test(`${name} denies before rendering an unauthorized agent (${status})`, async () => {
        const denied = new Response('denied', { status });
        const ctx = { fns: { canvas: { authorizeHttp: async () => denied } } };
        expect(await route(ctx as any, null, { req: new Request(`http://localhost/canvas/a/${name}`), params: { id: 'a' } })).toBe(denied);
    });
}

test('retired mobile Canvas redirects to React without rendering or mutating state', async () => {
    let checked = '';
    const ctx = { fns: { canvas: { authorizeHttp: async ({ agentId }: { agentId: string }) => { checked = agentId; return null; } } } };
    const response = await mobile(ctx as any, null, { req: new Request('http://localhost/canvas/a/mobile?embed=1'), params: { id: 'a&view=evil' } });
    expect(checked).toBe('a&view=evil');
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/?agent=a%26view%3Devil');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.text()).toBe('');
});
