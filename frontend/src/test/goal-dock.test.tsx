import { expect, it, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { GoalDock } from '../components/hyper/GoalDock';
import { changeGoal, getGoal, type GoalSnapshot } from '../lib/goal';
vi.mock('../lib/goal', async original => ({ ...await original<typeof import('../lib/goal')>(), getGoal: vi.fn(), changeGoal: vi.fn() }));
afterEach(() => vi.clearAllMocks());
const snapshot: GoalSnapshot = { version: 1, enabled: true, csrfToken: 'csrf', owner: { runToken: null, stoppedAt: null, runState: 'idle' }, goal: { goalId: 'id', revision: 2, objective: 'Проверить проект', status: 'active', tokenBudget: 10000, tokensUsed: 500, timeUsedSeconds: 120 } };
const props = { agentId: 'a', running: false, disabled: false, editor: null, onClose: vi.fn(), onAccepted: vi.fn() };
it('shows the goal and expands accounting; pauses the displayed snapshot', async () => {
  vi.mocked(getGoal).mockResolvedValue(snapshot); vi.mocked(changeGoal).mockResolvedValue({});
  render(<GoalDock {...props} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Проверить проект' }));
  expect(screen.getByText(/Токены: 500/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Приостановить цель' }));
  await waitFor(() => expect(changeGoal).toHaveBeenCalledWith('a', snapshot, 'pause', undefined));
});
it('creates a paused goal through the existing API with an explicit budget', async () => {
  const empty = { ...snapshot, goal: null }; vi.mocked(getGoal).mockResolvedValue(empty);
  render(<GoalDock {...props} editor={{ text: 'Новая задача' }} />);
  const save = screen.getByRole('button', { name: 'Сохранить цель' });
  await waitFor(() => expect(save).toBeEnabled());
  fireEvent.change(screen.getByLabelText('Бюджет токенов'), { target: { value: '3000' } }); fireEvent.click(save);
  await waitFor(() => expect(changeGoal).toHaveBeenCalledWith('a', empty, 'create', { objective: 'Новая задача', tokenBudget: 3000 }));
});
it('never offers an enabled save when the feature is disabled', async () => {
  vi.mocked(getGoal).mockResolvedValue({ version: 1, enabled: false });
  render(<GoalDock {...props} editor={{ text: 'Задача' }} />);
  await screen.findByText('Goal отключён на сервере.');
  expect(screen.getByRole('button', { name: 'Сохранить цель' })).toBeDisabled();
});

it.each(['Цель', 'Бюджет токенов'])('submits with Enter from %s', async label => {
  vi.mocked(getGoal).mockResolvedValue({ ...snapshot, goal: null });
  vi.mocked(changeGoal).mockResolvedValue({});
  render(<GoalDock {...props} editor={{ text: 'Проверка Enter' }} />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Сохранить цель' })).toBeEnabled());
  fireEvent.keyDown(screen.getByLabelText(label), { key: 'Enter' });
  await waitFor(() => expect(changeGoal).toHaveBeenCalledTimes(1));
});
it('keeps Shift+Enter and IME Enter as input, and resizes on multiline edits', async () => {
  vi.mocked(getGoal).mockResolvedValue({ ...snapshot, goal: null });
  render(<GoalDock {...props} editor={{ text: 'Строка' }} />);
  const input = screen.getByLabelText('Цель');
  expect(input).toHaveAttribute('rows', '1');
  expect(fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })).toBe(true);
  expect(fireEvent.keyDown(input, { key: 'Enter', isComposing: true })).toBe(true);
  Object.defineProperty(input, 'scrollHeight', { configurable: true, value: 68 });
  fireEvent.change(input, { target: { value: 'Строка\nВторая\nТретья' } });
  expect(input).toHaveStyle({ height: '70px' }); // scroll height plus the two border pixels
  expect(changeGoal).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));
  expect(props.onClose).toHaveBeenCalled();
});
