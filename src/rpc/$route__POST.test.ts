import { expect, test } from 'bun:test';
import route from './$route__POST';

test('retired RPC returns 410 without accessing functions or reading payloads', async () => {
    const ctx = new Proxy({}, { get() { throw new Error('No dispatch permitted'); } }) as Context;
    for (const body of [JSON.stringify({ method: 'secureInput.submit', params: { value: 'never-consumed' } }), JSON.stringify({ method: 'demo.hello', params: {} }), 'invalid json']) {
        const req = new Request('http://localhost/rpc', { method: 'POST', body });
        const response = route(ctx, null, { req });
        expect(response.status).toBe(410);
        expect(req.bodyUsed).toBe(false);
        expect(await response.text()).toContain('retired');
    }
});

test('generic popup helpers and browser dispatch scripts are absent', async () => {
    for (const path of ['../ui/popup.ts', '../ui/popupContent.ts', '../ui/$script_popup.js', '../ui/$script_rpc.js', '../ui/inplacePopup.ts', '../agent/toolDetails.ts']) {
        expect(await Bun.file(new URL(path, import.meta.url)).exists(), path).toBe(false);
    }
    for (const path of ['../ui/layout.ts', '../canvas/itemDocument.ts']) {
        const source = await Bun.file(new URL(path, import.meta.url)).text();
        expect(source).not.toContain('/ui/rpc.js');
        expect(source).not.toContain('/ui/popup.js');
        expect(source).toContain('/procs/ui/htmx.js');
        expect(source).toContain('csrf-token');
    }
});
