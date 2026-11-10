import { afterEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueueDock } from '../components/mauzcode/QueueDock';
import { LiveComposer } from '../components/mauzcode/LiveComposer';
import { MessageInput } from '../components/mauzcode/MessageInput';
import { enqueueMessage, changeQueue, type QueueItem } from '../lib/queue';
vi.mock('../components/mauzcode/ComposerFooter', () => ({ ComposerFooter: () => null }));
const row: QueueItem = { id: 'q/1', sequence: 1, text: 'First message', version: 2, status: 'pending', createdAt: 1, files: [] };
const json = (body: object) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); sessionStorage.clear(); });
function queue(items = [row]) { return { waitingForInput: false, items, sending: null, processing: null, error: '', refresh: vi.fn(), enqueue: vi.fn(), perform: vi.fn().mockResolvedValue(true) }; }
it('shows one row immediately, collapses multiple rows, and locks collapse during editing', async () => {
  const q = queue(); const view = render(<QueueDock queue={q} running />);
  expect(screen.getByText('First message')).toBeVisible(); expect(screen.queryByRole('button', { name: /В очереди/ })).toBeNull();
  view.rerender(<QueueDock queue={{ ...q, items: [row, { ...row, id: 'two', text: 'Second' }] }} running />);
  expect(screen.queryByText('First message')).toBeNull(); fireEvent.click(screen.getByRole('button', { name: /В очереди/ }));
  fireEvent.click(screen.getAllByRole('button', { name: 'Редактировать сообщение' })[0]);
  expect(screen.getByRole('button', { name: /В очереди/ })).toBeDisabled();
  const editor = screen.getByRole('textbox'); fireEvent.change(editor, { target: { value: 'Changed' } }); fireEvent.keyDown(editor, { key: 'Enter' });
  await waitFor(() => expect(q.perform).toHaveBeenCalledWith([row], 'edit', 'Changed'));
  await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull());
});
it('cancels with Escape and disables attachment edits and idle steering', () => {
  const q = queue(); const view = render(<QueueDock queue={q} running={false} />);
  expect(screen.getByRole('button', { name: 'Направить агенту сейчас' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Редактировать сообщение' })); fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' }); expect(q.perform).not.toHaveBeenCalled();
  view.rerender(<QueueDock queue={queue([{ ...row, files: [{ name: 'file.txt', type: 'text/plain', size: 4 }] }])} running />);
  expect(screen.getByRole('button', { name: 'Редактировать сообщение' })).toBeDisabled();
});
it('uses multipart stable request identity and versioned mutations', async () => {
  const fetcher = vi.fn().mockImplementation(() => Promise.resolve(json({ ok: true }))); vi.stubGlobal('fetch', fetcher);
  const file = new File(['x'], 'x.txt'); await enqueueMessage('a/b', 'hello', 'stable', [file]);
  expect(fetcher.mock.calls[0][0]).toBe('/agent/a%2Fb/queue'); expect(fetcher.mock.calls[0][1].headers['Idempotency-Key']).toBe('stable'); expect(fetcher.mock.calls[0][1].body.get('requestId')).toBe('stable'); expect(fetcher.mock.calls[0][1].body.getAll('files')).toHaveLength(1);
  await changeQueue('a', row, 'edit', 'new'); expect(JSON.parse(fetcher.mock.calls[1][1].body)).toEqual({ version: 2, text: 'new' });
  await changeQueue('a', row, 'remove'); expect(fetcher.mock.calls[2][0]).toBe('/agent/a/queue/q%2F1?version=2');
  await changeQueue('a', row, 'steer'); expect(fetcher.mock.calls[3][0]).toBe('/agent/a/queue/q%2F1/steer');
});
it('Ctrl/Cmd+Enter steers without sending the draft or stopping', () => {
  const steer = vi.fn(), send = vi.fn(), stop = vi.fn(); render(<MessageInput value="draft" onChange={() => {}} onSend={send} running onStop={stop} onSteerAll={steer} />);
  fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter', ctrlKey: true }); fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter', metaKey: true });
  expect(steer).toHaveBeenCalledTimes(2); expect(send).not.toHaveBeenCalled(); expect(stop).not.toHaveBeenCalled();
});
it('running sends to queue and uncertain retry keeps the endpoint and key after running ends', async () => {
  let attempts = 0; const posts: RequestInit[] = [];
  const fetcher = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    if (init?.method === 'POST') { posts.push(init); if (++attempts === 1) return Promise.reject(new Error('offline')); return Promise.resolve(json({ ok: true, queueId: 'q', version: 1 })); }
    return Promise.resolve(json({ items: [] }));
  }); vi.stubGlobal('fetch', fetcher);
  const accepted = vi.fn(); const view = render(<LiveComposer agentId="a" running onAccepted={accepted} />);
  const editor = screen.getByRole('textbox'); fireEvent.input(editor, { target: { textContent: 'Queued text' } });
  fireEvent.click(screen.getByRole('button', { name: 'В очередь' })); await screen.findByRole('alert');
  view.rerender(<LiveComposer agentId="a" running={false} onAccepted={accepted} />);
  fireEvent.click(screen.getByRole('button', { name: 'Отправить сообщение' })); await waitFor(() => expect(accepted).toHaveBeenCalledOnce());
  expect(posts).toHaveLength(2); expect(posts[0].headers).toEqual(posts[1].headers);
  expect(fetcher.mock.calls.filter(([, init]) => init?.method === 'POST').map(([url]) => url)).toEqual(['/agent/a/queue', '/agent/a/queue']);
});
it('isolates a late list response after agent switching', async () => {
  let resolveOld!: (response: Response) => void;
  vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => url.includes('/old/') ? new Promise<Response>(resolve => { resolveOld = resolve; }) : Promise.resolve(json({ items: [{ ...row, text: 'New queue' }] }))));
  const view = render(<LiveComposer agentId="old" running onAccepted={() => {}} />);
  view.rerender(<LiveComposer agentId="new" running onAccepted={() => {}} />);
  expect(await screen.findByText('New queue')).toBeVisible(); resolveOld(json({ items: [row] }));
  await waitFor(() => expect(screen.queryByText('First message')).toBeNull());
});

it('idle waiting inputs queue ordinary messages instead of attempting direct send', async () => {
 const fetcher = vi.fn().mockImplementation((_url:string, init?:RequestInit) => Promise.resolve(json(init?.method === 'POST' ? {ok:true,queueId:'q',version:1} : {items:[row],waitingForInput:true})));
 vi.stubGlobal('fetch',fetcher);
 const accepted=vi.fn(); render(<LiveComposer agentId="waiting" running={false} onAccepted={accepted}/>);
 await screen.findByText('First message');
 expect(screen.queryByText(/Агент ждёт ответа в форме/)).toBeNull();
 expect(screen.getByRole('button',{name:'Направить агенту сейчас'})).toBeDisabled();
 fireEvent.input(screen.getByRole('textbox'),{target:{textContent:'Later'}});
 fireEvent.click(screen.getByRole('button',{name:'Отправить сообщение'}));
 await waitFor(()=>expect(accepted).toHaveBeenCalledOnce());
 expect(fetcher.mock.calls.filter(([,init])=>init?.method==='POST').map(([url])=>url)).toEqual(['/agent/waiting/queue']);
});
