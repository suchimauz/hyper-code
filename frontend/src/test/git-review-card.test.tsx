import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ cards: [] as { kind: string; component: unknown }[] }));
vi.mock('../extensions/pluginRuntime', () => ({ usePluginUi: () => ({ registry: { chatCards: mocks.cards } }) }));
import { GitReviewCard } from '../components/mauzcode/GitReviewCard';
import type { ChatEvent } from '../lib/mauzcode';

const reference = { version: 1 as const, host: 'box', dir: '/repo', count: 3, ids: ['a', 'b', 'c'] };
const event: ChatEvent = { idx: 42, ts: 1, type: 'user', text: 'Git review comments for box:/repo (3)', messageIdx: 40, gitReview: reference };
afterEach(() => { mocks.cards = []; document.documentElement.dataset.theme = ''; });

it('labels the card with its count and toggles details by keyboard-accessible disclosure', () => {
  const seen: unknown[] = [];
  mocks.cards = [{ kind: 'git.review', component: (props: unknown) => { seen.push(props); return <p>Plugin details</p>; } }];
  document.documentElement.dataset.theme = 'dark';
  render(<GitReviewCard event={event} reference={reference} agentId="ab" />);
  const toggle = screen.getByRole('button', { name: /Git review · 3/ });
  expect(toggle).toHaveTextContent('3 комментария · box:/repo');
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByText('Plugin details')).toBeNull();
  expect(seen).toHaveLength(0); // nothing is fetched while collapsed
  toggle.focus(); expect(toggle).toHaveFocus();
  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute('aria-expanded', 'true');
  expect(document.getElementById(toggle.getAttribute('aria-controls')!)).toBeVisible();
  expect(screen.getByText('Plugin details')).toBeVisible();
  expect(seen.at(-1)).toMatchObject({ eventIdx: 42, reference, context: { agentId: 'ab', theme: 'dark', readOnly: true } });
  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
});

it('falls back to a status note when the Git plugin UI is not granted or loaded, and isolates renderer failures', () => {
  const { unmount } = render(<GitReviewCard event={event} reference={reference} agentId="ab" />);
  fireEvent.click(screen.getByRole('button', { name: /Git review/ }));
  expect(screen.getByRole('status')).toHaveTextContent('интерфейс плагина Git не загружен');
  unmount();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  mocks.cards = [{ kind: 'git.review', component: () => { throw new Error('boom'); } }];
  render(<GitReviewCard event={event} reference={{ ...reference, host: 'local', count: 1 }} agentId="ab" />);
  const toggle = screen.getByRole('button', { name: /Git review · 1/ });
  expect(toggle).toHaveTextContent('1 комментарий · /repo');
  fireEvent.click(toggle);
  expect(screen.getByRole('alert')).toHaveTextContent('Расширение недоступно');
});

it('is reachable and operable by keyboard alone: Tab focus, Enter and Space toggle, collapsed details are hidden from AT', async () => {
  const user = userEvent.setup();
  mocks.cards = [{ kind: 'git.review', component: () => <button type="button">Inner action</button> }];
  render(<><button type="button">Before</button><GitReviewCard event={event} reference={reference} agentId="ab" /></>);
  screen.getByRole('button', { name: 'Before' }).focus();
  await user.tab();
  const toggle = screen.getByRole('button', { name: /Git review · 3/ });
  expect(toggle).toHaveFocus();
  expect(toggle.tagName).toBe('BUTTON'); expect(toggle).toHaveAttribute('type', 'button');
  const panel = document.getElementById(toggle.getAttribute('aria-controls')!)!;
  expect(panel).toHaveAttribute('hidden'); expect(screen.queryByRole('button', { name: 'Inner action' })).toBeNull();
  await user.keyboard('{Enter}');
  expect(toggle).toHaveAttribute('aria-expanded', 'true'); expect(panel).not.toHaveAttribute('hidden');
  expect(toggle).toHaveFocus(); // focus stays on the disclosure, not moved into details
  await user.tab();
  expect(screen.getByRole('button', { name: 'Inner action' })).toHaveFocus();
  await user.tab({ shift: true });
  await user.keyboard(' ');
  expect(toggle).toHaveAttribute('aria-expanded', 'false'); expect(panel).toHaveAttribute('hidden'); expect(toggle).toHaveFocus();
  expect(toggle.querySelectorAll('svg[aria-hidden="true"]').length).toBeGreaterThanOrEqual(2); // decorative icons excluded from the name
});

it('passes the live shell theme to plugin details and re-renders when the theme switches while expanded', async () => {
  const themes: string[] = [];
  mocks.cards = [{ kind: 'git.review', component: ({ context }: { context: { theme: string } }) => { themes.push(context.theme); return <p>Theme {context.theme}</p>; } }];
  document.documentElement.dataset.theme = 'light';
  render(<GitReviewCard event={event} reference={reference} agentId="ab" />);
  fireEvent.click(screen.getByRole('button', { name: /Git review/ }));
  expect(screen.getByText('Theme light')).toBeVisible();
  await act(async () => { document.documentElement.dataset.theme = 'dark'; await Promise.resolve(); });
  expect(screen.getByText('Theme dark')).toBeVisible();
  await act(async () => { document.documentElement.dataset.theme = 'light'; await Promise.resolve(); });
  expect(screen.getByText('Theme light')).toBeVisible();
  expect(themes.at(-1)).toBe('light'); expect(themes).toContain('dark');
});

it('declares focus-visible, reduced-motion and contrast rules using theme tokens (static stylesheet contract only)', () => {
  // jsdom (and css:false in vitest) cannot evaluate media queries, :focus-visible or computed colors; this guards the
  // rules' presence and token use only. Visual theme/motion rendering needs a real browser check.
  const css = readFileSync(resolve(__dirname, '../components/mauzcode/git-review-card.css'), 'utf8');
  expect(css).toMatch(/\.question-history-toggle:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--focus-ring\)/);
  expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{[^}]*transition:\s*none !important;[^}]*animation:\s*none !important;/);
  expect(css).toMatch(/@media \(prefers-contrast: more\)/);
  expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(/i); // colors come only from theme variables
  const plugin = readFileSync(resolve(__dirname, '../../../plugins/git/ui/reviewCard.tsx'), 'utf8');
  expect(plugin).not.toMatch(/transition|animation|@keyframes/); // plugin details are static, so reduced motion has nothing to disable
});
