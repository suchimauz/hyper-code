import { afterEach, expect, test } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { TranscriptMessage } from '../components/mauzcode/TranscriptMessage';
import type { ChatEvent } from '../lib/mauzcode';
afterEach(cleanup);
const event: ChatEvent = { idx: 1, ts: 1, type: 'parked', text: null };
test.each([
  ['parked', 'Пауза: лимит подписки'], ['unparked', 'Пауза снята'], ['model_changed', 'Модель изменена'],
  ['team_update', 'Событие команды'], ['wake_up', 'Автоматический запуск'], ['canvas_ping', 'Сигнал с canvas'],
  ['plan_activation', 'Начат шаг'], ['goal_activation', 'Цель включена'], ['goal_check', 'Результат требует проверки'],
  ['attempt', 'Попытка исправлена · Только аудит'], ['attachment_event', 'Внешнее сообщение'],
])('%s is a native accessible disclosure', (type, title) => {
  const { container } = render(<TranscriptMessage agentId="a" event={{ ...event, type }} />);
  expect(screen.getByText(title).closest('summary')).toBeTruthy();
  expect(container.querySelector('details')).toBeTruthy();
});
test('watch results and canvas data are inert text, not executable historical HTML', () => {
  const { container } = render(<TranscriptMessage agentId="a" event={{ ...event, type: 'wake_up', html: '<img src=x onerror=alert(1)>', lifecycle: { watchId: 'w', watchStatus: 'ready', prompt: '<script>bad</script>', dataPreview: '<img src=x>', resultId: 'stored' } }} />);
  expect(screen.getByText('Условие выполнено')).toBeTruthy();
  expect(screen.getByText('<script>bad</script>')).toBeTruthy();
  expect(container.querySelector('script,img')).toBeNull();
  expect(container.textContent).toContain('stored');
});
test('scheduled user events are automation notices and team links encode identity', () => {
  const { rerender } = render(<TranscriptMessage agentId="a" event={{ ...event, type: 'user', lifecycle: { automationKind: 'scheduled', cronExpression: '* * * * *', timezone: 'UTC' } }} />);
  expect(screen.getByText('Запуск по расписанию')).toBeTruthy();
  rerender(<TranscriptMessage agentId="a" event={{ ...event, type: 'team_update', lifecycle: { event: 'plan.completed', memberId: 'a/b', summary: '<b>done</b>' } }} />);
  expect(screen.getByRole('link').getAttribute('href')).toBe('/agent/a%2Fb');
  expect(screen.getByText('<b>done</b>')).toBeTruthy();
});
