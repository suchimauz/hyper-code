import type { ContextBudget, ContextDetails } from '../../lib/hyper';
const compact = (n: number | null | undefined) => n == null ? 'Нет замера' : n >= 1e6 ? `${+(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${+(n / 1e3).toFixed(1)}K` : `${Math.round(n)}`;
const duration = (n: number | null | undefined) => n == null ? 'Нет замера' : n < 60000 ? `${+(n / 1000).toFixed(1)}s` : `${Math.floor(Math.round(n / 1000) / 60)}m${Math.round(n / 1000) % 60}s`;
const tokens = (n: number | null | undefined) => n == null ? 'Нет замера' : `${n.toLocaleString('en-US')} tok`;
/** dsh context metrics with explicit coverage for measurements absent from older history. */
export function ContextDetailsPanel({ budget, details }: { budget: ContextBudget | null; details: ContextDetails | null }) {
  const used = budget ? budget.usedTokens ?? budget.estimatedTokens : 0;
  const exact = budget?.usedSource === 'provider';
  const percent = budget?.contextWindow ? Math.round(used / budget.contextWindow * 100) : null;
  const breakdown = details?.breakdown;
  const rows = [ { label: 'System prompt', value: breakdown?.systemPrompt, color: '#94a3b8' }, { label: 'Tool definitions', value: breakdown?.toolDefinitions, color: '#a78bfa' }, { label: 'Messages', value: breakdown?.messages, color: '#60a5fa' } ];
  const total = rows.reduce((sum, row) => sum + (row.value ?? 0), 0);
  const coverage = details?.coverage;
  const partial = coverage && (coverage.timedRequests < coverage.requests || coverage.cacheRequests < coverage.requests || coverage.timedTools < coverage.tools);
  const stats = [ ['LLM time', duration(details?.session.llmTimeMs)], ['Tool time', duration(details?.session.toolTimeMs)], ['Avg time to first token (TTFT)', duration(details?.session.avgTtftMs)], ['Tokens per second (TPS)', details?.session.tokensPerSecond == null ? 'Нет замера' : `${+details.session.tokensPerSecond.toFixed(1)} tok/s`] ];
  const usage = [ ['Cache hit', details?.usage.cacheHitRatio == null ? 'Нет замера' : `${Math.round(details.usage.cacheHitRatio * 100)}%`], ['Uncached input', tokens(details?.usage.uncachedInputTokens)], ['Cached input', tokens(details?.usage.cachedInputTokens)], ...(details?.usage.cacheWriteTokens ? [['Cache write', tokens(details.usage.cacheWriteTokens)]] : []), ['Output', tokens(details?.usage.outputTokens)], ...(details?.usage.costUsd != null ? [['Cost (API est.)', `$${details.usage.costUsd.toFixed(2)}`]] : []) ];
  return <>
    <div className="context-panel-header"><strong>{percent == null ? 'н/д' : `${percent}%`}</strong><span>of context used</span><strong className="context-panel-figures">{budget ? `${exact ? '' : '~'}${compact(used)} / ${compact(budget.contextWindow)}` : 'н/д'}</strong></div>
    <div className="context-panel-bar">{rows.map(row => row.value != null && <span key={row.label} style={{ background: row.color, width: `${total ? Math.min(100, percent ?? 0) * row.value / total : 0}%` }} />)}</div>
    <dl className="context-panel-rows">{rows.map(row => <div key={row.label}><dt><i style={{ background: row.color }} />{row.label}</dt><dd>{row.value == null ? 'Нет замера' : `~${compact(row.value)}`}</dd></div>)}</dl>
    <div className="context-panel-stats">{[{ title: 'Session statistics', rows: stats }, { title: 'Token usage', rows: usage }].map(group => <section key={group.title}><h4>{group.title}</h4><dl>{group.rows.map(([label, value]) => <div key={label}><dt title={label}>{label}</dt><dd title={value === 'Нет замера' ? 'В старой истории или ответе провайдера нет этого замера' : undefined}>{value}</dd></div>)}</dl></section>)}</div>
    <p className="context-panel-note">{exact ? 'Контекст — последний запрос по данным провайдера плюс оценка новых сообщений; разбивка — оценка.' : 'Контекст — оценка следующего запроса.'} TPS — output / время генерации после первого токена. {partial && `Неполная история: время LLM ${coverage.timedRequests}/${coverage.requests}, TTFT ${coverage.ttftRequests}/${coverage.requests}, кэш ${coverage.cacheRequests}/${coverage.requests}, инструменты ${coverage.timedTools}/${coverage.tools}. Суммы относятся только к измеренным запросам.`}</p>
  </>;
}
