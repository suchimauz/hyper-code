import { useEffect, useRef, useState } from 'react';
import { Activity } from 'lucide-react';
import { Dialog } from '../../sdk/components';
import { requestJson } from '../../sdk/api';
import './resource-monitor.css';

type Process = { pid: number; name: string; state: string; rss: number; cpu: number | null };
export type Metrics = { sampledAt: number; platform: string; cpu: number | null; cores: (number | null)[]; memory: { total: number; used: number; available: number }; swap: { total: number; used: number } | null; load: number[]; processes?: Process[]; processCount?: number; truncated?: boolean; processError?: string };
const percent = (value: number | null) => value === null ? '—' : `${value.toFixed(0)}%`;
const bytes = (value: number) => `${(value / 1024 ** 3).toFixed(1)} ГБ`;
export function ResourceMonitor({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [error, setError] = useState('');
  const [sort, setSort] = useState<{ key: keyof Process; descending: boolean }>({ key: 'cpu', descending: true });
  const row = useRef<HTMLButtonElement>(null);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    if (!row.current || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(entries => setVisible(entries.some(entry => entry.isIntersecting)));
    observer.observe(row.current); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let disposed = false;
    let controller: AbortController | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      if (disposed || document.hidden || (!visible && !open)) return;
      const request = new AbortController();
      controller = request;
      try {
        const data = await requestJson<Metrics>(`/serverMetrics/status${open ? '?details=1' : ''}`, { signal: request.signal });
        if (!disposed && !request.signal.aborted) { setMetrics(data); setError(''); }
      } catch (cause) {
        if (!disposed && !request.signal.aborted) setError(cause instanceof Error ? cause.message : 'Метрики недоступны');
      } finally { if (!disposed && !request.signal.aborted && !document.hidden) timer = setTimeout(() => { void poll(); }, 3000); }
    };
    const change = () => { clearTimeout(timer); controller?.abort(); if (!document.hidden) void poll(); };
    document.addEventListener('visibilitychange', change);
    void poll();
    return () => { disposed = true; clearTimeout(timer); controller?.abort(); document.removeEventListener('visibilitychange', change); };
  }, [open, visible]);
  const processes = [...(metrics?.processes ?? [])].sort((a, b) => {
    const left = a[sort.key], right = b[sort.key];
    if (left === null) return right === null ? a.pid - b.pid : 1;
    if (right === null) return -1;
    const comparison = typeof left === 'string' && typeof right === 'string' ? left.localeCompare(right) : Number(left) - Number(right);
    return (sort.descending ? -comparison : comparison) || a.pid - b.pid;
  });
  const cpu = percent(metrics?.cpu ?? null);
  const ram = metrics ? percent(100 * metrics.memory.used / metrics.memory.total) : '—';
  return <>
    <button ref={row} type="button" className="resource-monitor-row" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-label={`Ресурсы сервера. CPU ${cpu}, RAM ${ram}${error ? '. Метрики недоступны' : ''}`} title={compact ? `Сервер · CPU ${cpu} · RAM ${ram}` : undefined}>
      <Activity size={16} aria-hidden="true" />{!compact && <><span>Сервер</span><span className="resource-monitor-values">{error ? 'Недоступно' : `CPU ${cpu} · RAM ${ram}`}</span></>}
    </button>
    <Dialog open={open} onOpenChange={setOpen} title="Ресурсы сервера" closeLabel="Закрыть">
      <div className="resource-monitor">
        {error && <p role="alert">{error}. {metrics ? 'Показан последний успешный снимок.' : ''}</p>}
        {!metrics && !error && <p role="status">Загрузка метрик…</p>}
        {metrics && <>
          <p className="resource-monitor-muted">{metrics.platform} · Снимок {new Date(metrics.sampledAt).toLocaleTimeString()} · CPU {cpu}</p>
          <div className="resource-monitor-cores">{metrics.cores.map((value, index) => <label key={index}>CPU {index + 1}<meter min={0} max={100} value={value ?? 0} aria-label={`CPU ${index + 1}: ${percent(value)}`} /><span>{percent(value)}</span></label>)}</div>
          <dl className="resource-monitor-memory"><div><dt>RAM</dt><dd>{bytes(metrics.memory.used)} / {bytes(metrics.memory.total)}</dd></div><div><dt>Доступно</dt><dd>{bytes(metrics.memory.available)}</dd></div><div><dt>Swap</dt><dd>{metrics.swap ? `${bytes(metrics.swap.used)} / ${bytes(metrics.swap.total)}` : 'Нет данных'}</dd></div><div><dt>Load 1 / 5 / 15 мин</dt><dd>{metrics.platform === 'win32' ? 'Нет данных' : metrics.load.map(n => n.toFixed(2)).join(' / ')}</dd></div></dl>
          <h3>Процессы {metrics.processCount !== undefined && `(${metrics.processCount})`}</h3>
          <p className="resource-monitor-muted">CPU процесса: 100% = одно ядро. «—» — ожидание второго замера. RAM = RSS.</p>
          {metrics.truncated && <p>Показаны первые 200 по CPU/RAM; сканирование ограничено 4096 PID. Сортировка применяется к показанным строкам.</p>}
          {metrics.processError && <p>{metrics.processError}</p>}
          {!metrics.processes && metrics.platform === 'linux' && <p role="status">Загрузка процессов…</p>}
          {metrics.processes && <div className="resource-monitor-table" tabIndex={0} aria-label="Список процессов с горизонтальной прокруткой"><table><thead><tr>{([['pid', 'PID'], ['name', 'Имя'], ['state', 'Состояние'], ['cpu', 'CPU'], ['rss', 'RAM']] as const).map(([key, label]) => <th key={key} aria-sort={sort.key === key ? sort.descending ? 'descending' : 'ascending' : 'none'}><button type="button" onClick={() => setSort({ key, descending: sort.key === key ? !sort.descending : key === 'cpu' || key === 'rss' })}>{label}{sort.key === key ? sort.descending ? ' ↓' : ' ↑' : ''}</button></th>)}</tr></thead><tbody>{processes.map(process => <tr key={process.pid}><td>{process.pid}</td><td>{process.name}</td><td>{process.state}</td><td>{percent(process.cpu)}</td><td>{(process.rss / 1024 ** 2).toFixed(1)} МБ</td></tr>)}</tbody></table></div>}
        </>}
      </div>
    </Dialog>
  </>;
}
