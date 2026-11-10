import { afterEach, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatViewport } from '../components/layout/ChatViewport';
afterEach(() => localStorage.clear());
it('toggles full width and restores the preference on remount', async () => {
  const view = render(<ChatViewport>Содержимое</ChatViewport>);
  await userEvent.click(screen.getByRole('button', { name: 'Чат на всю ширину панели' }));
  expect(localStorage.getItem('mauzcode-ui.chat-content-width-v2')).toBe('full');
  view.unmount(); render(<ChatViewport>Содержимое</ChatViewport>);
  expect(screen.getByRole('button', { name: 'Обычная ширина чата' })).toHaveAttribute('aria-pressed', 'true');
});
it('supports keyboard resizing on both edges', () => {
  render(<ChatViewport>Содержимое</ChatViewport>);
  const right = screen.getByRole('separator', { name: /справа/ });
  fireEvent.keyDown(right, { key: 'Home' }); expect(localStorage.getItem('mauzcode-ui.chat-content-width-v2')).toBe('640');
  fireEvent.keyDown(right, { key: 'ArrowRight' }); expect(localStorage.getItem('mauzcode-ui.chat-content-width-v2')).toBe('672');
  fireEvent.keyDown(screen.getByRole('separator', { name: /слева/ }), { key: 'ArrowLeft' }); expect(localStorage.getItem('mauzcode-ui.chat-content-width-v2')).toBe('704');
  fireEvent.keyDown(right, { key: 'End' }); expect(localStorage.getItem('mauzcode-ui.chat-content-width-v2')).toBe('full');
});
