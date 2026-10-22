import { test, expect } from 'bun:test';
import start from './startAccountLogin';

test('legacy CLI login rejects unsupported runtime providers before any side effects', async () => {
    for (const provider of ['other', '', 'CODEX']) {
        await expect(start({} as Context, null, { provider: provider as 'codex', account: 'personal' })).rejects.toThrow('Unsupported CLI login provider');
    }
});
