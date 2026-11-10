import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MessageAttachments } from '../components/mauzcode/MessageAttachments';
import { PendingAttachments } from '../components/mauzcode/PendingAttachments';
import { LiveComposer } from '../components/mauzcode/LiveComposer';
import { attachmentLimitError, imagePreviewSize, isPreviewImage } from '../lib/attachments';
vi.mock('../components/mauzcode/ComposerFooter', () => ({ ComposerFooter: () => null }));
vi.mock('../lib/goal', async importOriginal => ({ ...await importOriginal<typeof import('../lib/goal')>(), getGoal: vi.fn().mockResolvedValue({ version: 1, enabled: false }) }));
vi.mock('../lib/queue', async importOriginal => ({ ...await importOriginal<typeof import('../lib/queue')>(), getQueue: vi.fn().mockResolvedValue({ items: [] }) }));
const create = vi.fn(), revoke = vi.fn();
beforeEach(() => { create.mockImplementation(() => `blob:preview-${create.mock.calls.length}`); Object.defineProperty(URL,'createObjectURL',{configurable:true,value:create}); Object.defineProperty(URL,'revokeObjectURL',{configurable:true,value:revoke}); });
afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); sessionStorage.clear(); });
it('matches single-fit geometry and treats SVG/HTML as files', () => {
  expect(imagePreviewSize(1200,600)).toEqual({width:240,height:120,objectPosition:'center'});
  expect(imagePreviewSize(82,36)).toMatchObject({width:82,height:36});
  expect(imagePreviewSize(100,2000)).toMatchObject({width:60,height:240,objectPosition:'center top'});
  expect(isPreviewImage('image/svg+xml','image.svg')).toBe(false); expect(isPreviewImage('text/html','image.png')).toBe(false);
  expect(isPreviewImage('', 'photo.PNG')).toBe(true);
  expect(attachmentLimitError(Array.from({length:11},()=>new File(['x'],'x.txt')))).toContain('10');
});
it('keeps mixed attachment order, authenticated URLs and compact images', () => {
  const {container}=render(<MessageAttachments agentId="agent/a" attachments={[{id:'im/1',name:'a.png',contentType:'image/png',size:12},{id:'doc',name:'notes.txt',contentType:'text/plain',size:25},{id:null,name:'missing.pdf',size:null}]} />);
  expect(screen.getByRole('img',{name:'a.png'})).toHaveAttribute('src','/attachments/agent%2Fa/im%2F1');
  expect(screen.getByRole('button',{name:'Открыть изображение a.png'})).toHaveAttribute('data-variant','tile');
  expect([...container.querySelectorAll('.attachment-item')].map(el=>el.textContent)).toEqual(['','notes.txtTXT 25B','missing.pdfPDFВложение недоступно']);
  expect(screen.getByRole('link',{name:/notes.txt/})).toHaveAttribute('href','/attachments/agent%2Fa/doc');
});
it('opens originals in a focus-trapped dialog and restores focus on Escape', async () => {
  render(<MessageAttachments agentId="a" attachments={[{id:'im',name:'photo.png',contentType:'image/png',size:12}]} />);
  const button=screen.getByRole('button',{name:'Открыть изображение photo.png'});
  await userEvent.click(button);
  expect(await screen.findByRole('dialog',{name:'Просмотр изображения: photo.png'})).toBeVisible();
  await userEvent.keyboard('{Escape}'); await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
  expect(button).toHaveFocus();
});
it('shows a file fallback when an image cannot load', () => {
  render(<MessageAttachments agentId="a" attachments={[{id:'im',name:'broken.png',contentType:'image/png',size:12}]} />);
  fireEvent.error(screen.getByRole('img')); expect(screen.getByRole('link',{name:/broken.png/})).toBeVisible(); expect(screen.getByText(/Превью недоступно/)).toBeVisible();
});
it('creates and revokes local image URLs and supports removing one of several files', async () => {
  const files=[new File(['png'],'one.png',{type:'image/png'}),new File(['txt'],'two.txt',{type:'text/plain'})]; const remove=vi.fn();
  const view=render(<PendingAttachments files={files} onRemove={remove} />);
  expect(await screen.findByRole('img',{name:'one.png'})).toBeVisible(); expect(create).toHaveBeenCalledTimes(1);
  await userEvent.click(screen.getByRole('button',{name:'Убрать two.txt'})); expect(remove).toHaveBeenCalledWith(1);
  view.unmount(); expect(revoke).toHaveBeenCalledWith('blob:preview-1');
});
it('accepts files dropped anywhere in chat once, pasted files and file-only sending with stable retry', async () => {
  const fetcher=vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(new Response(JSON.stringify({ok:true,messageIdx:1}),{headers:{'content-type':'application/json'}})); vi.stubGlobal('fetch',fetcher);
  const accepted=vi.fn(); const {container}=render(<section className="chat-panel"><div data-testid="history">History</div><LiveComposer agentId="a" running={false} onAccepted={accepted} /></section>);
  const file=new File(['image'],'photo.png',{type:'image/png'}); const dataTransfer={types:['Files'],files:[file],dropEffect:'none'};
  fireEvent.dragEnter(screen.getByTestId('history'),{dataTransfer}); expect(container.querySelector('.chat-file-drop-overlay')).not.toBeNull();
  fireEvent.drop(screen.getByRole('textbox'),{dataTransfer}); expect(container.querySelector('.chat-file-drop-overlay')).toBeNull();
  await screen.findByRole('img',{name:'photo.png'}); expect(screen.getAllByRole('button',{name:'Убрать photo.png'})).toHaveLength(1);
  fireEvent.paste(screen.getByRole('textbox'),{clipboardData:{files:[new File(['text'],'notes.txt',{type:'text/plain'})]}});
  expect(await screen.findByText('notes.txt')).toBeVisible(); expect(fetcher).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button',{name:'Отправить сообщение'})); await screen.findByRole('alert');
  const first=fetcher.mock.calls[0][1]; expect(first.body.getAll('files')).toHaveLength(2);
  await userEvent.click(screen.getByRole('button',{name:'Отправить сообщение'})); await waitFor(()=>expect(accepted).toHaveBeenCalledOnce());
  expect(fetcher.mock.calls[1][1].headers['Idempotency-Key']).toBe(first.headers['Idempotency-Key']);
  expect(screen.queryByRole('img')).toBeNull();
});
