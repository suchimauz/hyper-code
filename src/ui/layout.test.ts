import { describe, expect, test } from 'bun:test';
import layout from './layout';
import toResponse from '../procs/http/toResponse';

function fixture() {
    const ctx: any = { state: { procs: { styles: [{ href: '/theme.css' }] } }, fns: {
        procs: { ui: { escape: ({ text }: { text: string }) => Bun.escapeHTML(text) } },
        ui: { faviconUrl: async () => '/favicon.ico' },
        auth: { csrfToken: async () => 'cookie-bound-token' },
    } };
    ctx.state.registry = { ui: { layout } };
    const session: any = { req: new Request('http://localhost/news'), url: new URL('http://localhost/news') };
    return { ctx, session };
}

describe('HTML page documents without the retired application shell', () => {
    test('preserves trusted markup, styles and page-local secure transports', async () => {
        const { ctx, session } = fixture();
        const html = await layout(ctx, session, { main: '<article>Plugin page</article>', title: '<News>', currentId: 'a"b', headExtra: '<meta name="plugin" content="yes">' });
        for (const text of ['<article>Plugin page</article>', '&lt;News&gt;', 'cookie-bound-token', '/theme.css', '/procs/ui/htmx.js', '/procs/events/client.js', '/ui/control.js', 'data-agent-id="a&quot;b"', 'name="plugin"']) expect(html).toContain(text);
        for (const text of ['/ui/rpc.js', '/ui/popup.js', 'id="app-popup"', 'id="dock"', 'nav-overlay', 'mobileInspector.js', 'mobileUsage.js', 'mobileMessage.js', '/agent/chat.js', 'hyperLegacyUrl', 'data-presentation="sidebar"']) expect(html).not.toContain(text);
    });
    test('minimal main has no inherited navigation or page-wide swap targets', async () => {
        const { ctx, session } = fixture();
        const html = await layout(ctx, session, { main: '<p>content</p>', lean: true });
        expect(html).toContain('<section id="page-view"><main id="main" hx-history-elt>');
        expect(html).not.toContain('hx-target=');
        expect(html).not.toContain('id="app-popup"');
        expect(html).toContain('prefers-reduced-motion');
        expect(html).toContain('hyper-theme');
    });
    test('dynamic HTTP hook preserves document status and HTMX fragment semantics', async () => {
        const { ctx, session } = fixture();
        const response = await toResponse(ctx, session, { value: { main: '<p>Unavailable</p>', title: 'Status', status: 403 } });
        expect(response.status).toBe(403);
        expect(response.headers.get('content-type')).toContain('text/html');
        expect(await response.text()).toContain('<!doctype html>');
        session.req = new Request('http://localhost/news', { headers: { 'hx-request': 'true' } });
        const partial = await toResponse(ctx, session, { value: '<p>fragment</p>' });
        expect(await partial.text()).toBe('<p>fragment</p>');
    });
});
