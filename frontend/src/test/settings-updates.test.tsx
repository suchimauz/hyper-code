import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { UpdatesPanel } from '../components/settings/UpdatesPanel';
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const statusBody = { csrfToken: 'cookie-token', status: { state: 'available', message: 'Ready', current: 'old', target: 'new', clean: true } };

test('updates panel requires a separate confirmation and sends the displayed target', async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(url.includes('/apply') ? { message: 'Staged' } : statusBody), { headers: { 'Content-Type': 'application/json' } });
  }));
  render(<UpdatesPanel />);
  await screen.findByText('Ready');
  fireEvent.click(screen.getByRole('button', { name: 'Update and restart…' }));
  expect(calls.filter(c => c.init?.method === 'POST')).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', { name: 'Confirm update and restart' }));
  await waitFor(() => expect(calls.filter(c => c.init?.method === 'POST')).toHaveLength(1));
  const sent = calls.find(c => c.init?.method === 'POST')!;
  expect(JSON.parse(String(sent.init?.body))).toEqual({ confirmed: true, target: 'new' });
  expect(new Headers(sent.init?.headers).get('X-CSRF-Token')).toBe('cookie-token');
});

test('updates panel shows an update button only when an update is available', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ...statusBody, status: { ...statusBody.status, state: 'current', message: 'Up to date', target: undefined } }), { headers: { 'Content-Type': 'application/json' } })));
  render(<UpdatesPanel />);
  await screen.findByText('Up to date');
  expect((screen.getByRole('button', { name: 'Update and restart…' }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText('Up to date').className).toContain('is-success');
});

test('checking upstream spins and leaves a single status card', async () => {
  const body = () => new Response(JSON.stringify({ ...statusBody, status: { ...statusBody.status, state: 'current', message: 'Up to date', target: undefined } }), { headers: { 'Content-Type': 'application/json' } });
  let release!: (value: Response) => void;
  const gate = new Promise<Response>(resolve => { release = resolve; });
  let call = 0;
  vi.stubGlobal('fetch', vi.fn(async () => (call++ === 0 ? body() : gate)));
  render(<UpdatesPanel />);
  await screen.findByText('Up to date');
  fireEvent.click(screen.getByRole('button', { name: 'Check upstream' }));
  await screen.findByText('Checking…');
  expect(document.querySelector('.settings-spinner')).toBeTruthy();
  release(body());
  await waitFor(() => expect(screen.queryByText('Checking…')).toBeNull());
  expect(screen.getAllByText('Up to date')).toHaveLength(1);
});
