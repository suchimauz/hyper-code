import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import saveUploads from './saveUploads';
import mobileMessage from '../api/$route_mobile_v1_agents_$id_messages_POST';

const MB = 1024 * 1024;
function file(size: number) {
    const f = new File(['x'], 'probe.txt');
    Object.defineProperty(f, 'size', { value: size });
    // Proves size validation completed without allocating tens of MB per test.
    f.arrayBuffer = async () => { throw new Error('validated: read started'); };
    return f;
}
for (const [label, sizes, expected] of [
    ['40 MB inclusive', [40 * MB], 'validated: read started'],
    ['80 MB inclusive', [40 * MB, 40 * MB], 'validated: read started'],
    ['10 files inclusive', Array(10).fill(8 * MB), 'validated: read started'],
    ['single file above 40 MB', [40 * MB + 1], 'at most 40 MB'],
    ['total above 80 MB', [40 * MB, 40 * MB, 1], 'exceed 80 MB'],
    ['11 files', Array(11).fill(1), 'maximum 10 files'],
] as [string, number[], string][]) {
    test(`shared upload validation: ${label}`, async () => {
        const root = await mkdtemp(join(tmpdir(), 'upload-limits-'));
        try {
            await expect(saveUploads({ state: { root } } as any, null, { agentId: 'test', files: sizes.map(file) })).rejects.toThrow(expected);
        } finally { await rm(root, { recursive: true, force: true }); }
    });
}
for (const [sizes, expected] of [
    [[40 * MB + 1], 'file_too_large'],
    [[40 * MB, 40 * MB, 1], 'attachments_too_large'],
    [Array(11).fill(1), 'too_many_files'],
] as [number[], string][]) {
    test(`mobile ingress rejects ${expected} before storage`, async () => {
        const req = new Request('http://localhost/api/mobile/v1/agents/test/messages', { method: 'POST', headers: { 'content-type': 'multipart/form-data' } });
        req.formData = async () => ({ get: () => null, getAll: () => sizes.map(file) }) as any;
        const ctx: any = { state: { agent: { test: { id: 'test' } } } };
        const response = await mobileMessage(ctx, null, { req, params: { id: 'test' } });
        expect(response.status).toBe(413);
        expect((await response.json() as { error: string }).error).toBe(expected);
    });
}
