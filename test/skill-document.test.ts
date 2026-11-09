import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';

describe('skill documentation has no HTML shell', () => {
    for (const plugin of ['google', 'humanizer']) {
        test(plugin, async () => {
            const route = (await import(resolve(import.meta.dir, `../plugins/${plugin}/src/${plugin}/$route_SKILL.md_GET.ts`))).default;
            const response = await route({}, null, {});
            expect(response).toBeInstanceOf(Response);
            expect(response.headers.get('content-type')).toBe('text/markdown; charset=utf-8');
            expect(response.headers.get('x-content-type-options')).toBe('nosniff');
            expect(await response.text()).toBe(await Bun.file(resolve(import.meta.dir, `../plugins/${plugin}/SKILL.md`)).text());
        });
    }
});
