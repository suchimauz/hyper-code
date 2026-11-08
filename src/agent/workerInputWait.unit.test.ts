import { test, expect } from 'bun:test';

// Guards every worker scheduler entrypoint against regressions that bypass the
// PostgreSQL gate after a restart or a newly queued user message.
test('worker claims and sleep deadline exclude open and processing blocking questions', async () => {
    const source = await Bun.file(new URL('./workerLoop.ts', import.meta.url)).text();
    const predicate = "i.spec->>'_agentWait' = 'true' AND i.state IN ('open','processing')";
    expect(source.split(predicate).length - 1).toBe(4);
    expect(source).toContain("AND stopped_at IS NULL AND sleep_context->>'draftRevision' IS NULL");
    expect(source).toContain("WHERE id = ? AND run_token = ?");
});
