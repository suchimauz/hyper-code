import { afterEach, expect, test } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TranscriptMessage } from '../components/hyper/TranscriptMessage';
import type { ChatEvent } from '../lib/hyper';
afterEach(cleanup);
const event: ChatEvent = { idx: 1, ts: 1, type: 'user', text: 'Hello', messageIdx: 1, author: { id: 'person', name: 'Jane Doe', initials: 'JD', hue: 120, picture: 'https://example.com/avatar.png' } };
test('native human attribution includes visible name and decorative private-loading photo', () => {
  const { container } = render(<TranscriptMessage event={event} agentId="a" />);
  expect(screen.getByText('Jane Doe')).toBeTruthy();
  const img = container.querySelector('img')!;
  expect(img.getAttribute('src')).toBe('https://example.com/avatar.png');
  expect(img.getAttribute('alt')).toBe('');
  expect(img.getAttribute('referrerpolicy')).toBe('no-referrer');
  expect(img.getAttribute('loading')).toBe('lazy');
  fireEvent.error(img);
  expect(container.querySelector('img')).toBeNull();
  expect(screen.getByText('JD').getAttribute('aria-hidden')).toBe('true');
  expect(screen.getByText('Hello')).toBeTruthy();
});
test.each(['javascript:alert(1)', 'data:image/svg+xml,<svg onload="alert(1)"/>', 'http://example.com/avatar.png', '//example.com/avatar.png', '/avatar.png', 'https://user:password@example.com/avatar.png', 'not a URL', null])('unsafe or missing avatar falls back to initials: %s', picture => {
  const { container } = render(<TranscriptMessage event={{ ...event, author: { ...event.author!, picture } }} agentId="a" />);
  expect(container.querySelector('img')).toBeNull();
  expect(screen.getByText('JD')).toBeTruthy();
});
test('names and initials are text, never HTML; invalid hue cannot inject CSS', () => {
  const name = '<img src=x onerror=alert(1)>';
  const { container } = render(<TranscriptMessage event={{ ...event, author: { ...event.author!, name, initials: '<svg>', picture: null, hue: NaN } }} agentId="a" />);
  expect(screen.getByText(name)).toBeTruthy();
  expect(screen.getByText('<svg>')).toBeTruthy();
  expect(container.querySelector('img, script, .user-message-author svg')).toBeNull();
  expect(container.querySelector('.user-message-initials')?.getAttribute('style')).not.toContain('NaN');
});
test.each([
  { type: 'assistant' }, { type: 'system' }, { navigationEligible: false },
  { author: { ...event.author!, id: 'agent:peer', kind: 'agent' as const } },
  { author: { ...event.author!, id: 'agent:legacy-peer' } }, { author: null },
])('non-human or anonymous events do not gain human attribution: %j', patch => {
  const { container } = render(<TranscriptMessage event={{ ...event, ...patch }} agentId="a" />);
  expect(container.querySelector('.user-message-author')).toBeNull();
});
