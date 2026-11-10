import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { NodeSettings } from '../components/settings/NodeSettings';

afterEach(() => { vi.unstubAllGlobals(); });

function setup(response: object = { ok: true }, status = 200) {
  const fetch = vi.fn(async () => Response.json(response, { status }));
  vi.stubGlobal('fetch', fetch);
  const reload = vi.fn(async () => {});
  render(<NodeSettings nodes={[]} clients={[{ id: 'client-1', name: 'Work laptop', providers: ['codex'], requests: 2, tokenHint: '…1234' }]} csrfToken="node-csrf" reload={reload} />);
  fireEvent.click(screen.getByText('MauzCode nodes and sharing (0)'));
  return { fetch, reload };
}

it('reviews an exact client grant before issuing it with confirmation and CSRF', async () => {
  const { fetch, reload } = setup({ token: 'new-client-secret', url: 'https://mauzcode.example/node/v1' });
  fireEvent.change(screen.getByLabelText('Client name'), { target: { value: 'Home' } });
  fireEvent.change(screen.getByLabelText(/Providers \(comma/), { target: { value: 'codex, opencode' } });
  fireEvent.click(screen.getByRole('button', { name: 'Review token' }));
  expect(fetch).not.toHaveBeenCalled();
  expect(screen.getByRole('region', { name: 'Confirm sharing change' })).toHaveTextContent('Issue a token for Home? Grants access to codex, opencode.');
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(fetch).not.toHaveBeenCalled();
  expect(screen.queryByRole('region', { name: 'Confirm sharing change' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Review token' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm issue token' }));
  await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
  expect(fetch).toHaveBeenCalledExactlyOnceWith('/llms/settings', expect.objectContaining({
    method: 'POST', headers: expect.objectContaining({ 'X-CSRF-Token': 'node-csrf' }),
    body: JSON.stringify({ action: 'client-issue', name: 'Home', providers: ['codex', 'opencode'], confirmed: true }),
  }));
  const issued = screen.getByRole('region', { name: 'New client token' });
  expect(within(issued).getByLabelText('Token')).toHaveAttribute('type', 'password');
  expect(within(issued).getByLabelText('Token')).toHaveValue('new-client-secret');
  fireEvent.click(within(issued).getByRole('button', { name: 'Dismiss token' }));
  expect(screen.queryByRole('region', { name: 'New client token' })).not.toBeInTheDocument();
});

it('does not revoke until confirmed, then sends the client identity and CSRF token', async () => {
  const { fetch, reload } = setup();
  fireEvent.click(screen.getByRole('button', { name: 'Revoke Work laptop' }));
  expect(fetch).not.toHaveBeenCalled();
  expect(screen.getByRole('region', { name: 'Confirm sharing change' })).toHaveTextContent('Revoke Work laptop?');
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(fetch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Revoke Work laptop' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm revoke' }));
  await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
  expect(fetch).toHaveBeenCalledExactlyOnceWith('/llms/settings', expect.objectContaining({
    method: 'POST', headers: expect.objectContaining({ 'X-CSRF-Token': 'node-csrf' }),
    body: JSON.stringify({ action: 'client-revoke', id: 'client-1', name: 'Work laptop', confirmed: true }),
  }));
});

it('surfaces rejected node writes and clears the submitted credential without reloading', async () => {
  const { fetch, reload } = setup({ error: 'Invalid CSRF token' }, 403);
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'relay' } });
  fireEvent.change(screen.getByLabelText('Node URL (ending in /node/v1)'), { target: { value: 'https://relay.example/node/v1' } });
  const token = screen.getByLabelText('Token (blank keeps the stored token)');
  fireEvent.change(token, { target: { value: 'node-secret' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save node' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Invalid CSRF token');
  expect(token).toHaveValue('');
  expect(reload).not.toHaveBeenCalled();
  expect(fetch).toHaveBeenCalledExactlyOnceWith('/llms/settings', expect.objectContaining({
    method: 'POST', headers: expect.objectContaining({ 'X-CSRF-Token': 'node-csrf' }),
    body: JSON.stringify({ action: 'node-save', name: 'relay', url: 'https://relay.example/node/v1', token: 'node-secret' }),
  }));
});
