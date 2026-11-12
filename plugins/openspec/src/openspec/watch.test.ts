import { test, expect, spyOn } from 'bun:test';
import * as fs from 'node:fs';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const watch = (await import('./watch.ts')).default;
const snapshot = (await import('./snapshot.ts')).default;
async function setup(initialized = true) {
    const base = resolve(import.meta.dir, '../../../../.mauzcode/tmp/dx');
    await mkdir(base, { recursive: true });
    const dir = await mkdtemp(join(base, 'watch-'));
    const os = join(dir, '.mauzcode/openspec');
    if (initialized) await mkdir(join(os, 'changes/test'), { recursive: true });
    const events: object[] = [];
    const ctx: any = { state: {}, fns: { procs: { events: { emit: ({ event }: any) => events.push(event) } } } };
    const close = async () => { for (const e of ctx.state.openspecWatchers?.values() ?? []) e.close(); await rm(dir, { recursive: true, force: true }); };
    return { dir, os, ctx, events, close };
}

test('watch debounces tasks writes and shares snapshot opaque key without any path', async () => {
    const f = await setup();
    try {
        const result = await watch(f.ctx, null, { dir: f.dir });
        expect(result.key).toBe((await snapshot(f.ctx, null, { dir: f.dir })).key);
        expect(await watch(f.ctx, null, { dir: f.dir + '/.' })).toEqual(result);
        expect(f.ctx.state.openspecWatchers.size).toBe(1);
        const file = join(f.os, 'changes/test/tasks.md');
        await writeFile(file, '- [ ] task');
        await Bun.sleep(80);
        await writeFile(file, '- [x] task');
        await Bun.sleep(180);
        expect(f.events).toEqual([]);
        await Bun.sleep(500);
        expect(f.events).toEqual([{ type: 'openspec.changed', key: result.key }]);
        expect(JSON.stringify(f.events)).not.toContain(f.dir);
    } finally { await f.close(); }
});

test('watch notices initialization from workspace parent and follows new root', async () => {
    const f = await setup(false);
    try {
        await watch(f.ctx, null, { dir: f.dir });
        await mkdir(join(f.os, 'changes/test'), { recursive: true });
        await Bun.sleep(700);
        expect(f.events.length).toBe(1);
        f.events.length = 0;
        await writeFile(join(f.os, 'changes/test/tasks.md'), '- [x] task');
        await Bun.sleep(700);
        expect(f.events.length).toBe(1);
    } finally { await f.close(); }
});

test('watch falls back to metadata polling when recursive watch fails', async () => {
    const f = await setup();
    const native = spyOn(fs, 'watch').mockImplementation(() => { throw new Error('unsupported'); });
    try {
        const { key } = await watch(f.ctx, null, { dir: f.dir });
        native.mockRestore();
        await writeFile(join(f.os, 'changes/test/tasks.md'), '- [x] fallback');
        await Bun.sleep(2600);
        expect(f.events).toEqual([{ type: 'openspec.changed', key }]);
    } finally { native.mockRestore(); await f.close(); }
});

test('watch expires after ten idle minutes and touching renews the timer', async () => {
    const f = await setup();
    const original = globalThis.setTimeout;
    const idle: Array<{ callback: () => void; timer: ReturnType<typeof setTimeout> }> = [];
    const timerSpy = spyOn(globalThis, 'setTimeout').mockImplementation(((fn: () => void, delay: number) => {
        const timer = original(fn, delay);
        if (delay === 600000) idle.push({ callback: fn, timer });
        return timer;
    }) as typeof setTimeout);
    try {
        await watch(f.ctx, null, { dir: f.dir });
        await watch(f.ctx, null, { dir: f.dir });
        expect(idle.length).toBe(2);
        expect(idle[0].timer.hasRef()).toBe(false);
        idle[1].callback();
        expect(f.ctx.state.openspecWatchers.size).toBe(0);
        await writeFile(join(f.os, 'changes/test/tasks.md'), 'after close');
        await Bun.sleep(500);
        expect(f.events).toEqual([]);
    } finally { timerSpy.mockRestore(); for (const t of idle) clearTimeout(t.timer); await f.close(); }
});

test('watch rejects nonabsolute and NUL-containing directory arguments', async () => {
    const f = await setup();
    try {
        for (const dir of ['relative', '/tmp/invalid\0path']) await expect(watch(f.ctx, null, { dir })).rejects.toThrow(/absolute workspace/);
    } finally { await f.close(); }
});
