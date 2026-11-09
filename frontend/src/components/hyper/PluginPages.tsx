import { useRef, useState } from 'react';
import { Puzzle, Search, X } from 'lucide-react';
import './plugins-page.css';

/** Approved plugin page catalogue, sharing the Plugins page layout and card styles. */
export function PluginPages({ pages, loaded, onOpen }: { pages: readonly { key: string; title: string }[]; loaded: boolean; onOpen: (key: string) => void }) {
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const needle = query.trim().toLocaleLowerCase();
  const filtered = pages.filter(page => `${page.title} ${page.key}`.toLocaleLowerCase().includes(needle));
  return <section className="plugins-page" aria-label="Pages">
    <div className="plugins-pane">
      <header className="plugins-header"><div><h1>Pages</h1><p className="plugins-sub">Доступные страницы плагинов</p></div></header>
      <label className="plugins-search"><Search size={14} strokeWidth={1.5} aria-hidden="true" /><input ref={searchRef} type="search" aria-label="Поиск страниц" placeholder="Поиск страниц" value={query} onChange={event => setQuery(event.target.value)} />{query && <button type="button" aria-label="Очистить поиск" onClick={() => { setQuery(''); searchRef.current?.focus(); }}><X size={12} aria-hidden="true" /></button>}</label>
      <div className="plugins-section">
      {!loaded && <p className="plugins-muted" role="status">Загрузка страниц…</p>}
      {loaded && !pages.length && <p className="plugins-muted" role="status">Нет доступных страниц плагинов.</p>}
      {loaded && pages.length > 0 && !filtered.length && <p className="plugins-muted" role="status">Страницы не найдены.</p>}
      <ul className="plugins-list">
        {filtered.map(page => <li key={page.key} className="plugins-card"><div className="plugins-card-row">
          <span className="plugins-tile" aria-hidden="true"><Puzzle size={20} strokeWidth={1.25} /></span>
          <div className="plugins-card-main"><button className="plugins-card-title" onClick={() => onOpen(page.key)}>{page.title}</button><p className="plugins-card-desc">{page.key.split('/')[0]}</p></div>
        </div></li>)}
      </ul>
      </div>
    </div>
  </section>;
}
