import { useEffect, useState } from 'react';
import type { EventPage } from '../../lib/hyper';
import { ToolShimmer } from './ToolShimmer';
import { WaitLoader } from './WaitLoader';

/** Format the dsh whole-turn wall clock, including provider and tool waits. */
export function turnClock(start: number | null | undefined, now: number): string {
  if (start == null || !Number.isFinite(start)) return '';
  const seconds = Math.max(1, Math.floor((now - start) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds / 60) % 60;
  return `${hours > 0 ? `${hours}h` : ''}${seconds >= 60 ? `${minutes}m` : ''}${seconds % 60}s`;
}

/** A known turn start survives action changes and remounts; never invent one. */
export function CurrentAction({ page }: { page: EventPage }) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    setNow(Date.now());
    if (!page.isRunning) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [page.agentId, page.turnStartedAt, page.isRunning]);
  const run = page.activeTools?.[0];
  const label = run ? run.state === 'stopping' ? 'Stopping…' : 'Running tools…' : page.thinking ? 'Thinking…' : page.partial ? 'Writing…' : 'Thinking…';
  const clock = page.isRunning ? turnClock(page.turnStartedAt, now) : '';
  return <div className="tool-row current-action" data-state="running">
    <WaitLoader />
    <ToolShimmer className="current-action-label" text={label} />
    {clock && <span className="current-action-clock" title="Время текущего хода, включая ожидание">{clock}</span>}
    <span className="sr-only" role="status">{label}</span>
  </div>;
}
