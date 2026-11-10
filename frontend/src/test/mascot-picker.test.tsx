import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MascotPicker } from '../components/mauzcode/MascotPicker';
import { readNewSessionDraft, persistNewSessionDraft, submitNewSession } from '../lib/newSession';
import { normalizeMascotChoice } from '../lib/mascots';
afterEach(() => { sessionStorage.clear(); vi.unstubAllGlobals(); });
it('defaults to random, offers eight named pets and reports selection', async () => {
  const change = vi.fn(); render(<MascotPicker disabled={false} onChange={change} />);
  expect(screen.getByRole('button')).toHaveTextContent('Случайный питомец');
  fireEvent.click(screen.getByRole('button'));
  const options = await screen.findAllByRole('menuitemradio'); expect(options).toHaveLength(9);
  fireEvent.click(screen.getByRole('menuitemradio', { name: 'Planet' }));
  expect(change).toHaveBeenCalledWith('planet');
});
it('keeps pending requests locked', () => { render(<MascotPicker disabled value="bitty" onChange={vi.fn()} />); expect(screen.getByRole('button')).toBeDisabled(); });
it('persists only the current draft choice, new drafts default to random', () => {
  expect(readNewSessionDraft().mascot).toBe('random');
  persistNewSessionDraft({ ...readNewSessionDraft(), mascot: 'tmuxai' });
  expect(readNewSessionDraft().mascot).toBe('tmuxai'); sessionStorage.clear();
  expect(readNewSessionDraft().mascot).toBe('random'); expect(normalizeMascotChoice('bogus')).toBe('random');
});
it('sends explicit choice in JSON and multipart, defaulting missing choice to random', async () => {
  const fetcher = vi.fn().mockResolvedValue({ ok: true, headers: new Headers({ 'content-type': 'application/json' }), json: async () => ({ agentId: 'new', status: 'sent' }) }); vi.stubGlobal('fetch', fetcher);
  const draft = { ...readNewSessionDraft(), mascot: 'planet' as const, text: 'hello' };
  await submitNewSession(draft, 'csrf');
  expect(JSON.parse(fetcher.mock.calls[0][1].body).mascot).toBe('planet');
  await submitNewSession(draft, 'csrf', [new File(['a'], 'a.txt')]);
  expect(fetcher.mock.calls[1][1].body.get('mascot')).toBe('planet');
  await submitNewSession({ ...draft, mascot: undefined }, 'csrf');
  expect(JSON.parse(fetcher.mock.calls[2][1].body).mascot).toBe('random');
});
