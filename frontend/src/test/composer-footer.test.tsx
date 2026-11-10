import { afterEach, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ComposerFooter } from '../components/mauzcode/ComposerFooter';
import { LiveComposer } from '../components/mauzcode/LiveComposer';
vi.mock('../lib/goal', async importOriginal => ({ ...await importOriginal<typeof import('../lib/goal')>(), getGoal: vi.fn().mockResolvedValue({ version: 1, enabled: false }) }));
vi.mock('../lib/queue', async importOriginal => ({ ...await importOriginal<typeof import('../lib/queue')>(), getQueue: vi.fn().mockResolvedValue({ items: [] }) }));
const json = (body: object) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
afterEach(() => { vi.unstubAllGlobals(); sessionStorage.clear(); });
it('shows real context percentage and delegates the plus button to the shared menu', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => json({ budget: { estimatedTokens: 8000, contextWindow: 200000 } })));
  const toggle = vi.fn();
  const ui = render(<ComposerFooter agentId="fixture" busy={false} running={false} revision={0} onMenuToggle={toggle} menuOpen={false} />);
  expect(await screen.findByText('4%')).toBeInTheDocument();
  const plus = screen.getByRole('button', { name: 'Добавить' });
  expect(plus).toHaveAttribute('aria-haspopup', 'listbox');
  expect(plus).toHaveAttribute('aria-expanded', 'false');
  plus.focus(); await userEvent.keyboard('{Enter}');
  expect(toggle).toHaveBeenCalledOnce();
  ui.rerender(<ComposerFooter agentId="fixture" busy={false} running={false} revision={0} onMenuToggle={toggle} menuOpen />);
  expect(plus).toHaveAttribute('aria-expanded', 'true');
  expect(screen.queryByRole('menu')).toBeNull();
});
it('shows unavailable context honestly and disables plus while busy', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => json({ budget: null })));
  const toggle = vi.fn();
  render(<ComposerFooter agentId="fixture" busy running revision={0} onMenuToggle={toggle} />);
  expect(screen.getByRole('button', { name: /Оценка контекста недоступна/ })).toHaveTextContent('—');
  expect(screen.getByRole('button', { name: 'Добавить' })).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: 'Добавить' }));
  expect(toggle).not.toHaveBeenCalled();
});
it('sends a file-only turn and preserves the same request key on retry', async () => {
  let count = 0; const bodies: RequestInit[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    if (url.includes('/ui-lab-api/models')) return json({ models: [] });
    if (url.endsWith('/context')) return json({ budget: null });
    bodies.push(init); if (count++ === 0) throw new Error('Offline'); return json({ ok: true });
  }));
  const accepted = vi.fn(); render(<LiveComposer agentId="files" running={false} onAccepted={accepted} />);
  await userEvent.upload(screen.getByLabelText('Добавить файлы'), new File(['hello'], 'hello.txt', { type: 'text/plain' }));
  await userEvent.click(screen.getByRole('button', { name: 'Отправить сообщение' }));
  await screen.findByRole('alert');
  await userEvent.click(screen.getByRole('button', { name: 'Отправить сообщение' }));
  await waitFor(() => expect(accepted).toHaveBeenCalledOnce());
  expect((bodies[0].body as FormData).get('files')).toBeInstanceOf(File);
  expect(new Headers(bodies[0].headers).get('Idempotency-Key')).toBe(new Headers(bodies[1].headers).get('Idempotency-Key'));
});
