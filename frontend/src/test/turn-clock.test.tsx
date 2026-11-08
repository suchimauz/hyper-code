import { describe, expect, test } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CurrentAction, turnClock } from '../components/hyper/CurrentAction';
import type { EventPage } from '../lib/hyper';

const page: EventPage = { agentId: 'fixture', events: [], olderBefore: null, hasOlder: false, isRunning: true, runState: 'running', lastError: null, partial: null };

describe('dsh whole-turn clock', () => {
  test('floors seconds, starts at one, formats minutes and hours without spaces', () => {
    expect(turnClock(1000, 1000)).toBe('1s');
    expect(turnClock(1000, 2999)).toBe('1s');
    expect(turnClock(1000, 61000)).toBe('1m0s');
    expect(turnClock(1000, 3601000)).toBe('1h0m0s');
    expect(turnClock(1000, 3662000)).toBe('1h1m1s');
    expect(turnClock(2000, 1000)).toBe('1s');
    expect(turnClock(null, 1000)).toBe('');
    expect(turnClock(NaN, 1000)).toBe('');
  });
  test('does not mistake an activity timestamp for a whole-turn clock', () => {
    const html = renderToStaticMarkup(<CurrentAction page={{ ...page, activityStartedAt: 1000, thinking: { startedAt: 2000 } }} />);
    expect(html).not.toContain('current-action-clock');
  });
  test('tools, thinking and writing preserve the same turn clock', () => {
    const turnStartedAt = Date.now() - 125000;
    const phases: Partial<EventPage>[] = [
      { thinking: { startedAt: Date.now() } },
      { activeTools: [{ id: 'test', name: 'read', subject: 'file', state: 'stopping', startedAt: Date.now(), tail: '' }] },
      { partial: { text: 'draft', startedAt: Date.now(), revision: 1 } },
    ];
    for (const phase of phases) expect(renderToStaticMarkup(<CurrentAction page={{ ...page, ...phase, turnStartedAt }} />)).toContain('2m5s');
    expect(renderToStaticMarkup(<CurrentAction page={{ ...page, turnStartedAt, isRunning: false }} />)).not.toContain('current-action-clock');
    expect(renderToStaticMarkup(<CurrentAction page={{ ...page, agentId: 'other' }} />)).not.toContain('current-action-clock');
  });
});
