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

for (const state of ['idle', 'running', 'error']) {
    test(`team activity is visible without changing parent controls: ${state}`, async () => {
        const ctx: any = { fns: {
            agent: { teamActivity: async () => ({ parent: 2 }) },
            procs: {
                db: { select: async ({ sql }: any) => sql.includes('FROM agents')
                    ? [{ run_state: state === 'running' ? 'running' : 'idle', next_run_at: null, last_error: state === 'error' ? 'failure' : null, scratchpad: '{}' }]
                    : [] },
                ui: { escape: ({ text }: any) => String(text), button: () => '<button data-stop></button>' },
            },
            ui: { live: (opts: any) => { expect(opts.every).toBe(5); return opts.html; } },
        } };
        const html = await renderStatusBar(ctx, null, { agentId: 'parent', initialUsage: {} });
        expect(html).toContain('data-team-running="2"');
        expect(html).toContain('aria-label="Работают сабагенты: 2"');
        expect(html).toContain('ph-users-three');
        expect(html).toContain('chat-run-ring--live');
        expect(html).toContain('font-family="ui-sans-serif,system-ui">2</text>');
        expect(html).not.toContain('absolute inset-0');
        expect(html).not.toContain('<span>Работают сабагенты');
        if (state === 'error') expect(html).toContain('error: failure');
        if (state === 'running') expect(html).toContain('data-agent-running');
        const controls = await renderStatusBar(ctx, null, { agentId: 'parent', part: 'stop', initialUsage: {} });
        expect(controls.includes('data-stop')).toBe(state === 'running');
    });
}
test('finished descendants leave no stale team activity badge', async () => {
    const ctx: any = { fns: {
        agent: { teamActivity: async () => ({}) },
        procs: { db: { select: async () => [{ run_state: 'idle', scratchpad: '{}' }] }, ui: { escape: ({ text }: any) => String(text) } },
        ui: { live: ({ html }: any) => html },
    } };
    expect(await renderStatusBar(ctx, null, { agentId: 'parent', initialUsage: {} })).not.toContain('data-team-running');
});
