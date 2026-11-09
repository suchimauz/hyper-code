import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import telegramExtension, { TelegramPage } from '../../../plugins/telegram/ui';
const context = { agentId: null, theme: 'light' as const, readOnly: false };
const chats = [{ id: '123', title: 'Alice', lastMessage: 'Hello', unreadCount: 2 }];
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
function mockReads() { return vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
  if (options?.method === 'POST') return json({ message: { id: 7 } });
  return json(String(url).includes('/dialogs') ? { dialogs: chats } : { messages: [{ id: 1, sender: 'Alice', senderId: '123', date: '2026-01-01T00:00:00Z', outgoing: false, text: '<script>literal</script>' }] });
}); }
async function compose() {
  fireEvent.click(await screen.findByRole('button', { name: /Alice/ }));
  await screen.findByText('<script>literal</script>');
  fireEvent.change(screen.getByLabelText('Сообщение'), { target: { value: ' exact message ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Проверить отправку' }));
}
afterEach(() => { vi.restoreAllMocks(); document.querySelector('meta[name="csrf-token"]')?.remove(); });
describe('native Telegram page (mocked HTTP only)', () => {
  it('declares the registration, renders escaped messages and searches without writes or embedded HTML', async () => {
    expect(telegramExtension.id).toBe('telegram'); expect(telegramExtension.pages?.[0].id).toBe('overview');
    const fetch = mockReads(); const view = render(<TelegramPage context={context} />);
    await compose();
    expect(view.container.querySelector('iframe, script')).toBeNull();
    expect(fetch.mock.calls.every(([, options]) => options?.method === 'GET')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'missing' } });
    expect(screen.getByText('Ничего не найдено')).toBeTruthy();
  });
  it('sends the immutable preview only on explicit confirmation with cookie-bound CSRF', async () => {
    const meta = document.createElement('meta'); meta.name = 'csrf-token'; meta.content = 'bound-token'; document.head.append(meta);
    const fetch = mockReads(); render(<TelegramPage context={context} />); await compose();
    expect(fetch.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(0);
    expect(screen.getByRole('dialog')).toHaveTextContent('exact message');
    fireEvent.click(screen.getByRole('button', { name: 'Подтвердить и отправить' }));
    await waitFor(() => expect(fetch.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1));
    const [url, options] = fetch.mock.calls.find(([, options]) => options?.method === 'POST')!;
    expect(url).toBe('/telegram/api/send');
    expect(JSON.parse(options?.body as string)).toEqual({ chat: '123', text: 'exact message', confirm: true });
    expect(new Headers(options?.headers).get('X-CSRF-Token')).toBe('bound-token');
  });
  it('never sends without CSRF and never automatically retries', async () => {
    const fetch = mockReads(); render(<TelegramPage context={context} />); await compose();
    fireEvent.click(screen.getByRole('button', { name: 'Подтвердить и отправить' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('CSRF token required');
    expect(fetch.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(0);
  });
  it('honors read-only and shows permission errors', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ error: 'Forbidden' }, 403));
    render(<TelegramPage context={{ ...context, readOnly: true }} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Forbidden');
    expect(screen.getByRole('button', { name: 'Проверить отправку' })).toBeDisabled();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
