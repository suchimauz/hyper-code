import { PluginConfiguration } from './PluginConfiguration';
import { useEffect, useState } from 'react';
import { ArrowLeft, X } from 'lucide-react';
import { getPluginDetail, stripFrontMatter, type PluginDetail as Detail } from '../../lib/plugins';
import { ChatMarkdown } from './ChatMarkdown';
import { CodeBlock } from './CodeBlock';

type DetailTab = 'overview' | 'functions' | 'settings';

/** In-app card of one mounted plugin: SKILL.md overview, live functions and declared settings. */
export function PluginDetail({ name, icon, onBack }: { name: string; icon: React.ReactNode; onBack: () => void }) {
  const [plugin, setPlugin] = useState<Detail | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<DetailTab>(()=>new URL(location.href).searchParams.get('tab')==='settings'?'settings':'overview');
  const [query, setQuery] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setPlugin(null); setError('');
    getPluginDetail(name, controller.signal).then(setPlugin, err => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : String(err)); });
    return () => controller.abort();
  }, [name]);

  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const functions = plugin?.functions.filter(f => words.every(w => `${f.name} ${f.summary}`.toLocaleLowerCase().includes(w))) ?? [];
  const settingsCount = plugin ? plugin.settings.length + plugin.secrets.length : 0;

  return <div className="plugin-detail">
    <button className="plugin-detail-back" onClick={onBack}><ArrowLeft size={14} strokeWidth={1.5} />All plugins</button>
    <header className="plugin-detail-head">
      {icon}
      <div className="plugins-card-main">
        <h2>{plugin?.label ?? name}</h2>
        <p className="plugins-card-desc">{plugin?.description || name}</p>
      </div>
      {plugin && <span className="plugins-badge">{plugin.source}</span>}
    </header>
    {error && <p className="plugins-error" role="alert">{error}</p>}
    {!plugin && !error && <p className="plugins-muted">Loading…</p>}
    {plugin && <>
      <dl className="plugin-detail-facts">
        <dt>Name</dt><dd><code>{plugin.name}</code></dd>
        <dt>Namespaces</dt><dd>{plugin.namespaces.map(ns => <code key={ns}>{ns}</code>)}</dd>
        <dt>Contents</dt><dd>{plugin.functions.length} functions · {plugin.routes} routes</dd>
        {plugin.domains.length > 0 && <><dt>Domains</dt><dd>{plugin.domains.map(d => <code key={d}>{d}</code>)}</dd></>}
      </dl>
      <div className="plugins-tabs" role="tablist" aria-label={`${plugin.label} sections`}>
        <button role="tab" aria-selected={tab === 'overview'} onClick={() => setTab('overview')}>Overview</button>
        <button role="tab" aria-selected={tab === 'functions'} onClick={() => setTab('functions')}>Functions <span>{plugin.functions.length}</span></button>
        <button role="tab" aria-selected={tab === 'settings'} onClick={() => setTab('settings')}>Settings <span>{settingsCount}</span></button>
      </div>
      {tab === 'overview' && <div className="plugin-detail-overview">
        {plugin.overview ? <div className="markdown"><ChatMarkdown>{stripFrontMatter(plugin.overview)}</ChatMarkdown></div> : <p className="plugins-muted">This plugin has no SKILL.md overview.</p>}
        {plugin.overviewTruncated && <p className="plugins-muted">Overview is truncated.</p>}
      </div>}
      {tab === 'functions' && <>
        <label className="plugins-search"><input type="search" aria-label="Filter functions" placeholder="Filter functions" value={query} onChange={e => setQuery(e.target.value)} />{query && <button aria-label="Clear filter" onClick={() => setQuery('')}><X size={12} /></button>}</label>
        {!functions.length ? <p className="plugins-muted">No functions match.</p> : <ul className="plugin-detail-fns">{functions.map(f => <li key={f.name}>
          <details>
            <summary><code>{f.name}</code><span>{f.summary}</span></summary>
            <div className="plugin-detail-sig"><CodeBlock text={`${f.name}${f.signature}`} language="ts" compact /></div>
          </details>
        </li>)}</ul>}
      </>}
      {tab === 'settings' && <PluginConfiguration name={name} />}
    </>}
  </div>;
}
