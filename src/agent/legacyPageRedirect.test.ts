import { expect, test } from 'bun:test';
import route from './$route_$id_GET';

test('agent page links redirect to React without rendering the retired chat shell', () => {
    const result = route({} as Context, null, { req: new Request('http://localhost/agent/ab'), params: { id: 'ab' } });
    expect(result.status).toBe(303);
    expect(result.headers.get('location')).toBe('/?agent=ab');
});
test('invalid agent links cannot become redirect destinations', () => {
    for (const id of ['', '//evil.example', '../x', 'a\nlocation:evil']) {
        expect(route({} as Context, null, { req: new Request('http://localhost/agent/ab'), params: { id } }).status).toBe(404);
    }
});
