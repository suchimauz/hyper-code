import { expect, test } from 'bun:test';
import page from './$route_GET';
const req = new Request('http://localhost/sshInstance?result=error&message=untrusted');
test('SSH page redirects owners to React without rendering or loading instance secrets', async () => {
    const response = await page({} as Context, { user: { role: 'owner' } } as Session, { req, params: {} });
    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('/?settings=ssh-instances');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.text()).toBe('');
});
test('SSH page retains the owner boundary', async () => {
    for (const session of [null, {} as Session, { user: { role: 'member' } } as Session]) {
        expect((await page({} as Context, session, { req, params: {} })).status).toBe(403);
    }
});
