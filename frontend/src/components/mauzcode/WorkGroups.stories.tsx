import type { Meta, StoryObj } from '@storybook/react-vite';
import { Transcript } from './Transcript';
import type { ChatEvent } from '../../lib/mauzcode';
const event = (idx: number, type: string, text: string, extra: Partial<ChatEvent> = {}): ChatEvent => ({ idx, ts: idx * 1000, type, text, ...extra });
const events: ChatEvent[] = [
  event(0, 'user', 'Проверь структуру проекта', { messageIdx: 0 }),
  event(1, 'assistant', 'Сначала проверю файлы и зависимости.'),
  event(2, 'thinking', '', { publicSummary: 'Проверяю точки входа приложения.', durationMs: 2300 }),
  event(3, 'tool_call', '', { name: 'read', toolSummary: 'Read package.json' }),
  event(4, 'tool_call', '', { name: 'grep', toolSummary: 'Search entry points' }),
  event(5, 'assistant', 'Зависимости найдены. Проверю конфигурацию сборки.'),
  event(6, 'tool_call', '', { name: 'read', toolSummary: 'Read vite.config.ts' }),
  event(7, 'assistant', 'Проект использует React и Vite. Конфигурация корректна.'),
  event(8, 'user', 'Теперь проверь тесты', { messageIdx: 8 }),
  event(9, 'assistant', 'Запущу тесты компонентов.'),
  event(10, 'tool_call', '', { name: 'bash', toolSummary: 'Run component tests' }),
  event(11, 'tool_call', '', { name: 'read', toolSummary: 'Read test report' }),
  event(12, 'assistant', 'Все тесты прошли.'),
];
const meta = { title: 'MauzCode/Work Groups', component: Transcript, parameters: { layout: 'fullscreen' }, args: { agentId: 'fixture', events, page: null, hasOlder: false, loadingOlder: false, loadOlder: async () => {} }, decorators: [(Story) => <div style={{ height: '100vh' }}><Story /></div>] } satisfies Meta<typeof Transcript>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Completed: Story = {};
export const Stopped: Story = { args: { events: [...events.slice(0, 12), event(12, 'stop', '')] } };
export const Running: Story = { args: { events: events.slice(0, 12), page: { agentId: 'fixture', events: [], olderBefore: null, hasOlder: false, isRunning: true, runState: 'running', lastError: null, partial: null, turnStartedAt: Date.now() - 14000, activeTools: [{ id: 'active', name: 'bash', subject: 'Run tests', startedAt: Date.now(), state: 'running', tail: '' }] } } };
