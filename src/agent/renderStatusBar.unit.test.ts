import { expect, test } from 'bun:test';
import renderStatusBar from './renderStatusBar';

for (const state of ['running', 'queued', 'idle']) {
    test(`composer stop uses theme-aware danger tone and current-color icon: ${state}`, async () => {
        let button: any;
        const ctx: any = { fns: { procs: {
            db: { select: async ({ sql }: any) => sql.includes('FROM agents')
                ? [{ run_state: state === 'running' ? 'running' : 'idle', next_run_at: state === 'queued' ? Date.now() : null, scratchpad: '{}' }]
                : [] },
            ui: { escape: ({ text }: any) => String(text), button: (opts: any) => { button = opts; return '<button data-stop>' + opts.html + '</button>'; } },
        } } };
        const html = await renderStatusBar(ctx, null, { agentId: 'ab', part: 'stop', initialUsage: {} });
        expect(html).toContain('data-composer-send');
        if (state === 'idle') { expect(button).toBeUndefined(); return; }
        expect(button.tone).toBe('danger');
        expect(button.html).toContain('bg-current');
        expect(button.html).not.toContain('bg-base-100');
        expect(button.ariaLabel).toBe('Stop generation');
        expect(button.post).toBe('/agent/ab/stop');
        expect(button.swap).toBe('none');
    });
}
