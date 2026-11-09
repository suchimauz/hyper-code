import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ToolBusyRow } from '../components/hyper/ToolBusyRow';
import type { ChatEvent } from '../lib/hyper';
afterEach(() => { cleanup(); vi.unstubAllGlobals(); document.querySelector('meta[name="csrf-token"]')?.remove(); });
const event: ChatEvent = { idx: 1, ts: 1, type: 'tool_busy', text: null, runId: 'exact', name: 'bash', subject: '<unsafe>', elapsedSec: 10, timeoutMs: 60000 };
test('does not abort on render; explicit action sends exact run with cookie CSRF and disables repeats', async () => {
  const meta = document.createElement('meta'); meta.name = 'csrf-token'; meta.content = 'csrf'; document.head.append(meta);
  const fetch = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json' } })); vi.stubGlobal('fetch', fetch);
  render(<ToolBusyRow event={event} agentId="a" />);
  expect(fetch).not.toHaveBeenCalled(); expect(screen.getByText('<unsafe>')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Остановить bash' }));
  await waitFor(() => expect(screen.getByRole('status').textContent).toContain('принят'));
  expect(fetch).toHaveBeenCalledTimes(1); expect(fetch.mock.calls[0]?.[0]).toBe('/agent/a/tool/exact/abort');
  expect(screen.queryByRole('button')).toBeNull();
});
test('stale or forbidden failures remain visible and do not auto retry', async () => {
  const meta = document.createElement('meta'); meta.name = 'csrf-token'; meta.content = 'csrf'; document.head.append(meta);
  const fetch = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 })); vi.stubGlobal('fetch', fetch);
  render(<ToolBusyRow event={event} agentId="a" />); fireEvent.click(screen.getByRole('button'));
  await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('forbidden')); expect(fetch).toHaveBeenCalledTimes(1);
});
test('aborted history and receipts lacking exact run are inert', () => {
  render(<ToolBusyRow event={{ ...event, type: 'tool_aborted' }} agentId="a" />); expect(screen.queryByRole('button')).toBeNull();
});
