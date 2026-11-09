import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CanvasFile } from './CanvasFile';
import { requestJson } from '../../sdk/api';
vi.mock('../../sdk/api', () => ({ requestJson: vi.fn() }));
const request = vi.mocked(requestJson);
const item = { id: 7, title: 'file', icon: 'file-text', active: true, kind: 'file', args: { path: '/tmp/file', host: 'local' } };
beforeEach(() => { request.mockReset(); });
it('loads and explicitly saves text with conflict snapshot', async () => {
  request.mockResolvedValueOnce({ path: '/tmp/file', content: 'old' }).mockResolvedValueOnce({ path: '/tmp/file', content: 'new' });
  render(<CanvasFile csrfToken="state-token" agentId="a" item={item} theme="dark" refresh={() => {}} />);
  const editor = await screen.findByRole('textbox');
  fireEvent.change(editor, { target: { value: 'new' } });
  fireEvent.click(screen.getByRole('button', { name: /Сохранить/ }));
  await waitFor(() => expect(request).toHaveBeenCalledWith('/canvas/a/item/7', { method: 'POST', csrfToken: 'state-token', body: { fileAction: 'save', content: 'new', expectedContent: 'old' } }));
});
it('does not erase a dirty draft on unrelated state updates', async () => {
  request.mockResolvedValue({ path: '/tmp/file', content: 'old' });
  const props = { csrfToken: 'state-token', agentId: 'a', item, theme: 'light' as const, refresh: () => {} };
  const view = render(<CanvasFile {...props} />);
  fireEvent.change(await screen.findByRole('textbox'), { target: { value: 'draft' } });
  view.rerender(<CanvasFile {...props} item={{ ...item, state: { changed: true } }} />);
  expect(screen.getByRole('textbox')).toHaveValue('draft'); expect(request).toHaveBeenCalledTimes(1);
});
it('navigates directories through the agent-bound endpoint', async () => {
  request.mockResolvedValueOnce({ path: '/tmp/file', isDir: true, entries: [{ name: 'child', isDir: false }] }).mockResolvedValueOnce({});
  const refresh = vi.fn(); render(<CanvasFile csrfToken="state-token" agentId="a" item={item} theme="light" refresh={refresh} />);
  fireEvent.click(await screen.findByRole('button', { name: 'child' }));
  await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
  expect(request).toHaveBeenLastCalledWith('/canvas/a', { method: 'POST', csrfToken: 'state-token', body: { navigate: { itemId: 7, file: { path: '/tmp/file/child', host: 'local' } } } });
});
