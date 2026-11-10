import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ConfirmCard } from '../components/mauzcode/ConfirmCard';
import { ConnectedQuestionCard } from '../components/mauzcode/ConnectedQuestionCard';
import { clearConfirmComment, type ConfirmInput } from '../lib/confirms';
import type { ChoiceInput } from '../lib/questions';
const confirm: ConfirmInput = { id: 'c', agentId: 'a', kind: 'confirm', title: 'Тестовый вопрос 2', message: 'Форма отображается нормально?', state: 'open', spec: { details: '', confirmLabel: 'Да', declineLabel: 'Нет', danger: false } };
afterEach(() => { cleanup(); clearConfirmComment('a', 'c'); vi.restoreAllMocks(); });
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

it('renders native labels and sends explicit decisions with trimmed comment', () => {
  const submit = vi.fn(); render(<ConfirmCard input={confirm} onSubmit={submit} />);
  expect(screen.getByText('Форма отображается нормально?')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Нет' })); expect(submit).toHaveBeenLastCalledWith({ decision: 'no' });
  fireEvent.change(screen.getByLabelText('Комментарий'), { target: { value: '  позже ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Да' })); expect(submit).toHaveBeenLastCalledWith({ decision: 'yes', comment: 'позже' });
});
it('renders details as markdown and locks while busy', () => {
  render(<ConfirmCard input={{ ...confirm, spec: { ...confirm.spec, details: '**жирный**', danger: true } }} busy onSubmit={vi.fn()} />);
  expect(screen.getByText('жирный').tagName).toBe('STRONG');
  expect(screen.getByRole('button', { name: 'Нет' })).toBeDisabled(); expect(screen.getByLabelText('Комментарий')).toBeDisabled();
});
it('shows the open confirm after choices are answered and posts it to the confirm API', async () => {
  const answered: ChoiceInput = { id: 'q', agentId: 'a', kind: 'choice', title: 'Q', state: 'submitted', spec: { options: ['x'] }, result: { value: 'x' } };
  let posted = false;
  const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    if (String(url).startsWith('/ui-lab-api/confirms')) {
      if (init?.method === 'POST') { posted = true; return response({ state: 'submitted' }); }
      return response({ inputs: [{ ...confirm, state: posted ? 'submitted' : 'open' }], csrfToken: 'csrf' });
    }
    return response({ inputs: [answered], csrfToken: 'csrf', batch: null });
  });
  const accepted = vi.fn();
  render(<ConnectedQuestionCard agentId="a" readOnly={false} onAccepted={accepted}><div>Composer</div></ConnectedQuestionCard>);
  fireEvent.click(await screen.findByRole('button', { name: 'Да' }));
  await waitFor(() => expect(accepted).toHaveBeenCalled());
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Да' })).toBeNull());
  const post = fetcher.mock.calls.find(call => call[1]?.method === 'POST')!;
  expect(post[0]).toBe('/ui-lab-api/confirms?agentId=a'); expect(JSON.parse(post[1]!.body as string)).toEqual({ id: 'c', decision: 'yes' });
  expect((post[1]!.headers as Record<string, string>)['X-CSRF-Token']).toBe('csrf');
});
