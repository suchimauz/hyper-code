import { useCallback, useEffect, useState } from 'react';
import { Info, Plus, RotateCw, Search, X } from 'lucide-react';
import { getPluginSources, type SourcePlugin, type SourceProvider, getPlugins, groupPlugins, reloadPlugins, reviewPluginInstall, searchPluginMarket, type InstalledPlugin, type MarketItem, type MarketSection } from '../../lib/plugins';
import { PluginIcon } from './PluginIcon';
import { PluginDetail } from './PluginDetail';
import { PluginUiReview } from './PluginUiReview';
import './plugins-page.css';

type Tab = 'installed' | 'market' | 'sources';

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

function Sources({ csrf, onOpenAgent, onOpenPlugin }: { csrf: string; onOpenAgent?: (id: string) => void; onOpenPlugin: (name: string) => void }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof getPluginSources>> | null>(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [query, setQuery] = useState(() => new URL(location.href).searchParams.get('q') ?? '');
  const [provider, setProvider] = useState(() => new URL(location.href).searchParams.get('provider') ?? '');
  useEffect(() => { const c = new AbortController(); void getPluginSources(c.signal).then(setData, e => { if (!c.signal.aborted) setError(String(e)); }); return () => c.abort(); }, []);
  const rollback = async (p: SourcePlugin) => {
    if (!p.previousSelection) return;
    setPending(true); setError('');
    try { const r = await reviewPluginInstall(csrf, p.previousSelection, 'rollback'); onOpenAgent?.(r.agentId); }
    catch (e) { setError(String(e)); } finally { setPending(false); }
  };
  const rows = data?.sources.filter(p => p.name.toLowerCase().includes(query.toLowerCase()) && (!provider || p.selection?.provider === provider));
  return <>
    <h2>Installed sources</h2><p className="plugins-muted">Offline local inventory. A source on disk is separate from a mounted runtime plugin. Changes open a preview and require separate human confirmation.</p>
    <label className="plugins-search">Filter sources <input type="search" value={query} onChange={e => setQuery(e.target.value)} /></label>
    <label>Provider <select value={provider} onChange={e => setProvider(e.target.value)}><option value="">All providers</option>{data?.providers.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
    {error && <p role="alert" className="plugins-error">{error}</p>}
    {!data && !error && <p role="status">Loading sources…</p>}
    {data?.errors.map((e,i) => <p key={i} role="status" className="plugins-error">{e}</p>)}
    {rows && !rows.length && <p>No installed sources match this filter.</p>}
    <ul className="plugins-list">{rows?.map(p => <li key={p.name} className="plugins-card"><div className="plugins-card-row"><div className="plugins-card-main"><h3>{p.label || p.name}</h3><p>{p.description}</p><p>{p.status} · {p.mounted ? 'Mounted' : 'Not mounted'} · {p.selection?.provider || 'Local'}</p>{p.selection && <code title={p.selection.revision}>{p.selection.revision.slice(0,16)}</code>}</div>{p.mounted && <button className="plugins-get" onClick={() => onOpenPlugin(p.name)}>Details and configuration</button>}{!data?.errors.length && p.managed && p.modified === false && p.previousSelection && csrf && onOpenAgent && <button className="plugins-get" disabled={pending} onClick={() => void rollback(p)}>Review rollback</button>}</div></li>)}</ul>
    <h2>Source providers</h2><p className="plugins-muted">Filesystem is a built-in local source. Unmanaged or unverifiable sources cannot be overwritten here.</p>
    <ul className="plugins-list">{data?.providers.map(p => <li key={p.id} className="plugins-card"><h3>{p.label}</h3><p>{p.description}</p><code>{p.id}</code>{p.configurationHref && p.configurationHref.startsWith('/') && !p.configurationHref.startsWith('//') ? <a className="plugins-get" href={p.configurationHref}>Configure source</a> : <p className="plugins-muted">No configuration page</p>}</li>)}</ul>
  </>;
}

function Market({ csrf, onOpenAgent, onOpenPlugin }: { csrf: string; onOpenAgent?: (id: string) => void; onOpenPlugin: (name: string) => void }) {
  const [installing, setInstalling] = useState('');
  const [provider, setProvider] = useState(() => new URL(location.href).searchParams.get('provider') ?? '');
  const [providers, setProviders] = useState<SourceProvider[]>([]);
  const [sources, setSources] = useState<SourcePlugin[]>([]);
  const [inventoryOk, setInventoryOk] = useState(false);
  useEffect(() => { const c = new AbortController(); void getPluginSources(c.signal).then(r => { setProviders(r.providers); setSources(r.sources); setInventoryOk(!r.errors.length); }, () => { setInventoryOk(false); }); return () => c.abort(); }, []);
  const operation = (item: MarketItem): 'install' | 'update' | null => {
    if (!inventoryOk || !item.selection || !item.reviewable || item.selection.revision.startsWith('mounted:')) return null;
    const local = sources.find(s => s.name === item.name);
    if (!local) return item.mounted ? null : 'install';
    const a = local.selection, b = item.selection;
    return local.managed && local.modified === false && a && a.provider === b.provider && JSON.stringify(Object.entries(a.source).sort()) === JSON.stringify(Object.entries(b.source).sort()) && a.revision !== b.revision ? 'update' : null;
  };
  const install = async (item: MarketItem) => {
    if (!item.selection) return;
    setInstalling(item.name); setError('');
    try { const r = await reviewPluginInstall(csrf, item.selection, operation(item) ?? 'install'); onOpenAgent?.(r.agentId); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setInstalling(''); }
  };
  const [query, setQuery] = useState(() => new URL(location.href).searchParams.get('q') ?? '');
  const [sections, setSections] = useState<MarketSection[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => searchPluginMarket(query, controller.signal, provider).then(next => { setSections(next); setError(''); }, err => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : String(err)); }), 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, provider]);
  return <>
    <label className="plugins-search"><Search size={14} strokeWidth={1.5} aria-hidden="true" /><input type="search" aria-label="Search plugin market" placeholder="Search plugins" value={query} onChange={e => setQuery(e.target.value)} />{query && <button aria-label="Clear search" onClick={() => setQuery('')}><X size={12} /></button>}</label>
    <label>Provider <select aria-label="Provider" value={provider} onChange={e => setProvider(e.target.value)}><option value="">All providers</option>{providers.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
    {!inventoryOk && <p className="plugins-muted">Source inventory is unavailable or needs verification; review actions are disabled.</p>}
    {error && <p className="plugins-error" role="alert">{error}</p>}
    {!sections && !error && <p className="plugins-muted">Loading…</p>}
    {sections?.map(section => <section key={section.provider} className="plugins-section">
      <h3>{section.label}</h3>
      {section.errors.map(e => <p key={e} className="plugins-muted">{e}</p>)}
      {section.items.length ? <ul className="plugins-list">{section.items.map(item => <li key={item.name} className="plugins-card"><div className="plugins-card-row">
        <PluginIcon icon={item.icon} />
        <div className="plugins-card-main">{item.mounted ? <button className="plugins-card-title" onClick={() => onOpenPlugin(item.name)}>{item.label}</button> : <span className="plugins-card-title">{item.label}</span>}<p className="plugins-card-desc" title={item.description}>{item.description || item.name}</p></div>
        {operation(item) && csrf && onOpenAgent ? <button className="plugins-get" aria-label={`Review ${operation(item)} ${item.label}`} title="Opens a review agent; installing needs your confirmation there" disabled={!!installing} onClick={() => void install(item)}>{installing === item.name ? 'Opening…' : `Review ${operation(item)}`}</button> : <span className="plugins-badge" title="No safe source change available">{item.mounted ? 'Mounted' : 'Unavailable'}</span>}
      </div></li>)}</ul> : <p className="plugins-muted">No plugins found.</p>}
    </section>)}
  </>;
}


/** Plugins page, as in dsh, over Hyper's mounted plugins and provider catalogue. */
export function PluginsPage({ onOpenAgent }: { onOpenAgent?: (id: string) => void } = {}) {
  const [tab, setTab] = useState<Tab>(() => new URL(location.href).searchParams.get('catalogTab') === 'sources' ? 'sources' : new URL(location.href).searchParams.get('catalogTab') === 'market' ? 'market' : 'installed');
  const [plugins, setPlugins] = useState<InstalledPlugin[] | null>(null);
  const [csrf, setCsrf] = useState('');
  const [error, setError] = useState('');
  const [query, setQuery] = useState(() => new URL(location.href).searchParams.get('q') ?? '');
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [about, setAbout] = useState(false);
  const [opened, setOpened] = useState<string | null>(()=>new URL(location.href).searchParams.get('plugin'));

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
        <button role="tab" aria-selected={tab === 'sources'} onClick={() => setTab('sources')}>Sources</button>
      </div>
      {error && <p className="plugins-error" role="alert">{error}</p>}
      {tab === 'installed' ? <>
        <label className="plugins-search"><Search size={14} strokeWidth={1.5} aria-hidden="true" /><input type="search" aria-label="Filter installed plugins" placeholder="Filter installed plugins" value={query} onChange={e => setQuery(e.target.value)} />{query && <button aria-label="Clear filter" onClick={() => setQuery('')}><X size={12} /></button>}</label>
        <PluginUiReview />
        {!plugins && !error && <p className="plugins-muted">Loading…</p>}
        {plugins && !groups.length && <p className="plugins-muted">No plugins match.</p>}
        {groups.map(group => <section key={group.title} className="plugins-section">
          <h3>{group.title} <span>{group.plugins.length}</span></h3>
          <ul className="plugins-list">{group.plugins.map(plugin => <InstalledCard key={plugin.name} plugin={plugin} onOpen={() => setOpened(plugin.name)} pending={!!pending[plugin.name]} onReload={csrf ? () => void reload(plugin.name) : undefined} />)}</ul>
        </section>)}
      </> : tab === 'sources' ? <Sources csrf={csrf} onOpenAgent={onOpenAgent} onOpenPlugin={setOpened} /> : <Market csrf={csrf} onOpenAgent={onOpenAgent} onOpenPlugin={setOpened} />}
      </>}
    </div>
  </section>;
}
