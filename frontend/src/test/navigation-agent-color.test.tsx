import { expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { WorkspaceChatRow } from '../components/hyper/WorkspaceChatRow';
const chat = { id: 'ab', title: 'Agent', model: '', runState: 'idle', hasUnread: false, lastReplyAt: null };
it('uses the stored agent hue for the sidebar session ID, including zero', () => {
  const view = render(<WorkspaceChatRow chat={{ ...chat, colorHue: 123 }} selected={false} archivedView={false} onSelect={vi.fn()} />);
  expect(view.container.querySelector('.workspace-chat-id')).toHaveClass('has-agent-color');
  expect(view.container.querySelector('.workspace-chat-id')).toHaveStyle('--agent-hue: 123');
  view.rerender(<WorkspaceChatRow chat={{ ...chat, colorHue: 0 }} selected archivedView={false} onSelect={vi.fn()} />);
  expect(view.container.querySelector('.workspace-chat-id')).toHaveStyle('--agent-hue: 0');
  view.rerender(<WorkspaceChatRow chat={chat} selected={false} archivedView={false} onSelect={vi.fn()} />);
  expect(view.container.querySelector('.workspace-chat-id')).not.toHaveClass('has-agent-color');
});
