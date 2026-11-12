import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { requestJson, useLiveSubscription, type LiveStatus, type ExtensionCanvasProps, type ExtensionContext, type UiExtension } from '@mauzcode/ui';
import { styles } from './styles';

type Artifact = { id: string; label: string };
type Change = { name: string; progress: { done: number; total: number } | null; artifacts: Artifact[]; mtime: number };
type Spec = { id: string; path: string };
export type Snapshot = { initialized: boolean; key: string; changes: Change[]; specs: Spec[]; archive: Change[] };
type Doc = { id: string; title: string; html: string; mtime: number };
type Validation = { ok: boolean; items: { id: string; type: string; valid: boolean; issues: { level: string; path: string; message: string }[] }[]; error?: string };
type Section = 'changes' | 'specs' | 'archive';
type Entry = { id: string; title: string; detail?: string; progress?: Change['progress']; artifacts: Artifact[]; mtime?: number };

export const SECTIONS: { id: Section; label: string }[] = [{ id: 'changes', label: 'Changes' }, { id: 'specs', label: 'Specs' }, { id: 'archive', label: 'Archive' }];
const errorText = (e: unknown) => e instanceof Error ? e.message : String(e);

/** Entries of one section; spec entries are their own single document. */
export function entriesOf(snapshot: Snapshot | null, section: Section): Entry[] {
  if (!snapshot) return [];
  if (section === 'specs') return snapshot.specs.map(s => ({ id: s.id, title: s.path, artifacts: [{ id: s.id, label: 'spec.md' }] }));
  const list = section === 'changes' ? snapshot.changes : snapshot.archive;
  return list.map(c => ({ id: c.name, title: c.name, detail: c.progress ? c.progress.done + '/' + c.progress.total + ' tasks' : 'No tasks', progress: c.progress, artifacts: c.artifacts, mtime: c.mtime }));
}
/** Archive entry a change moved to (`<date>-<name>`), newest first, or null. */
export function archivedAs(snapshot: Snapshot | null, name: string): Change | null {
  return snapshot?.archive.find(c => c.name.endsWith('-' + name) && /^\d{4}-\d{2}-\d{2}-/.test(c.name)) ?? null;
}
/** Same artifact kind in an archived copy: `change:x:tasks` → `archive:<date>-x:tasks`. */
export function archivedDoc(docId: string | null, from: string, to: Change): string | null {
  const prefix = 'change:' + from + ':';
  if (docId?.startsWith(prefix)) { const id = 'archive:' + to.name + ':' + docId.slice(prefix.length); if (to.artifacts.some(a => a.id === id)) return id; }
  return to.artifacts[0]?.id ?? null;
}
const KEEP_ALIVE_MS = 2 * 60 * 1000;
type Live = 'live' | 'connecting' | 'stopped';

/** Next index for arrow/Home/End keys, or null for other keys. */
export function moveIndex(key: string, index: number, count: number, horizontal: boolean): number | null {
  if (!count) return null;
  const prev = horizontal ? 'ArrowLeft' : 'ArrowUp', next = horizontal ? 'ArrowRight' : 'ArrowDown';
  if (key === prev) return (index - 1 + count) % count;
  if (key === next) return (index + 1) % count;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return null;
}

/** Compact ring progress; the ring is the accessible progressbar. */
function Progress({ progress }: { progress: Change['progress'] }) {
  if (!progress) return <span className="osv-ring osv-ring-empty" aria-hidden="true" />;
  const pct = progress.total ? progress.done / progress.total : 0, c = 2 * Math.PI * 9;
  const complete = progress.total > 0 && progress.done === progress.total;
  return <span className="osv-ring" data-done={complete} role="progressbar" aria-label="Task progress" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done} aria-valuetext={`${progress.done} of ${progress.total} tasks`}>
    <svg viewBox="0 0 24 24" aria-hidden="true"><circle className="osv-ring-track" cx="12" cy="12" r="9" /><circle className="osv-ring-fill" cx="12" cy="12" r="9" strokeDasharray={c} strokeDashoffset={c * (1 - pct)} /></svg>
    {complete && <svg className="osv-ring-check" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 12.5l2.6 2.5L16 9.5" /></svg>}
  </span>;
}
const Icon = ({ d, size = 14 }: { d: string; size?: number }) => <svg className="osv-icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><path d={d} /></svg>;
const ICONS = { check: 'M20 6L9 17l-5-5', back: 'M15 18l-6-6 6-6', doc: 'M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8zM14 3v5h5', close: 'M18 6L6 18M6 6l12 12', refresh: 'M21 12a9 9 0 1 1-2.6-6.4M21 4v5h-5', alert: 'M12 9v4m0 4h.01M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z' };
const ago = (ms: number) => { const m = Math.round((Date.now() - ms) / 60000); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' d ago'; };

/** One-step Start-page launcher: the server opens (or reactivates) the tab for the agent's current local workspace. */
export async function openWorkspace(context: ExtensionContext): Promise<{ id: number }> {
  if (!context.agentId) throw new Error('Open OpenSpec from an agent chat.');
  return requestJson<{ id: number }>('/openspec?agentId=' + encodeURIComponent(context.agentId), { method: 'POST', body: {} });
}

export function Workspace({ context, item }: ExtensionCanvasProps) {
  const initial = SECTIONS.some(s => s.id === item.state.section) ? item.state.section as Section : 'changes';
  const [section, setSection] = useState<Section>(initial);
  const [selected, setSelected] = useState<string | null>(typeof item.state.selected === 'string' ? item.state.selected : null);
  const [docId, setDocId] = useState<string | null>(typeof item.state.doc === 'string' ? item.state.doc : null);
  const [open, setOpen] = useState(docId !== null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [doc, setDoc] = useState<Doc | null>(null);
  const [error, setError] = useState(''), [docError, setDocError] = useState('');
  const [validation, setValidation] = useState<Validation | null>(null), [validating, setValidating] = useState(false);
  const [tick, setTick] = useState(0);
  const [transport, setTransport] = useState<LiveStatus>(() => window.mauzcodeLive?.getStatus?.() ?? 'connecting');
  const [keepAliveOk, setKeepAliveOk] = useState(true), [liveError, setLiveError] = useState(false);
  const [active, setActive] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]), options = useRef<(HTMLLIElement | null)[]>([]);
  const base = '/openspec?agentId=' + encodeURIComponent(context.agentId || '') + '&itemId=' + item.id;
  const refresh = useCallback(() => setTick(t => t + 1), []);
  const save = (state: Record<string, unknown>) => {
    if (context.readOnly || !context.agentId) return;
    requestJson('/canvas/' + encodeURIComponent(context.agentId) + '/item/' + item.id, { method: 'POST', body: { state } }).catch(e => setError('Could not save selection: ' + errorText(e)));
  };

  useEffect(() => {
    let alive = true;
    requestJson<Snapshot>(base + '&op=snapshot').then(data => { if (alive) { setSnapshot(data); setError(''); } }).catch(e => { if (alive) setError(errorText(e)); });
    return () => { alive = false; };
  }, [base, tick]);

  const entries = entriesOf(snapshot, section);
  const known = new Set(entriesOf(snapshot, 'changes').concat(entriesOf(snapshot, 'specs'), entriesOf(snapshot, 'archive')).flatMap(e => e.artifacts.map(a => a.id)));
  const missing = !!snapshot && docId !== null && !known.has(docId);

  useEffect(() => {
    let alive = true;
    setDocError('');
    if (!docId || !snapshot || missing) { setDoc(null); return; }
    requestJson<Doc>(base + '&op=doc&id=' + encodeURIComponent(docId)).then(data => { if (alive) setDoc(data); }).catch(e => { if (alive) { setDoc(null); setDocError(errorText(e)); } });
    return () => { alive = false; };
  }, [base, docId, tick, snapshot?.key, missing]);

  const keyRef = useRef<string | undefined>(undefined);
  keyRef.current = snapshot?.key;
  // The server watcher closes after idle minutes without requests; an open tab keeps it alive
  // and refreshes when the watcher was recreated (it may have missed changes meanwhile).
  const keepAlive = useCallback(() => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    requestJson<{ key: string }>(base + '&op=watch').then(r => { setKeepAliveOk(true); if (keyRef.current && r.key !== keyRef.current) refresh(); }).catch(() => setKeepAliveOk(false));
  }, [base, refresh]);
  useEffect(() => {
    const timer = setInterval(keepAlive, KEEP_ALIVE_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') { keepAlive(); refresh(); } };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [keepAlive, refresh]);
  // onStatus reports changes only and the transport script loads asynchronously, possibly after
  // mount: re-read getStatus() on a short local timer (no network) and follow onStatus once present.
  useEffect(() => {
    let off: (() => void) | undefined;
    const sync = () => {
      const client = window.mauzcodeLive;
      if (!client) return;
      const current = client.getStatus?.();
      if (current) setTransport(current);
      if (!off) off = client.onStatus?.(setTransport) ?? (() => {});
    };
    sync();
    const timer = setInterval(sync, 3000);
    return () => { clearInterval(timer); off?.(); };
  }, []);

  useLiveSubscription({
    name: 'openspec-workspace', types: ['openspec.changed'],
    onEvent: event => { setTransport('connected'); setLiveError(false); if ((event as { key?: unknown }).key === snapshot?.key) refresh(); },
    resync: () => { setLiveError(false); setTransport(window.mauzcodeLive?.getStatus?.() ?? 'connected'); keepAlive(); refresh(); },
    onError: () => setLiveError(true),
  });
  const live: Live = liveError || !keepAliveOk || transport === 'disconnected' ? 'stopped' : transport === 'connected' ? 'live' : 'connecting';

  // A selected change that was archived follows into the Archive section.
  useEffect(() => {
    if (!snapshot || section !== 'changes' || !selected || snapshot.changes.some(c => c.name === selected)) return;
    const moved = archivedAs(snapshot, selected);
    if (!moved) return;
    const nextDoc = archivedDoc(docId, selected, moved);
    setSection('archive'); setSelected(moved.name); setDocId(nextDoc);
    save({ section: 'archive', selected: moved.name, doc: nextDoc });
  }, [snapshot]);

  useEffect(() => { const i = entries.findIndex(e => e.id === selected); setActive(i >= 0 ? i : 0); }, [section, snapshot]);

  const switchSection = (next: Section) => { setSection(next); save({ section: next }); };
  const pick = (entry: Entry) => {
    const nextDoc = entry.artifacts.find(a => a.id === docId)?.id ?? entry.artifacts[0]?.id ?? null;
    setSelected(entry.id); setDocId(nextDoc); setOpen(true);
    save({ section, selected: entry.id, doc: nextDoc });
  };
  const pickDoc = (id: string) => { setDocId(id); save({ doc: id }); };
  const validate = () => {
    setValidating(true); setValidation(null);
    requestJson<Validation>(base + '&op=validate').then(setValidation).catch(e => setValidation({ ok: false, items: [], error: errorText(e) })).finally(() => setValidating(false));
  };
  const onTabKey = (e: KeyboardEvent, index: number) => {
    const next = moveIndex(e.key, index, SECTIONS.length, true);
    if (next === null) return;
    e.preventDefault(); switchSection(SECTIONS[next].id); tabs.current[next]?.focus();
  };
  const onOptionKey = (e: KeyboardEvent, index: number) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(entries[index]); return; }
    const next = moveIndex(e.key, index, entries.length, false);
    if (next === null) return;
    e.preventDefault(); setActive(next); options.current[next]?.focus();
  };
  const current = entries.find(e => e.id === selected) ?? null;
  const dirName = String(item.args.dir || '').split('/').filter(Boolean).pop() || 'workspace';

  const sectionIndex = SECTIONS.findIndex(s => s.id === section);
  const counts: Record<Section, number> = { changes: snapshot?.changes.length ?? 0, specs: snapshot?.specs.length ?? 0, archive: snapshot?.archive.length ?? 0 };
  const docs = current?.artifacts.filter(a => !a.label.startsWith('specs/')) ?? [];
  const deltas = current?.artifacts.filter(a => a.label.startsWith('specs/')) ?? [];
  const failing = validation?.items.filter(i => !i.valid) ?? [];
  const artButton = (a: Artifact, label: string) => <button key={a.id} aria-pressed={a.id === docId} aria-label={a.label} onClick={() => pickDoc(a.id)}>{label}</button>;

  return <section className="osv" data-theme={context.theme} aria-label={'OpenSpec · ' + dirName}>
    <style>{styles}</style>
    <header className="osv-bar">
      <div className="osv-title"><h2>OpenSpec</h2><span title={String(item.args.dir || '')}>{dirName}</span></div>
      <div className="osv-seg" role="tablist" aria-label="OpenSpec sections" style={{ ['--i' as string]: sectionIndex, ['--n' as string]: SECTIONS.length }}>
        <span className="osv-seg-thumb" aria-hidden="true" />
        {SECTIONS.map((s, i) => <button key={s.id} ref={el => { tabs.current[i] = el; }} role="tab" aria-label={s.label} id={'osv-tab-' + item.id + '-' + s.id} aria-selected={section === s.id} aria-controls={'osv-list-' + item.id} tabIndex={section === s.id ? 0 : -1} onClick={() => switchSection(s.id)} onKeyDown={e => onTabKey(e, i)}>{s.label}{snapshot?.initialized && <span className="osv-count" aria-hidden="true">{counts[s.id]}</span>}</button>)}
      </div>
      <span className="osv-live" data-state={live} title={live === 'stopped' ? 'Live updates unavailable — use Refresh' : undefined}><span className="osv-live-dot" aria-hidden="true" />{live === 'live' ? 'Live' : live === 'connecting' ? 'Connecting…' : 'Not live'}</span>
      <button className="osv-btn" onClick={() => { keepAlive(); refresh(); }} aria-label="Refresh"><Icon d={ICONS.refresh} /><span>Refresh</span></button>
      <button className="osv-btn osv-primary" onClick={validate} disabled={validating || !snapshot?.initialized} aria-label="Validate">{validating ? <span className="osv-spin" aria-hidden="true" /> : <Icon d={ICONS.check} />}<span>{validating ? 'Validating…' : 'Validate'}</span></button>
    </header>
    {error && <p role="alert" className="osv-alert"><Icon d={ICONS.alert} />{error}</p>}
    <div role="status" aria-live="polite" className="osv-status">
      {live === 'stopped' && <p className="osv-live-note">Live updates are unavailable; use Refresh to reload.</p>}
      {validation && <div className="osv-valid" data-ok={validation.ok && !validation.error}>
        <div className="osv-valid-head">
          <span className="osv-valid-dot" aria-hidden="true"><Icon d={validation.ok && !validation.error ? ICONS.check : ICONS.alert} size={12} /></span>
          {validation.error ? <span>Validation failed: {validation.error}</span>
            : validation.ok ? <span>All {validation.items.length} items are valid.</span>
              : <span>{failing.length} of {validation.items.length} items have problems</span>}
          <button className="osv-icon-btn" onClick={() => setValidation(null)} aria-label="Dismiss"><Icon d={ICONS.close} /></button>
        </div>
        {failing.length > 0 && <ul>{failing.map(i => <li key={i.type + i.id}><strong>{i.id}</strong> <span className="osv-muted">{i.type}</span><ul>{i.issues.map((issue, n) => <li key={n}><span className="osv-level" data-level={issue.level.toLowerCase()}>{issue.level}</span> {issue.message}{issue.path ? <code>{issue.path}</code> : null}</li>)}</ul></li>)}</ul>}
      </div>}
    </div>
    {!snapshot && !error && <div className="osv-empty" role="status"><span className="osv-spin" aria-hidden="true" /> Loading…</div>}
    {snapshot && !snapshot.initialized && <div className="osv-empty"><Icon d={ICONS.doc} size={28} /><p>OpenSpec is not initialized in this workspace.</p><p className="osv-muted">Ask the agent to set it up; this view updates automatically.</p></div>}
    {snapshot?.initialized && <div className="osv-body" data-open={open && !!docId}>
      <nav className="osv-list" aria-labelledby={'osv-tab-' + item.id + '-' + section}>
        {entries.length === 0 ? <div className="osv-empty"><Icon d={ICONS.doc} size={24} /><p>{section === 'changes' ? 'No active changes.' : section === 'specs' ? 'No specs yet.' : 'Archive is empty.'}</p></div>
          : <ul role="listbox" id={'osv-list-' + item.id} aria-label={SECTIONS.find(s => s.id === section)?.label}>
            {entries.map((entry, i) => <li key={entry.id} ref={el => { options.current[i] = el; }} role="option" className="osv-opt" aria-selected={entry.id === selected} tabIndex={i === active ? 0 : -1} onClick={() => { setActive(i); pick(entry); }} onKeyDown={e => onOptionKey(e, i)}>
              {section !== 'specs' ? <Progress progress={entry.progress ?? null} /> : <span className="osv-spec-icon" aria-hidden="true"><Icon d={ICONS.doc} /></span>}
              <span className="osv-opt-text"><strong>{entry.title}</strong>
                {section !== 'specs' && <small>{entry.detail}{entry.mtime ? ' · ' + ago(entry.mtime) : ''}</small>}</span>
            </li>)}
          </ul>}
      </nav>
      <main className="osv-doc" aria-label="Document">
        {current && <div className="osv-doc-head">
          <button className="osv-icon-btn osv-back" onClick={() => setOpen(false)} aria-label="Back to list"><Icon d={ICONS.back} size={16} /></button>
          <div className="osv-doc-title"><span className="osv-eyebrow">{section === 'changes' ? 'Change' : section === 'archive' ? 'Archived change' : 'Spec'}</span><h3>{current.title}</h3></div>
          {current.progress && <span className="osv-pill" data-done={current.progress.done === current.progress.total}>{current.progress.done}/{current.progress.total} tasks</span>}
        </div>}
        {current && current.artifacts.length > 1 && <div className="osv-arts" role="group" aria-label="Artifacts">
          <div className="osv-arts-row">{docs.map(a => artButton(a, a.label.replace(/\.md$/, '')))}</div>
          {deltas.length > 0 && <div className="osv-arts-row"><span className="osv-arts-label">Spec deltas</span>{deltas.map(a => artButton(a, a.label.slice(6)))}</div>}
        </div>}
        <div className="osv-paper">
          {(!docId || !current) && !missing && <div className="osv-empty"><Icon d={ICONS.doc} size={28} /><p>{entries.length ? 'Select an item to read it.' : 'Nothing to show here yet.'}</p></div>}
          {missing && <div className="osv-empty" role="status"><p>This document is no longer available.</p></div>}
          {current && docError && <p role="alert" className="osv-alert"><Icon d={ICONS.alert} />{docError}</p>}
          {current && docId && !missing && !doc && !docError && <div className="osv-skeleton" role="status" aria-label="Loading document"><span /><span /><span /><span /></div>}
          {current && doc && !missing && <article key={doc.id} className="osv-md" aria-label={doc.title} dangerouslySetInnerHTML={{ __html: doc.html }} />}
        </div>
      </main>
    </div>}
  </section>;
}

const extension: UiExtension = {
  id: 'openspec', apiVersion: 1,
  canvasLaunchers: [{ id: 'openspec', title: 'OpenSpec', description: 'Read-only changes, specs and archive of this workspace', open: openWorkspace }],
  canvasKinds: [{ kind: 'openspec.workspace', component: Workspace }],
};
export default extension;
