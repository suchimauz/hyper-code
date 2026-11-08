import { useEffect, useState } from 'react';

/** Compact elapsed duration; never derive completed timing from event timestamps. */
export function formatToolDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} мс`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} с`;
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)} мин ${seconds % 60} с`;
}

/** Only an explicitly supplied backend timeout is displayed, not a guessed default. */
export function ToolTiming({ startedAt, durationMs, timeoutMs }: { startedAt?: number; durationMs?: number | null; timeoutMs?: number | null }) {
  const [now, setNow] = useState(Date.now);
  const live = typeof startedAt === 'number' && Number.isFinite(startedAt);
  useEffect(() => {
    if (!live) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [live, startedAt]);
  const elapsed = live ? Math.max(0, now - startedAt!) : durationMs;
  const hasElapsed = typeof elapsed === 'number' && Number.isFinite(elapsed) && elapsed >= 0;
  const hasTimeout = typeof timeoutMs === 'number' && Number.isFinite(timeoutMs) && timeoutMs > 0;
  if (!hasElapsed && !hasTimeout) return null;
  const text = [hasElapsed ? formatToolDuration(elapsed) : '', hasTimeout ? `таймаут ${formatToolDuration(timeoutMs)}` : ''].filter(Boolean).join(' · ');
  return <span className="tool-row-timing" aria-label={`${live ? 'Прошло' : 'Длительность'}: ${text}`} title={`${live ? 'Прошло' : 'Длительность'}: ${text}`}>{text}</span>;
}
