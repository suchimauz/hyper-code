import { expect, test } from 'bun:test';
import { runInNewContext } from 'node:vm';

test('secure input resync skips missing popup targets and resumes when mounted', async () => {
    const source = await Bun.file(new URL('./$script_rpc.js', import.meta.url)).text();
    const listeners = new Map<string, Function>();
    const calls: any[] = [];
    const host = { dataset: { pending: '1' }, tagName: 'BUTTON', getAttribute: (key: string) => key === 'hx-popup' ? 'secureInput.current' : null };
    let target: { isConnected: boolean } | null = null;
    const htmx = { ajax: (...args: any[]) => { calls.push(args); return Promise.resolve(); } };
    const document = {
        body: { addEventListener: (name: string, fn: Function) => listeners.set(name, fn) },
        addEventListener: () => {}, querySelector: () => null,
        getElementById: (id: string) => id === 'secure-input-host' ? host : id === 'app-popup-body' ? target : null,
    };
    runInNewContext(source, { window: { htmx }, htmx, document });
    expect(calls).toHaveLength(0); // Boot with pending prompt but no shell.
    listeners.get('secure-input-refresh')!();
    expect(calls).toHaveLength(0);
    target = { isConnected: false };
    listeners.get('secure-input-refresh')!();
    expect(calls).toHaveLength(0);
    target = { isConnected: true };
    listeners.get('secure-input-refresh')!();
    expect(calls).toHaveLength(1);
    expect(calls[0][2].target).toBe(target);
    expect(calls[0][2].values.method).toBe('secureInput.current');
});
