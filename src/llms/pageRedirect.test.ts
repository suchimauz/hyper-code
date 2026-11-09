import { expect, test } from 'bun:test';
import route from './$route__GET';
test('LLM page redirects to native settings without provider probes or HTML rendering', async () => {
    const response = await route({} as Context, null, { req: new Request('http://localhost/llms?provider=untrusted'), params: {} });
    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('/?settings=llm-connections');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.text()).toBe('');
});
