import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Tooltip } from '@base-ui/react/tooltip';
import './navigation-tooltip.css';
import { compactCount, getWelcomeStats, heatmapDays, type StatsRange, type WelcomeStats } from '../../lib/welcomeStats';
import { ApiError } from '../../lib/hyper';
import './new-session-welcome.css';

/** New-session greeting and owner-scoped Hyper usage. Opening this surface never creates an agent. */
export function NewSessionWelcome({ userName }: { userName: string }) {
  const [tab, setTab] = useState<'overview' | 'models'>('overview');
  const [range, setRange] = useState<StatsRange>('all');
  const [stats, setStats] = useState<WelcomeStats | null>(null);
  const cached = useRef<Partial<Record<StatsRange, WelcomeStats>>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let busy = false; let polls = 0;
    setStats(cached.current[range] ?? null); setError('');
    const refresh = async () => {
      if (busy || controller.signal.aborted) return;
      clearTimeout(timer);
      if (document.hidden) return;
      busy = true;
      try {
        const value = await getWelcomeStats(range, controller.signal);
        if (controller.signal.aborted) return;
        cached.current[range] = value; setStats(value); setError(''); setRefreshing(!!value.refreshing);
        // A stale response is usable immediately. Fetch the finished snapshot without blanking it.
        const soon = value.refreshing && polls++ < 30;
        timer = setTimeout(() => { void refresh(); }, soon ? 1000 : 45000);
      } catch (reason) {
        if (controller.signal.aborted) return;
        if (reason instanceof ApiError && [401, 403].includes(reason.status)) { cached.current = {}; setStats(null); }
        setError(reason instanceof Error ? reason.message : 'Statistics unavailable'); setRefreshing(false);
      } finally { busy = false; }
    };
    const visible = () => { if (!document.hidden) { polls = 0; void refresh(); } };
    document.addEventListener('visibilitychange', visible);
    void refresh();
    return () => { controller.abort(); clearTimeout(timer); document.removeEventListener('visibilitychange', visible); };
  }, [range, retry]);
  const values = [
    ['Sessions', stats?.sessions.toLocaleString('en-US')], ['Messages', stats?.messages.toLocaleString('en-US')],
    ['Total tokens', stats && compactCount(stats.totalTokens)], ['Active days', stats?.activeDays.toLocaleString('en-US')],
    ['Peak hour', stats?.peakHour == null ? '—' : `${stats.peakHour % 12 || 12} ${stats.peakHour < 12 ? 'AM' : 'PM'}`],
    ['Favorite model', stats?.favoriteModel || '—'],
  ];
  return <div className="new-session-welcome">
    <h1 className="new-session-greeting"><span className="brand-mark" aria-hidden="true">h</span><span>What's up next{userName.trim() ? `, ${userName.trim()}` : ''}?</span></h1>
    <section className="welcome-stats" aria-label="Usage statistics" aria-busy={!stats && !error}>
      <header className="welcome-stats-head">
        <div className="welcome-switch" aria-label="Statistics view">
          <button type="button" aria-pressed={tab === 'overview'} onClick={() => setTab('overview')}>Overview</button>
          <button type="button" aria-pressed={tab === 'models'} onClick={() => setTab('models')}>Models</button>
        </div>
        <div className="welcome-switch" aria-label="Statistics period">{(['all', '30d', '7d'] as const).map(value => <button key={value} type="button" aria-pressed={range === value} onClick={() => setRange(value)}>{value === 'all' ? 'All' : value}</button>)}</div>
      </header>
      {error && <div className="welcome-stats-error" role="alert">{error}<button type="button" onClick={() => setRetry(value => value + 1)}>Retry</button></div>}
      {(!error || stats) && <>
        {tab === 'overview' ? <>
          <div className="welcome-stat-grid">{values.map(([label, value]) => <div className="welcome-stat" key={label}>
            <span className="welcome-stat-label">{label}</span><span className="welcome-stat-value" data-model={label === 'Favorite model' || undefined} data-loading={!stats || undefined} title={value || undefined}>{stats ? value : <span className="welcome-skeleton" />}</span>
          </div>)}</div>
          {stats ? <Heatmap stats={stats} /> : <div className="welcome-heat" aria-label="Loading statistics">{Array.from({ length: 182 }, (_, i) => <span className="welcome-heat-cell" key={i} />)}</div>}
          <div className="welcome-stats-note" title="Tokens include only recorded usage. Historical coverage may be incomplete. Models are attributed to the session’s current model.">{stats ? `UTC · ${range === 'all' ? 'All time' : `Last ${range === '7d' ? '7' : '30'} days`} · Recorded usage only${refreshing ? ' · Updating…' : ''}` : 'Loading statistics…'}</div>
        </> : stats ? <>
          <ModelChart stats={stats} />
          <div className="welcome-models">{(expanded ? stats.models : stats.models.slice(0, 5)).map((model, index) => <div className="welcome-model" key={model.model} title={model.model}>
            <span className="welcome-model-swatch" style={rankStyle(index)} /><span className="welcome-model-name">{model.model}</span>
            <span className="welcome-model-split">{compactCount(model.inputTokens)} in · {compactCount(model.outputTokens)} out</span>
            <span>{model.totalTokens != null && stats.totalTokens ? `${(model.totalTokens / stats.totalTokens * 100).toFixed(1)}%` : '—'}</span>
          </div>)}</div>
          {stats.models.length > 5 && <button className="welcome-model-more" type="button" onClick={() => setExpanded(value => !value)}>{expanded ? 'Show less' : `Show ${stats.models.length - 5} more`}</button>}
          {!stats.models.length && <p className="welcome-stats-note">No model usage recorded for this period.</p>}
        </> : <p className="welcome-stats-note" role="status">Loading statistics…</p>}
      </>}
    </section>
  </div>;
}
function Heatmap({ stats }: { stats: WelcomeStats }) {
  const days = heatmapDays(stats);
  const max = Math.max(1, ...days.map(day => day.messages));
  return <div className="welcome-heat" role="img" aria-label="Daily message activity over the last 26 weeks, UTC">{days.map(day => <Tooltip.Root key={day.date} disableHoverablePopup>
    <Tooltip.Trigger delay={0} closeDelay={0} render={<span className="welcome-heat-cell" data-level={day.messages ? Math.max(1, Math.ceil(day.messages / max * 4)) : 0} />} />
    <Tooltip.Portal><Tooltip.Positioner side="top" sideOffset={6} collisionPadding={8} className="navigation-tooltip-positioner">
      <Tooltip.Popup role="tooltip" className="navigation-tooltip welcome-heat-tooltip">
        <div className="welcome-heat-tooltip-date">{day.date}</div>
        <div>{day.messages.toLocaleString('en-US')} messages · {compactCount(day.totalTokens)} tokens</div>
      </Tooltip.Popup>
    </Tooltip.Positioner></Tooltip.Portal>
  </Tooltip.Root>)}</div>;
}
function rankStyle(index: number): CSSProperties { return { '--model-opacity': Math.max(.2, 1 - index * .2) } as CSSProperties; }
function ModelChart({ stats }: { stats: WelcomeStats }) {
  const days = stats.daily.filter(day => day.totalTokens != null && day.totalTokens > 0);
  const max = Math.max(1, ...days.map(day => day.totalTokens || 0));
  const ceiling = Math.ceil(max / 10 ** Math.floor(Math.log10(max))) * 10 ** Math.floor(Math.log10(max));
  return <div className="welcome-chart" role="img" aria-label="Daily token usage by model, UTC">
    <div className="welcome-chart-plot">
      {[0, 1, 2, 3, 4].map(i => <span key={i} className="welcome-chart-tick" style={{ bottom: `${i * 25}%` }}>{compactCount(ceiling * i / 4)}</span>)}
      <div className="welcome-chart-bars">{days.map(day => <div key={day.date} className="welcome-chart-column" title={`${day.date} · ${compactCount(day.totalTokens)} tokens`} style={{ height: `${(day.totalTokens || 0) / ceiling * 100}%` }}>
        {day.models?.length ? day.models.map(model => <span key={model.model} className="welcome-chart-segment" style={{ ...rankStyle(Math.max(0, stats.models.findIndex(row => row.model === model.model))), height: `${(model.totalTokens || 0) / (day.totalTokens || 1) * 100}%` }} />) : <span className="welcome-chart-segment" style={{ height: '100%' }} />}
      </div>)}</div>
    </div>
    <div className="welcome-chart-axis"><span>{days[0]?.date.slice(5)}</span><span>{days.length > 1 ? days.at(-1)?.date.slice(5) : ''}</span></div>
    {!days.length && <div className="welcome-stats-note">No measured token usage for this period.</div>}
  </div>;
}
