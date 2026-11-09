import { useEffect, useRef, useState } from 'react';
import { requestJson, safeApiPath } from '../../sdk/api';
import { subscribeLive } from '../../sdk/live';
import { Button } from '../ui/Button';
import './application-pages.css';

type Application = { id: string; label: string; href: string; group?: string };
/** Declared server documents only. Backend registration is not permission: every request is authorized again. */
export function applicationLinks(value: unknown): Application[] {
  if (!value || typeof value !== 'object' || !('items' in value) || !Array.isArray(value.items)) return [];
  return value.items.filter((item): item is Application => {
    if (!item || typeof item !== 'object' || typeof item.id !== 'string' || typeof item.label !== 'string' || typeof item.href !== 'string') return false;
    try { safeApiPath(item.href); } catch { return false; }
    // These destinations have native React surfaces; never embed the application shell in itself.
    return !['/', '/auth/users', '/sshInstance', '/cron', '/plugins', '/llms'].includes(item.href.split('?')[0]) && !/^\/(sber|tbank)(\/|$)/i.test(item.href);
  });
}

/** Retains necessary trusted HTML pages without reviving the dock, menu or chat shell. */
export function ApplicationPages({ theme }: { theme: 'light' | 'dark' }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const applyTheme = () => {
    try { const root = frame.current?.contentDocument?.documentElement; if (root) { root.dataset.theme = theme; root.style.colorScheme = theme; } }
    catch (cause) { console.debug('Cannot theme a navigated application document', cause); }
  };
  useEffect(applyTheme, [theme]);
  const [items, setItems] = useState<Application[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [generation, setGeneration] = useState(0);
  useEffect(() => {
    let disposed = false;
    let controller: AbortController | undefined;
    const refresh = () => {
      controller?.abort(); controller = new AbortController();
      void requestJson<unknown>('/nav/items', { signal: controller.signal }).then(data => {
        if (!disposed) { setItems(applicationLinks(data)); setError(''); setLoading(false); }
      }).catch(cause => {
        if (!disposed && cause?.name !== 'AbortError') { setError(cause instanceof Error ? cause.message : 'Страницы недоступны'); setLoading(false); }
      });
    };
    refresh();
    const stop = subscribeLive({ name: 'application-pages', types: ['plugins.changed'], onEvent: refresh, resync: refresh, onError: () => setError('Связь прервана. Обновите список страниц.') });
    return () => { disposed = true; controller?.abort(); stop(); };
  }, [generation]);
  const active = items.find(item => item.id === selected);
  const visible = items.filter(item => `${item.label} ${item.group ?? ''}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return <section className="application-pages" aria-label="Приложения">
    <span hidden data-live-topic="plugins" />
    <header><h2>{active?.label ?? 'Приложения'}</h2>{active && <Button onClick={() => setSelected(null)}>Все приложения</Button>}<Button onClick={() => setGeneration(value => value + 1)}>Обновить</Button></header>
    {error && <p role="alert">{error}</p>}
    {/* Reviewed server documents retain authorization and approval transports; this is not the Canvas HTML/URL sandbox. */}
    {active ? <iframe ref={frame} key={`${active.id}:${generation}`} title={active.label} src={active.href} onLoad={applyTheme} /> : <>
      <label className="application-filter">Найти приложение<input type="search" value={query} onChange={event => setQuery(event.target.value)} /></label>
      {loading ? <p role="status">Загрузка…</p> : <ul>{visible.map(item => <li key={item.id}><button onClick={() => setSelected(item.id)}><strong>{item.label}</strong><span>{item.group}</span></button></li>)}</ul>}
      {!loading && !visible.length && <p>Нет доступных страниц.</p>}
    </>}
  </section>;
}
