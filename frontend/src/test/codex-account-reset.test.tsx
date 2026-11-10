import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CodexAccountReset } from '../components/settings/CodexAccountReset';

const response = (body: object, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
beforeEach(() => sessionStorage.clear());
afterEach(() => { cleanup(); vi.restoreAllMocks(); sessionStorage.clear(); });
function preview() { fireEvent.click(screen.getByRole('button', { name: 'Reset Codex quota…' })); }
function authorize() { fireEvent.click(screen.getByRole('checkbox', { name: 'I authorize spending one reset credit for this account.' })); }

it('previews the exact account and finite-credit consequence; cancel never calls the endpoint', () => {
  const fetcher = vi.spyOn(globalThis, 'fetch');
  render(<CodexAccountReset account="work" csrfToken="cookie-token" />);
  preview();
  expect(screen.getByText('work')).toBeInTheDocument();
  expect(screen.getByText(/spends one finite reset credit and cannot be undone/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Spend credit and reset' })).toBeDisabled();
  authorize(); fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(fetcher).not.toHaveBeenCalled();
  preview(); expect(screen.getByRole('checkbox')).not.toBeChecked();
});

it('explicit confirmation sends only the authoritative payload with cookie CSRF and displays backend outcome', async () => {
  const key = '11111111-2222-4333-8444-555555555555';
  vi.spyOn(crypto, 'randomUUID').mockReturnValue(key);
  const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response({ outcome: 'reset', windowsReset: 2 }));
  render(<CodexAccountReset account="work" csrfToken="cookie-token" />);
  preview(); authorize(); fireEvent.click(screen.getByRole('button', { name: 'Spend credit and reset' }));
  await screen.findByText('Codex quota reset completed.');
  expect(fetcher).toHaveBeenCalledTimes(1);
  const [url, init] = fetcher.mock.calls[0]!;
  expect(url).toBe('/llms/codex/reset');
  expect(init?.method).toBe('POST');
  expect(init?.headers).toMatchObject({ 'Content-Type': 'application/json', 'X-CSRF-Token': 'cookie-token' });
  expect(JSON.parse(init?.body as string)).toEqual({ account: 'work', confirmed: true, idempotencyKey: key });
  expect(sessionStorage.getItem('mauzcode.codex-reset.pending:work')).toBeNull();
});

it('keeps retry identity across failure, cancellation and remount; no automatic retry', async () => {
  const fetcher = vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('connection lost')).mockResolvedValue(response({ outcome: 'alreadyRedeemed', windowsReset: null }));
  const first = render(<CodexAccountReset account="work" csrfToken="old-token" />);
  preview(); authorize(); fireEvent.click(screen.getByRole('button', { name: 'Spend credit and reset' }));
  await screen.findByRole('alert');
  expect(fetcher).toHaveBeenCalledTimes(1);
  const key = JSON.parse(fetcher.mock.calls[0]![1]!.body as string).idempotencyKey;
  expect(sessionStorage.getItem('mauzcode.codex-reset.pending:work')).toBe(key);
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' })); first.unmount();
  render(<CodexAccountReset account="work" csrfToken="fresh-token" />);
  preview(); authorize(); fireEvent.click(screen.getByRole('button', { name: 'Spend credit and reset' }));
  await screen.findByText('This reset attempt was already redeemed.');
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(JSON.parse(fetcher.mock.calls[1]![1]!.body as string)).toEqual({ account: 'work', confirmed: true, idempotencyKey: key });
  expect(fetcher.mock.calls[1]![1]!.headers).toMatchObject({ 'X-CSRF-Token': 'fresh-token' });
});

it('blocks duplicate confirmation while pending and reports no credit without claiming a reset', async () => {
  let finish!: (response: Response) => void;
  const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  render(<CodexAccountReset account="default" csrfToken="token" />);
  preview(); authorize(); fireEvent.click(screen.getByRole('button', { name: 'Spend credit and reset' }));
  expect(screen.getByRole('button', { name: 'Resetting…' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Resetting…' }));
  expect(fetcher).toHaveBeenCalledTimes(1);
  finish(response({ outcome: 'noCredit', windowsReset: null }));
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('No reset credit is available.'));
});
