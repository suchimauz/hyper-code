import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CanvasFile } from './CanvasFile';
import { requestJson } from '../../sdk/api';
vi.mock('./CodeEditor', () => ({ CodeEditor: ({ value, onChange, path }: { value: string; onChange: (v: string) => void; path: string }) => <textarea aria-label={`Текст файла ${path}`} defaultValue={value} onChange={event => onChange(event.target.value)} /> }));
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
it.each(['image', 'audio', 'video', 'pdf', 'html', 'download'] as const)('renders native %s preview without the SSR viewer', async previewKind => {
  request.mockResolvedValue({ path: '/tmp/file', preview: true, previewKind });
  const view = render(<CanvasFile csrfToken="state-token" agentId="a" item={item} theme="light" refresh={() => {}} />);
  expect(await screen.findByRole('link', { name: 'Скачать файл' })).toHaveAttribute('href', '/canvas/a/item/7/document?download=1');
  const frame = view.container.querySelector('iframe');
  if (previewKind === 'pdf' || previewKind === 'html') { expect(frame).toHaveAttribute('sandbox', ''); expect(frame).toHaveAttribute('src', '/canvas/a/item/7/document'); }
  else expect(frame).toBeNull();
  if (previewKind === 'image') expect(screen.getByRole('img')).toHaveAttribute('src', '/canvas/a/item/7/document');
  if (previewKind === 'audio' || previewKind === 'video') expect(view.container.querySelector(previewKind)).toHaveAttribute('controls');
});
it('renders Markdown locally without allowing raw executable HTML', async () => {
  request.mockResolvedValue({ path: '/tmp/file', content: '# Heading\n<script>alert(1)</script>', previewKind: 'markdown' });
  const view = render(<CanvasFile csrfToken="state-token" agentId="a" item={item} theme="light" refresh={() => {}} />);
  expect(await screen.findByRole('heading', { name: 'Heading' })).toBeVisible();
  expect(view.container.querySelector('script,iframe')).toBeNull();
});
it.each(['local', 'work box'])('resolves Markdown sibling assets on %s', async host => {
  request.mockResolvedValue({ path: '/tmp/docs/readme.md', content: '![picture](./images/a.png)\n[next](../next.md)', previewKind: 'markdown' });
  render(<CanvasFile csrfToken="token" agentId="a" item={{...item,args:{path:'/tmp/docs/readme.md',host}}} theme="light" refresh={() => {}} />);
  const prefix = host === 'local' ? '/files/absolute' : '/files/remote/work%20box';
  expect(await screen.findByRole('img')).toHaveAttribute('src', `${window.location.origin}${prefix}/tmp/docs/images/a.png`);
  expect(screen.getByRole('link', {name:'next'})).toHaveAttribute('href', `${window.location.origin}${prefix}/tmp/next.md`);
});
it('gives HTML a path-based base and restrictive CSP without enabling scripts', async () => {
  request.mockResolvedValue({path:'/tmp/docs/index.html',content:'<link rel="stylesheet" href="./style.css"><img src="./a.png"><script>alert(1)</script>',previewKind:'html'});
  const view = render(<CanvasFile csrfToken="token" agentId="a" item={item} theme="light" refresh={() => {}} />);
  await screen.findByRole('link',{name:'Скачать файл'});
  const frame=view.container.querySelector('iframe')!;
  expect(frame).toHaveAttribute('sandbox','');
  expect(frame.getAttribute('srcdoc')).toContain(`${window.location.origin}/files/absolute/tmp/docs/index.html`);
  expect(frame.getAttribute('srcdoc')).toContain("default-src 'none'");
  expect(frame.getAttribute('srcdoc')).toContain('Content-Security-Policy');
  expect(frame).not.toHaveAttribute('src');
});
it('shows the workspace tree and opens a file in place through the tab-bound endpoint', async () => {
  const tabItem = { ...item, args: { path: '/w/src/a.ts', host: 'local', root: '/w' } };
  request.mockImplementation(async (_url: string, options: any) => {
    const body = options?.body ?? {};
    if (body.fileAction === 'list' && body.path === '/w') return { path: '/w', isDir: true, entries: [{ name: 'src', isDir: true }, { name: 'README.md', isDir: false }] };
    if (body.fileAction === 'list' && body.path === '/w/src') return { path: '/w/src', isDir: true, entries: [{ name: 'a.ts', isDir: false }] };
    if (body.fileAction === 'read' && body.path === '/w/README.md') return { path: '/w/README.md', root: '/w', content: '# Hi', previewKind: 'markdown' };
    if (body.fileAction === 'read') return { path: '/w/src/a.ts', root: '/w', content: 'x', previewKind: 'text' };
    return {};
  });
  render(<CanvasFile csrfToken="t" agentId="a" item={tabItem} theme="light" refresh={() => {}} />);
  expect(await screen.findByRole('tree', { name: 'Файлы рабочей папки' })).toBeVisible();
  expect(await screen.findByRole('treeitem', { name: /a\.ts/ })).toHaveAttribute('aria-selected', 'true');
  fireEvent.click(await screen.findByRole('treeitem', { name: /README\.md/ }));
  expect(await screen.findByRole('heading', { name: 'Hi' })).toBeVisible();
  expect(request).toHaveBeenCalledWith('/canvas/a/item/7', { method: 'POST', csrfToken: 't', body: { fileAction: 'read', path: '/w/README.md' } });
});
it('toggles line wrapping and remembers the choice', async () => {
  localStorage.removeItem('hyper.canvas.files.wrap');
  request.mockResolvedValue({ path: '/tmp/file', content: 'x' });
  render(<CanvasFile csrfToken="t" agentId="a" item={item} theme="light" refresh={() => {}} />);
  const button = await screen.findByRole('button', { name: 'Перенос строк' });
  expect(button).toHaveAttribute('aria-pressed', 'false');
  fireEvent.click(button);
  expect(button).toHaveAttribute('aria-pressed', 'true');
  expect(localStorage.getItem('hyper.canvas.files.wrap')).toBe('1');
});
