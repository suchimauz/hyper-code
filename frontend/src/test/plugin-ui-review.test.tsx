import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PluginUiReview } from '../components/mauzcode/PluginUiReview';

const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it('shows pending plugin UI grants and approves the exact hash with CSRF', async () => {
  const hash = 'a'.repeat(16);
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => String(url).includes('/approve')
    ? json({ name: 'demo', hash, approved: true })
    : json({ apiVersion: 1, plugins: [], csrfToken: 'tok', pending: [{ name: 'demo', source: 'user', hash, grants: { pages: ['main'], panels: [], actions: [], canvasKinds: [] }, error: null, reason: 'unapproved' }, { name: 'broken', source: 'user', hash: null, grants: {}, error: 'may import only react', reason: 'failed' }] }));
  render(<PluginUiReview />);
  expect(await screen.findByText(/pages: main/)).toBeTruthy();
  expect(screen.getByText('may import only react')).toBeTruthy();
  expect(screen.getAllByRole('button', { name: 'Approve' })).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
  await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/plugins/ui/approve'))).toBe(true));
  const [, init] = fetchMock.mock.calls.find(([url]) => String(url).includes('/plugins/ui/approve'))!;
  expect(init?.method).toBe('POST');
  expect(JSON.parse(String(init?.body))).toEqual({ name: 'demo', hash, revoke: false });
  expect(new Headers(init?.headers).get('X-CSRF-Token')).toBe('tok');
});
