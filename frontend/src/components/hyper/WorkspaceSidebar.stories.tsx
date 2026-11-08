import type { Meta, StoryObj } from '@storybook/react-vite';
import { WorkspaceSidebar } from './WorkspaceSidebar';
const meta = {
  title: 'Hyper/Workspace Sidebar', component: WorkspaceSidebar, parameters: { layout: 'fullscreen' },
  args: { projects: [{ id: 'fixture', title: 'Hyper UI', dir: '/workspace/hyper-ui', host: null, chats: [{ id: 'ab', title: 'Навигация и рабочие пространства', model: 'fixture', runState: 'running', hasUnread: true, lastReplyAt: Date.now() - 180000 }, { id: 'ac', title: 'Компоненты и дизайн-система', model: 'fixture', runState: 'idle', hasUnread: false, lastReplyAt: Date.now() - 86400000 }] }], user: { name: 'Demo User', role: 'owner' }, selected: 'ab', theme: 'light', onTheme: () => {}, onToggle: () => {}, onSelect: () => {}, onRetry: () => {} },
  decorators: [(Story, context) => <div style={{ width: context.args.compact ? 56 : 280, height: '100vh', borderRight: '1px solid var(--line)' }}><Story /></div>],
} satisfies Meta<typeof WorkspaceSidebar>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Expanded: Story = {};
export const Compact: Story = { args: { compact: true } };
export const Loading: Story = { args: { projects: [], loading: true } };
export const Error: Story = { args: { projects: [], error: 'Не удалось загрузить рабочие пространства' } };
export const Member: Story = { args: { user: { name: 'Demo Member', role: 'member' } } };
const quotas = [
  { id: 'claude-code:main', provider: 'claude-code', account: 'main', label: 'claude-code · main', model: 'claude-code/main:', connection: 'local', kind: 'quota', windows: { fiveHour: { usedPercent: 24, resetsAt: Date.now() + 3600e3, tone: 'neutral' }, weekly: { usedPercent: 45, resetsAt: Date.now() + 86400e3, tone: 'warning' } }, tone: 'warning', parkedAgents: 0 },
  { id: 'codex:su@srv', provider: 'codex', account: 'su4imauz', label: 'codex · ssh.srv.su4imauz', model: 'codex/su4imauz:', connection: 'ssh', host: 'aeza', kind: 'quota', windows: { weekly: { usedPercent: 93, resetsAt: Date.now() + 2 * 86400e3, tone: 'error' } }, tone: 'error', planType: 'pro', parkedAgents: 1 },
  { id: 'opencode:default', provider: 'opencode', account: 'default', label: 'OpenCode Go', model: 'opencode/default:', connection: 'hyper', host: 'node1', kind: 'quota', windows: { fiveHour: { usedPercent: 0, resetsAt: null, tone: 'neutral' }, weekly: { usedPercent: 15, resetsAt: null, tone: 'neutral' }, monthly: { usedPercent: 65, resetsAt: null, tone: 'critical' } }, tone: 'critical', parkedAgents: 0 },
  { id: 'oneapi:default', provider: 'oneapi', account: 'default', label: 'Asoft LLM Gate', model: 'oneapi/default:', connection: 'local', kind: 'status', status: 'available', tone: 'neutral', parkedAgents: 0 },
  { id: 'claude-code:x@srv', provider: 'claude-code', account: 'brailyn', label: 'claude-code · ssh', model: 'claude-code/brailyn:', connection: 'ssh', host: 'aeza', kind: 'quota', windows: {}, quotaStatus: 'unavailable', tone: 'neutral', parkedAgents: 0 },
] satisfies import('../../lib/quotas').QuotaAccount[];
export const WithQuotas: Story = { args: { quotas } };
export const CompactWithQuotas: Story = { args: { quotas, compact: true } };
