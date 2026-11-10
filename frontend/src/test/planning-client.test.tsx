import { afterEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConnectedPlanningPanel } from '../components/hyper/ConnectedPlanningPanel';
import { MessageInput } from '../components/hyper/MessageInput';
import { getPlanning, reviewPlan, type PlanningState } from '../lib/planning';
const state: PlanningState = { version: 1, agentId: 'a', mode: 'plan', revision: 7, scope: 'session', advisory: true, runningPolicy: 'reject', csrfToken: 'token', proposal: { id: 'p1', inputId: 'i1', plan: '# Проверить проект\n\nИзучить файлы.', status: 'pending', createdAt: 1 } };
const json = (body: object, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
afterEach(() => vi.unstubAllGlobals());
it('sends exact revision, proposal id and CSRF for review', async () => {
  const fetcher = vi.fn(async () => json({ ok: true })); vi.stubGlobal('fetch', fetcher);
  await reviewPlan('a/b', state, 'approve');
  expect(fetcher.mock.calls[0]).toEqual(['/agent/a%2Fb/planning/review', expect.objectContaining({ method: 'POST', body: JSON.stringify({ proposalId: 'p1', decision: 'approve', expectedRevision: 7 }), headers: expect.objectContaining({ 'X-CSRF-Token': 'token' }) })]);
});
it('fails visibly for malformed state instead of inventing execute mode', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => json({}))); await expect(getPlanning('a')).rejects.toThrow('получить режим');
});
it('restores pending review from server and does not approve from ordinary refresh', async () => {
  const fetcher = vi.fn(async (_url: string, _init?: RequestInit) => json(state)); vi.stubGlobal('fetch', fetcher);
  render(<ConnectedPlanningPanel agentId="a" running={false} readOnly={false} onAccepted={vi.fn()} />);
  expect(await screen.findByRole('heading', { name: 'Проверить проект' })).toBeVisible();
  expect(fetcher.mock.calls).toHaveLength(1); expect(fetcher.mock.calls[0][1]).not.toHaveProperty('method', 'POST');
  fireEvent(window, new CustomEvent('hyper-planning-changed', { detail: 'other' })); expect(fetcher.mock.calls).toHaveLength(1);
  fireEvent(window, new CustomEvent('hyper-planning-changed', { detail: 'a' })); await waitFor(() => expect(fetcher.mock.calls).toHaveLength(2));
});
it('approves once and refreshes authoritative mode', async () => {
  let approved = false;
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') { approved = true; return json({ ok: true, scheduled: true }); }
    return json(approved ? { ...state, mode: 'execute', proposal: { ...state.proposal, status: 'approved' } } : state);
  }); vi.stubGlobal('fetch', fetcher); const accepted = vi.fn();
  render(<ConnectedPlanningPanel agentId="a" running={false} readOnly={false} onAccepted={accepted} />);
  await userEvent.click(await screen.findByRole('button', { name: 'Начать реализацию' }));
  await waitFor(() => expect(accepted).toHaveBeenCalledOnce()); expect(screen.queryByText('Plan mode')).toBeNull();
  expect(fetcher.mock.calls.filter(call => call[1]?.method === 'POST')).toHaveLength(1);
});
it('does not clear a failed decision with a successful background refresh', async () => {
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => init?.method === 'POST' ? json({ error: 'stale_revision' }, 409) : json(state)));
  render(<ConnectedPlanningPanel agentId="a" running={false} readOnly={false} onAccepted={vi.fn()} />);
  await userEvent.click(await screen.findByRole('button', { name: 'Начать реализацию' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('stale_revision');
  fireEvent(window, new CustomEvent('hyper-planning-changed', { detail: 'a' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Начать реализацию' })).toBeEnabled()); expect(screen.getByRole('alert')).toHaveTextContent('stale_revision');
});
it('ignores a delayed state response from the previous session', async () => {
  let resolveOld!: (response: Response) => void;
  const old = new Promise<Response>(resolve => { resolveOld = resolve; });
  vi.stubGlobal('fetch', vi.fn((url: string) => url.includes('/old/') ? old : Promise.resolve(json({ ...state, agentId: 'new', mode: 'execute', proposal: null }))));
  const view = render(<ConnectedPlanningPanel key="old" agentId="old" running={false} readOnly={false} onAccepted={vi.fn()} />);
  view.rerender(<ConnectedPlanningPanel key="new" agentId="new" running={false} readOnly={false} onAccepted={vi.fn()} />);
  resolveOld(json(state));
  await waitFor(() => expect(screen.queryByText('Plan mode')).toBeNull());
  expect(screen.queryByRole('button', { name: 'Начать реализацию' })).toBeNull();
});
it('uses a successful decision response when the follow-up GET fails', async () => {
  let changed = false;
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === 'POST') { changed = true; return json({ ok: true, planning: { ...state, mode: 'execute', proposal: { ...state.proposal, status: 'approved' } }, scheduled: true }); }
    if (changed) throw new Error('network offline');
    return json(state);
  }));
  const accepted = vi.fn(); render(<ConnectedPlanningPanel agentId="a" running={false} readOnly={false} onAccepted={accepted} />);
  await userEvent.click(await screen.findByRole('button', { name: 'Начать реализацию' }));
  await waitFor(() => expect(accepted).toHaveBeenCalledOnce());
  expect(screen.queryByRole('button', { name: 'Начать реализацию' })).toBeNull();
  expect(await screen.findByRole('alert')).toHaveTextContent('network offline');
});

it.each(['approve', 'keep'] as const)('locks composer during review and unlocks after %s without losing draft', async decision => {
  let resolved = false;
  const current = () => resolved ? { ...state, mode: decision === 'approve' ? 'execute' : 'plan', proposal: { ...state.proposal!, status: decision === 'approve' ? 'approved' : 'kept' } } : state;
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === 'POST') { resolved = true; return json({ ok: true, planning: current() }); }
    return json(current());
  }));
  render(<ConnectedPlanningPanel agentId="a" running={false} readOnly={false} onAccepted={vi.fn()}>{(_badge, pending, focusRequest) => <MessageInput commandsEnabled focusRequest={focusRequest} disabled={pending} value="Сохранённый черновик" onChange={vi.fn()} onSend={vi.fn()} />}</ConnectedPlanningPanel>);
  const draft = screen.getByRole('textbox', { name: 'Сообщение агенту' });
  await waitFor(() => expect(draft).toHaveAttribute('contenteditable', 'false'));
  await userEvent.click(screen.getByRole('button', { name: decision === 'approve' ? 'Начать реализацию' : 'Уточнить план' }));
  await waitFor(() => expect(draft).toHaveAttribute('contenteditable', 'true'));
  expect(draft).toHaveTextContent('Сохранённый черновик');
  if (decision === 'keep') await waitFor(() => expect(draft).toHaveFocus());
  else expect(draft).not.toHaveFocus();
});
