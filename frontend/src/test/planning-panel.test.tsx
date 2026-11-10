import { expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PlanningPanel, type PlanningPanelProps, type PlanningState } from '../components/mauzcode/PlanningPanel';

const proposal: NonNullable<PlanningState['proposal']> = {
  id: 'proposal-1', inputId: 'input-1', createdAt: 123,
  status: 'pending', plan: '# Проверка\n\nПолный **план**.\n\n- Первый шаг\n- Второй шаг\n\n[Документация](https://example.com)\n\n<script>unsafe()</script>',
};
function props(overrides: Partial<PlanningPanelProps> = {}): PlanningPanelProps {
  return { state: { mode: 'plan', revision: 1, advisory: true, proposal }, running: false, onDecision: vi.fn(), onExit: vi.fn(), ...overrides };
}

it('renders the complete safe Markdown proposal and a persistent advisory indicator', () => {
  const { container } = render(<PlanningPanel {...props()} />);
  expect(screen.getByRole('heading', { name: 'Plan mode' })).toBeInTheDocument();
  expect(screen.getByText(/а не sandbox/)).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Проверка' })).toBeInTheDocument();
  expect(container.querySelector('strong')).toHaveTextContent('план');
  expect(screen.getAllByRole('listitem')).toHaveLength(2);
  expect(screen.getByRole('link', { name: 'Документация' })).toHaveAttribute('href', 'https://example.com');
  expect(container.querySelector('script')).toBeNull();
  expect(screen.getByRole('region', { name: 'Предложенный план' })).toHaveAttribute('tabindex', '0');
});

it('emits decisions and exit without mutating the controlled proposal', async () => {
  const p = props(); render(<PlanningPanel {...p} />); const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Начать реализацию' }));
  await user.click(screen.getByRole('button', { name: 'Уточнить план' }));
  await user.click(screen.getByRole('button', { name: 'Выйти из Plan mode' }));
  expect(p.onDecision).toHaveBeenNthCalledWith(1, 'approve');
  expect(p.onDecision).toHaveBeenNthCalledWith(2, 'keep');
  expect(p.onExit).toHaveBeenCalledOnce();
  expect(p.state.proposal?.status).toBe('pending');
});

it.each([
  { running: true, reason: /Сначала остановите агента/ },
  { readOnly: true, reason: /Только чтение/ },
  { busy: true, reason: /Сохраняем решение/ },
])('disables all actions and explains the restriction: %j', async ({ reason, ...overrides }) => {
  const p = props(overrides); render(<PlanningPanel {...p} />);
  expect(screen.getByRole('status')).toHaveTextContent(reason);
  for (const button of screen.getAllByRole('button')) {
    expect(button).toBeDisabled(); await userEvent.click(button);
  }
  expect(p.onDecision).not.toHaveBeenCalled(); expect(p.onExit).not.toHaveBeenCalled();
});

it.each(['approved', 'kept'] as const)('does not present a %s proposal as pending', status => {
  render(<PlanningPanel {...props({ state: { mode: 'plan', revision: 2, advisory: true, proposal: { ...proposal, status } } })} />);
  expect(screen.queryByRole('heading', { name: 'Plan mode' })).toBeNull();
  expect(screen.queryByRole('region', { name: 'Предложенный план' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Начать реализацию' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Выйти из Plan mode' })).toBeNull();
});

it('hides the review card without a pending proposal in either mode', () => {
  const p = props({ state: { mode: 'plan', revision: 3, advisory: true, proposal: null } });
  const { rerender, container } = render(<PlanningPanel {...p} />);
  expect(container).toBeEmptyDOMElement();
  for (const previous of [null, { ...proposal, status: 'approved' as const }, { ...proposal, status: 'kept' as const }]) {
    rerender(<PlanningPanel {...p} state={{ ...p.state, mode: 'execute', proposal: previous }} />);
    expect(container).toBeEmptyDOMElement();
  }
});

it('retains a pending decision in execute mode without claiming plan mode is active', async () => {
  const p = props(); render(<PlanningPanel {...p} state={{ ...p.state, mode: 'execute' }} />);
  expect(screen.getByRole('heading', { name: 'План на согласовании' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Выйти из Plan mode' })).toBeNull();
  const approve = screen.getByRole('button', { name: 'Начать реализацию' });
  approve.focus(); await userEvent.keyboard('{Enter}');
  expect(p.onDecision).toHaveBeenCalledWith('approve');
});
