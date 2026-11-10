import { test, expect, mock } from 'bun:test';
import recallSeen from './recallSeen';

test('viewing the chat recalls delivered input and error notifications once', async () => {
  const runs: any[] = [];
  const select = mock(async ({ sql }: any) => sql.includes('FROM inputs') ? [{ id: 'i1' }] : [{ run_token: 'r1' }]);
  const recall = mock(async () => {}), recallError = mock(async () => {});
  const ctx: any = { fns: { procs: { db: { select, run: mock(async (o: any) => { runs.push(o); return { changes: 1 }; }) } }, webPush: { recall, recallError } } };
  expect(await recallSeen(ctx, null, { agentId: 'ab', userId: 'u1', seenAt: 1000 })).toEqual({ inputs: 1, errors: 1 });
  expect(recall).toHaveBeenCalledWith({ inputId: 'i1' });
  expect(recallError).toHaveBeenCalledWith({ agentId: 'ab', runToken: 'r1' });
  // Only the viewer's own deliveries up to the watermark are considered.
  expect(select.mock.calls.every((c: any) => c[0].params[1] === 1000 && c[0].params[2] === 'u1')).toBe(true);
  expect(runs.every(r => r.sql.includes("'recalled'"))).toBe(true);
});

test('no watermark or viewer recalls nothing', async () => {
  const ctx: any = { fns: { procs: { db: { select: mock(async () => { throw new Error('no'); }) } } } };
  expect(await recallSeen(ctx, null, { agentId: 'ab', userId: '', seenAt: 1000 })).toEqual({ inputs: 0, errors: 0 });
});
