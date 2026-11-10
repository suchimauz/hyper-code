import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { requestJson, sendMessage, mergeTail, type EventPage } from '../lib/mauzcode';
import { LiveComposer } from '../components/mauzcode/LiveComposer';
vi.mock('../lib/goal', async importOriginal => ({ ...await importOriginal<typeof import('../lib/goal')>(), getGoal: vi.fn().mockResolvedValue({ version: 1, enabled: false }) }));
vi.mock('../lib/queue', async importOriginal => ({ ...await importOriginal<typeof import('../lib/queue')>(), getQueue: vi.fn().mockResolvedValue({ items: [] }) }));
import { Transcript } from '../components/mauzcode/Transcript';

afterEach(() => { vi.unstubAllGlobals(); sessionStorage.clear(); });
const json = (body: object, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
describe('Live MauzCode client', () => {
  it('sends form data and stable idempotency headers to existing chat pipeline', async () => {
    const fetcher = vi.fn().mockResolvedValue(json({ ok: true, messageIdx: 1 })); vi.stubGlobal('fetch', fetcher);
    await sendMessage('test-agent', 'Привет', 'key-1');
    expect(fetcher.mock.calls[0][0]).toBe('/agent/test-agent');
    const options = fetcher.mock.calls[0][1];
    expect(options.credentials).toBe('same-origin'); expect(options.headers['Idempotency-Key']).toBe('key-1');
    expect(options.body.get('text')).toBe('Привет'); expect(options.body.get('requestId')).toBe('key-1');
  });
  it('rejects login HTML instead of treating it as a successful request', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>Login</html>', { headers: { 'content-type': 'text/html' } })));
    await expect(requestJson('/api/test')).rejects.toMatchObject({ status: 401 });
  });
  it('preserves draft after a failure and reuses its key after remount', async () => {
    const sends = vi.fn().mockRejectedValueOnce(new Error('Network failed')).mockImplementation(() => Promise.resolve(json({ ok: true, messageIdx: 1 })));
    const fetcher = vi.fn((url: string, init?: RequestInit) => url.includes('/ui-lab-api/models') ? Promise.resolve(json({ models: [] })) : url.endsWith('/context') ? Promise.resolve(json({ budget: null })) : sends(url, init)); vi.stubGlobal('fetch', fetcher);
    const accepted = vi.fn(); const ui = render(<LiveComposer agentId="fixture" running={false} onAccepted={accepted} />);
    await userEvent.type(screen.getByRole('textbox'), 'Не потерять'); await userEvent.click(screen.getByRole('button', { name: 'Отправить сообщение' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Network failed'); expect(screen.getByRole('textbox')).toHaveTextContent('Не потерять');
    const firstKey = sends.mock.calls[0][1].headers['Idempotency-Key']; ui.unmount();
    render(<LiveComposer agentId="fixture" running={false} onAccepted={accepted} />);
    expect(screen.getByRole('textbox')).toHaveTextContent('Не потерять');
    await userEvent.click(screen.getByRole('button', { name: 'Отправить сообщение' }));
    await waitFor(() => expect(accepted).toHaveBeenCalledOnce());
    expect(sends.mock.calls[1][1].headers['Idempotency-Key']).toBe(firstKey); expect(screen.getByRole('textbox').textContent).toBe('');
  });
  it('merges refreshed tail without duplicates and keeps older pages', () => {
    const event = (idx: number, text: string) => ({ idx, text, ts: 1, type: 'assistant' });
    const page = { olderBefore: 2, events: [event(2, 'updated'), event(3, 'new')] } as EventPage;
    expect(mergeTail([event(1, 'older'), event(2, 'old')], page).map(item => item.text)).toEqual(['older', 'updated', 'new']);
  });
  it('does not execute raw server HTML or Markdown HTML', () => {
    render(<Transcript agentId="fixture" events={[{ idx: 0, ts: 1, type: 'assistant', text: '<script>bad()</script>\n\n**Hello**', html: '<img src=x onerror=bad()>' }]} page={null} hasOlder={false} loadingOlder={false} loadOlder={async () => {}} />);
    expect(screen.getByText('Hello')).toBeInTheDocument(); expect(document.querySelector('script')).toBeNull(); expect(document.querySelector('img')).toBeNull();
  });
});
