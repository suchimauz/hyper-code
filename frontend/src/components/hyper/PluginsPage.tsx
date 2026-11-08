import { useCallback, useEffect, useState } from 'react';
import { Info, Plus, Puzzle, RotateCw, Search, X } from 'lucide-react';
import { getPlugins, groupPlugins, phosphorClass, reloadPlugins, reviewPluginInstall, searchPluginMarket, type InstalledPlugin, type MarketItem, type MarketSection } from '../../lib/plugins';
import { PluginDetail } from './PluginDetail';
import './plugins-page.css';

type Tab = 'installed' | 'market';

/** Phosphor stylesheet is served by Hyper itself; loaded once, on demand. */
function usePhosphor() {
  useEffect(() => {
    if (document.querySelector('link[data-phosphor]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet'; link.href = '/ui/vendor/phosphor.css'; link.dataset.phosphor = '';
    document.head.append(link);
  }, []);
}

function PluginIcon({ icon }: { icon: string | null }) {
  const cls = phosphorClass(icon);
  return <span className="plugins-tile" aria-hidden="true">{cls ? <i className={`ph ${cls}`} /> : <Puzzle size={20} strokeWidth={1.25} />}</span>;
}

function InstalledCard({ plugin, pending, onOpen, onReload }: { plugin: InstalledPlugin; pending: boolean; onOpen: () => void; onReload?: () => void }) {
  return <li className="plugins-card">
    <div className="plugins-card-row">
      <PluginIcon icon={plugin.icon} />
      <div className="plugins-card-main">
        <button className="plugins-card-title" onClick={onOpen}>{plugin.label}</button>
        <p className="plugins-card-desc" title={plugin.description}>{plugin.description || plugin.name}</p>
      </div>
      <span className="plugins-badge">{plugin.version ? `v${plugin.version}` : plugin.source}</span>
      {onReload && <button className="plugins-icon" aria-label={`Reload ${plugin.label}`} title="Reload" disabled={pending} onClick={onReload}><RotateCw size={14} strokeWidth={1.5} className={pending ? 'is-spinning' : ''} /></button>}
    </div>
  </li>;
}

function Market({ csrf, onOpenAgent, onOpenPlugin }: { csrf: string; onOpenAgent?: (id: string) => void; onOpenPlugin: (name: string) => void }) {
  const [installing, setInstalling] = useState('');
  const install = async (item: MarketItem) => {
    if (!item.selection) return;
    setInstalling(item.name); setError('');
    try { const r = await reviewPluginInstall(csrf, item.selection); onOpenAgent?.(r.agentId); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setInstalling(''); }
  };
  const [query, setQuery] = useState('');
  const [sections, setSections] = useState<MarketSection[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => searchPluginMarket(query, controller.signal).then(next => { setSections(next); setError(''); }, err => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : String(err)); }), 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query]);
  return <>
    <label className="plugins-search"><Search size={14} strokeWidth={1.5} aria-hidden="true" /><input type="search" aria-label="Search plugin market" placeholder="Search plugins" value={query} onChange={e => setQuery(e.target.value)} />{query && <button aria-label="Clear search" onClick={() => setQuery('')}><X size={12} /></button>}</label>
    {error && <p className="plugins-error" role="alert">{error}</p>}
    {!sections && !error && <p className="plugins-muted">Loading…</p>}
    {sections?.map(section => <section key={section.provider} className="plugins-section">
      <h3>{section.label}</h3>
      {section.errors.map(e => <p key={e} className="plugins-muted">{e}</p>)}
      {section.items.length ? <ul className="plugins-list">{section.items.map(item => <li key={item.name} className="plugins-card"><div className="plugins-card-row">
        <PluginIcon icon={item.icon} />
        <div className="plugins-card-main">{item.mounted ? <button className="plugins-card-title" onClick={() => onOpenPlugin(item.name)}>{item.label}</button> : <span className="plugins-card-title">{item.label}</span>}<p className="plugins-card-desc" title={item.description}>{item.description || item.name}</p></div>
        {item.mounted ? <span className="plugins-badge is-installed">Installed</span> : item.selection && item.reviewable && csrf && onOpenAgent ? <button className="plugins-get" aria-label={`Install ${item.label}`} title="Opens a review agent; installing needs your confirmation there" disabled={!!installing} onClick={() => void install(item)}>{installing === item.name ? 'Opening…' : 'Install'}</button> : <span className="plugins-badge" title="This provider does not support reviewed installation">Unavailable</span>}
      </div></li>)}</ul> : <p className="plugins-muted">No plugins found.</p>}
    </section>)}
  </>;
}

/** Plugins page, as in dsh, over Hyper's mounted plugins and provider catalogue. */
export function PluginsPage({ onOpenAgent }: { onOpenAgent?: (id: string) => void } = {}) {
  usePhosphor();
  const [tab, setTab] = useState<Tab>('installed');
  const [plugins, setPlugins] = useState<InstalledPlugin[] | null>(null);
  const [csrf, setCsrf] = useState('');
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [about, setAbout] = useState(false);
  const [opened, setOpened] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    try { const data = await getPlugins(signal); setPlugins(data.plugins); setCsrf(data.csrfToken); setError(''); }
    catch (err) { if (!signal?.aborted) setError(err instanceof Error ? err.message : String(err)); }
  }, []);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);

  const reload = async (name?: string) => {
    const key = name ?? '*';
    setPending(p => ({ ...p, [key]: true }));
    try { await reloadPlugins(csrf, name); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setPending(p => { const next = { ...p }; delete next[key]; return next; }); }
  };

  const groups = plugins ? groupPlugins(plugins, query) : [];
  return <section className="plugins-page" aria-label="Plugins">
    <div className="plugins-pane">
      <header className="plugins-header">
        <div>
          <h1>Plugins</h1>
          <p className="plugins-sub">Install, browse, and configure plugins <button className="plugins-info" aria-label="About plugins" aria-expanded={about} onClick={() => setAbout(!about)}><Info size={11} strokeWidth={1.75} /></button></p>
        </div>
        <div className="plugins-tools">
          <button className="plugins-icon is-28" aria-label="Refresh" title="Reload all plugins" disabled={!!pending['*']} onClick={() => void reload()}><RotateCw size={16} strokeWidth={1.5} className={pending['*'] ? 'is-spinning' : ''} /></button>
          <span className="plugins-split">
            <button className="plugins-add is-single" onClick={() => { setOpened(null); setTab('market'); }}><Plus size={13} strokeWidth={1.5} />Add plugin</button>
          </span>
        </div>
      </header>
      {about && <p className="plugins-about">Plugins add functions, routes, and skills to Hyper. Installing new code always goes through Hyper's reviewed flow with a separate confirmation.</p>}
      {opened ? <PluginDetail name={opened} icon={<PluginIcon icon={plugins?.find(p => p.name === opened)?.icon ?? null} />} onBack={() => setOpened(null)} /> : <>
      <div className="plugins-tabs" role="tablist" aria-label="Plugins">
        <button role="tab" aria-selected={tab === 'installed'} onClick={() => setTab('installed')}>Installed</button>
        <button role="tab" aria-selected={tab === 'market'} onClick={() => setTab('market')}>Plugin Market</button>
      </div>
      {error && <p className="plugins-error" role="alert">{error}</p>}
      {tab === 'installed' ? <>
        <label className="plugins-search"><Search size={14} strokeWidth={1.5} aria-hidden="true" /><input type="search" aria-label="Filter installed plugins" placeholder="Filter installed plugins" value={query} onChange={e => setQuery(e.target.value)} />{query && <button aria-label="Clear filter" onClick={() => setQuery('')}><X size={12} /></button>}</label>
        {!plugins && !error && <p className="plugins-muted">Loading…</p>}
        {plugins && !groups.length && <p className="plugins-muted">No plugins match.</p>}
        {groups.map(group => <section key={group.title} className="plugins-section">
          <h3>{group.title} <span>{group.plugins.length}</span></h3>
          <ul className="plugins-list">{group.plugins.map(plugin => <InstalledCard key={plugin.name} plugin={plugin} onOpen={() => setOpened(plugin.name)} pending={!!pending[plugin.name]} onReload={csrf ? () => void reload(plugin.name) : undefined} />)}</ul>
        </section>)}
      </> : <Market csrf={csrf} onOpenAgent={onOpenAgent} onOpenPlugin={setOpened} />}
      </>}
    </div>
  </section>;
}
