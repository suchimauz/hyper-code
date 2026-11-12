import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import { Button } from '../ui/Button';
import { PhosphorIcon } from '../mauzcode/PhosphorIcon';
import { ApiError } from '../../lib/mauzcode';
import { usePluginUi } from '../../extensions/pluginRuntime';
import type { ExtensionContext } from '../../extensions/types';
import {
  connectionModels, connectionUsage, createConnection, getModelsState, removeConnection, setConnectionEnabled, testConnection, transportLabel, updateConnection,
  type ConnectionInput, type ModelConnectionView, type ModelFieldSpec, type ModelInfo, type ModelProviderView, type ModelsState, type ModelTransportSpec, type ModelUsageReport,
} from '../../lib/modelConnections';
import { SettingsField as Field } from './SettingsField';

type Feedback = { tone: 'success' | 'error'; text: string } | null;
const message = (error: unknown, fallback: string) => error instanceof Error && error.message ? error.message : fallback;
const STATUS_LABEL: Record<ModelUsageReport['status'], string> = { available: 'Available', unavailable: 'Unavailable', configured: 'Configured', disabled: 'Disabled' };
const TRANSPORT_LABEL: Record<ModelTransportSpec['kind'], string> = { direct: 'Direct', socks: 'SOCKS5 proxy', 'ssh-tunnel': 'SSH tunnel' };

function formatTime(ms: number) { return new Date(ms).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }); }

/** Shared renderer of a UsageReport: status and reason, then quota windows and balance when present. */
export function UsageView({ usage }: { usage: ModelUsageReport }) {
  const tone = usage.status === 'available' ? 'is-verified' : usage.status === 'unavailable' ? 'is-error' : 'is-pending';
  return <div className="models-usage">
    <p className="models-usage-status"><span className={`ssh-badge ${tone}`}><span aria-hidden="true" />{STATUS_LABEL[usage.status] ?? usage.status}</span>{usage.reason && <span className="models-usage-reason">{usage.reason}</span>}<span className="models-usage-time">checked {formatTime(usage.checkedAt)}</span></p>
    {usage.windows && usage.windows.length > 0 && <ul className="models-windows" aria-label="Quota windows">{usage.windows.map((w, i) => {
      const used = typeof w.usedPercent === 'number' ? Math.max(0, Math.min(100, w.usedPercent)) : null;
      return <li key={`${w.label}-${i}`} className="models-window">
        <span className="models-window-label">{w.label}</span>
        {used !== null && <span className="models-meter" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(used)} aria-label={`${w.label} used`}><span style={{ width: `${used}%` }} /></span>}
        <span className="models-window-meta">{used !== null ? `${Math.round(used)}% used` : typeof w.remaining === 'number' ? `${w.remaining} left` : ''}{w.resetAt ? ` · resets ${formatTime(w.resetAt)}` : ''}</span>
      </li>;
    })}</ul>}
    {usage.balance && <p className="settings-note">Balance: {usage.balance.amount} {usage.balance.currency}</p>}
  </div>;
}

function SelectField({ label, hint, value, onChange, options, name, required }: { label: string; hint?: string; value: string; onChange: (v: string) => void; options: readonly { value: string; label: string }[]; name: string; required?: boolean }) {
  const id = useId();
  return <label className="settings-field" htmlFor={id}><span id={`${id}-label`} className="settings-field-label">{label}</span>
    <select id={id} aria-labelledby={`${id}-label`} name={name} className="settings-select" value={value} required={required} aria-describedby={hint ? `${id}-hint` : undefined} onChange={e => onChange(e.target.value)}>{options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
    {hint && <span id={`${id}-hint`} className="settings-field-hint">{hint}</span>}</label>;
}

function initialValue(field: ModelFieldSpec, connection?: ModelConnectionView): string | boolean {
  const stored = connection?.config[field.key];
  if (field.type === 'secret') return '';
  if (field.type === 'boolean') return typeof stored === 'boolean' ? stored : field.default ?? false;
  if (stored !== undefined && stored !== null) return String(stored);
  if (field.type === 'select') return field.default ?? field.options[0]?.value ?? '';
  return field.default !== undefined ? String(field.default) : '';
}

/** Schema-driven connection form. Secret inputs are write-only: empty keeps the stored value, "clear" sends null. */
export function SchemaConnectionForm({ provider, connection, state, onSubmit, onCancel, busy }: { provider: ModelProviderView; connection?: ModelConnectionView; state: Pick<ModelsState, 'proxies' | 'instances'>; onSubmit: (input: ConnectionInput) => Promise<boolean>; onCancel: () => void; busy: boolean }) {
  const [accountName, setAccountName] = useState(connection?.accountName ?? '');
  const [values, setValues] = useState<Record<string, string | boolean>>(() => Object.fromEntries(provider.fields.map(f => [f.key, initialValue(f, connection)])));
  const [clear, setClear] = useState<Record<string, boolean>>({});
  const manualStored = connection?.config.models;
  const [manual, setManual] = useState(Array.isArray(manualStored) ? manualStored.join('\n') : '');
  const kinds = provider.transports.length ? provider.transports : ['direct' as const];
  const [kind, setKind] = useState<ModelTransportSpec['kind']>(connection?.transport.kind && kinds.includes(connection.transport.kind) ? connection.transport.kind : kinds[0]);
  const [proxyId, setProxyId] = useState(connection?.transport.kind === 'socks' ? connection.transport.proxyId : state.proxies[0]?.id ?? '');
  const [instance, setInstance] = useState(connection?.transport.kind === 'ssh-tunnel' ? connection.transport.instance : state.instances[0] ?? '');
  const set = (key: string, value: string | boolean) => setValues(previous => ({ ...previous, [key]: value }));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const config: Record<string, unknown> = {}; const secrets: Record<string, string | null> = {};
    for (const field of provider.fields) {
      const value = values[field.key];
      if (field.type === 'secret') { if (clear[field.key]) secrets[field.key] = null; else if (typeof value === 'string' && value) secrets[field.key] = value; continue; }
      if (field.type === 'boolean') { config[field.key] = value === true; continue; }
      const text = String(value ?? '').trim();
      if (!text) continue;
      config[field.key] = field.type === 'number' ? Number(text) : text;
    }
    const models = manual.split(/[\n,]/).map(s => s.trim()).filter(Boolean);
    if (models.length) config.models = models;
    const transport: ModelTransportSpec = kind === 'socks' ? { kind, proxyId } : kind === 'ssh-tunnel' ? { kind, instance } : { kind: 'direct' };
    if (await onSubmit({ accountName: accountName.trim(), config, secrets, transport })) { setValues(v => Object.fromEntries(Object.entries(v).map(([k, x]) => [k, provider.fields.find(f => f.key === k)?.type === 'secret' ? '' : x]))); setClear({}); }
  };
  return <form className="ssh-form" onSubmit={submit} aria-label={connection ? `Edit ${connection.accountName}` : `New ${provider.label} connection`}>
    <Field label="Account name" name="accountName" required maxLength={100} value={accountName} onChange={e => setAccountName(e.target.value)} autoComplete="off" hint="Shown in lists; does not need to be unique." />
    {provider.fields.map(field => {
      const value = values[field.key];
      if (field.type === 'select') return <SelectField key={field.key} name={field.key} label={field.label} hint={field.help} required={field.required} value={String(value)} onChange={v => set(field.key, v)} options={field.options} />;
      if (field.type === 'boolean') return <label key={field.key} className="settings-check"><input type="checkbox" name={field.key} checked={value === true} onChange={e => set(field.key, e.target.checked)} />{field.label}</label>;
      if (field.type === 'secret') {
        const stored = connection?.secrets[field.key] === true;
        return <div key={field.key} className="models-secret">
          <Field label={field.label} name={field.key} type="password" autoComplete="new-password" spellCheck={false} value={String(value)} disabled={!!clear[field.key]}
            required={field.required && !stored} placeholder={stored ? 'Stored — leave empty to keep' : field.placeholder}
            hint={[stored ? 'A value is stored. It is never shown; type a new one to replace it.' : 'Not set.', field.help].filter(Boolean).join(' ')} onChange={e => set(field.key, e.target.value)} />
          {stored && !field.required && <label className="settings-check"><input type="checkbox" checked={!!clear[field.key]} onChange={e => setClear(c => ({ ...c, [field.key]: e.target.checked }))} />Clear stored {field.label}</label>}
        </div>;
      }
      return <Field key={field.key} label={field.label} name={field.key} type={field.type === 'number' ? 'number' : field.type === 'url' ? 'url' : 'text'} required={field.required} placeholder={field.placeholder} hint={field.help} autoComplete="off" spellCheck={false} value={String(value)} onChange={e => set(field.key, e.target.value)} />;
    })}
    <label className="settings-field"><span id={`${provider.id}-models-label`} className="settings-field-label">Manual model ids</span><textarea name="models" aria-labelledby={`${provider.id}-models-label`} className="models-textarea" rows={3} value={manual} onChange={e => setManual(e.target.value)} spellCheck={false} aria-describedby={`${provider.id}-models-hint`} /><span id={`${provider.id}-models-hint`} className="settings-field-hint">One per line. Used when the provider cannot list models, and merged with discovered ones otherwise.</span></label>
    <fieldset className="models-transport"><legend className="settings-field-label">Network</legend>
      <div className="models-transport-kinds" role="radiogroup" aria-label="Transport">{kinds.map(k => <label key={k} className="settings-check"><input type="radio" name="transport" value={k} checked={kind === k} onChange={() => setKind(k)} />{TRANSPORT_LABEL[k]}</label>)}</div>
      {kind === 'socks' && (state.proxies.length ? <SelectField name="proxyId" label="Saved proxy" required value={proxyId} onChange={setProxyId} options={state.proxies.map(p => ({ value: p.id, label: `${p.name} (${p.host}:${p.port})` }))} hint="Proxied requests require HTTPS endpoints." /> : <p className="settings-note" role="note">No saved SOCKS5 proxies. Add one in the SOCKS5 tab.</p>)}
      {kind === 'ssh-tunnel' && (state.instances.length ? <SelectField name="instance" label="SSH instance" required value={instance} onChange={setInstance} options={state.instances.map(n => ({ value: n, label: n }))} hint="Only instances with a verified host key. Requires HTTPS endpoints." /> : <p className="settings-note" role="note">No verified SSH instances. Verify one in the SSH Instances tab.</p>)}
    </fieldset>
    <div className="ssh-form-actions"><Button variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button><Button variant="primary" type="submit" disabled={busy || (kind === 'socks' && !proxyId) || (kind === 'ssh-tunnel' && !instance)}>{connection ? 'Save changes' : 'Add connection'}</Button></div>
  </form>;
}

type Actions = {
  csrf: string; busy: boolean; context: ExtensionContext; state: ModelsState;
  run: <T>(label: string, task: () => Promise<T>, success?: (result: T) => string) => Promise<T | null>;
  reload: () => Promise<void>;
};

/** Uses a granted plugin component for the provider when present, else the schema-driven form. */
function ProviderForm({ provider, connection, actions, onDone }: { provider: ModelProviderView; connection?: ModelConnectionView; actions: Actions; onDone: () => void }) {
  const plugin = usePluginUi().registry.modelProviders.find(entry => entry.provider === provider.id);
  if (plugin) {
    const Component = plugin.component;
    return <div className="models-plugin-form" data-model-provider-component={plugin.key}><Component context={actions.context} provider={provider} connection={connection} onSaved={() => { void actions.reload(); onDone(); }} onCancel={onDone} /></div>;
  }
  const submit = async (input: ConnectionInput) => {
    const saved = await actions.run(connection ? 'Save' : 'Add', () => connection ? updateConnection(actions.csrf, connection.id, input) : createConnection(actions.csrf, provider.id, input), c => `${c.accountName} saved`);
    if (!saved) return false;
    await actions.reload(); onDone(); return true;
  };
  return <SchemaConnectionForm provider={provider} connection={connection} state={actions.state} onSubmit={submit} onCancel={onDone} busy={actions.busy} />;
}

type Section = 'edit' | 'models' | 'remove' | null;

function ConnectionCard({ connection, provider, actions }: { connection: ModelConnectionView; provider?: ModelProviderView; actions: Actions }) {
  const [usage, setUsage] = useState<ModelUsageReport | null>(null);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [open, setOpen] = useState<Section>(null);
  const [models, setModels] = useState<{ models: ModelInfo[]; source: string; error?: string } | null>(null);
  const confirmRef = useRef<HTMLDivElement>(null);
  const loadUsage = useCallback(async (refresh: boolean, signal?: AbortSignal) => {
    try { setUsage(await connectionUsage(actions.csrf, connection.id, refresh, signal)); setUsageError(null); }
    catch (error) { if (!signal?.aborted) setUsageError(message(error, 'Usage unavailable')); }
  }, [actions.csrf, connection.id]);
  useEffect(() => { const c = new AbortController(); void loadUsage(false, c.signal); return () => c.abort(); }, [loadUsage, connection.updatedAt, connection.enabled]);
  useEffect(() => { if (open === 'remove') confirmRef.current?.querySelector<HTMLButtonElement>('.button--danger')?.focus(); }, [open]);
  const toggle = (section: Exclude<Section, null>) => setOpen(open === section ? null : section);
  const test = async () => { const result = await actions.run('Test', () => testConnection(actions.csrf, connection.id), r => `${connection.accountName}: ${r.message}`); if (result) await loadUsage(true); };
  const showModels = async () => { if (open === 'models') return setOpen(null); setOpen('models'); setModels(null); const r = await actions.run('Models', () => connectionModels(actions.csrf, connection.id)); if (r) setModels(r); };
  const label = provider?.label ?? connection.provider;
  return <article className="ssh-card" data-model-connection={connection.id} aria-label={connection.accountName}>
    <header className="ssh-card-header">
      <div className="ssh-card-title">
        <div className="ssh-card-name"><PhosphorIcon icon={provider?.icon} size={18} /><h3>{connection.accountName}</h3>{!connection.enabled && <span className="ssh-badge is-pending"><span aria-hidden="true" />Disabled</span>}</div>
        <p className="ssh-card-target">{label}{!connection.providerRegistered && ' (provider not loaded)'} · {transportLabel(connection.transport, actions.state.proxies)}</p>
      </div>
      <div className="models-card-buttons">
        <Button onClick={() => { void test(); }} disabled={actions.busy || !connection.enabled || !connection.providerRegistered}><RefreshCw size={14} strokeWidth={1.5} aria-hidden="true" />Test</Button>
        <label className="settings-check models-enabled"><input type="checkbox" role="switch" checked={connection.enabled} disabled={actions.busy} onChange={e => { const enabled = e.target.checked; void actions.run(enabled ? 'Enable' : 'Disable', () => setConnectionEnabled(actions.csrf, connection.id, enabled), () => `${connection.accountName} ${enabled ? 'enabled' : 'disabled'}`).then(r => r && actions.reload()); }} />Enabled</label>
      </div>
    </header>
    <div aria-live="polite">{usage ? <UsageView usage={usage} /> : usageError ? <p className="settings-note" role="status">{usageError}</p> : <p className="settings-loading" role="status">Checking…</p>}</div>
    <div className="ssh-card-tabs" role="group" aria-label={`Actions for ${connection.accountName}`}>
      <button type="button" className="ssh-card-tab" aria-expanded={open === 'edit'} disabled={!provider} onClick={() => toggle('edit')}>Edit</button>
      <button type="button" className="ssh-card-tab" aria-expanded={open === 'models'} disabled={!connection.providerRegistered} onClick={() => { void showModels(); }}>Models</button>
      <button type="button" className="ssh-card-tab is-danger" aria-expanded={open === 'remove'} onClick={() => toggle('remove')}>Remove</button>
    </div>
    {open === 'edit' && provider && <div className="ssh-card-section"><ProviderForm key={connection.updatedAt} provider={provider} connection={connection} actions={actions} onDone={() => setOpen(null)} /></div>}
    {open === 'models' && <div className="ssh-card-section" aria-live="polite">{!models ? <p className="settings-loading" role="status">Loading models…</p> : <>
      {models.error && <p className="settings-note" role="status">Discovery failed: {models.error}</p>}
      {models.models.length ? <ul className="models-list" aria-label={`Models of ${connection.accountName}`}>{models.models.map(m => <li key={m.id}><code>{m.id}</code>{m.label && m.label !== m.id && <span> {m.label}</span>}</li>)}</ul> : <p className="settings-note">No models.</p>}
      <p className="settings-field-hint">Source: {models.source}</p></>}</div>}
    {open === 'remove' && <div className="ssh-card-section settings-confirm" role="group" aria-label="Confirm removal">
      <p className="settings-note">Removes <b>{connection.accountName}</b> and its stored secrets from MauzCode. This cannot be undone.</p>
      <div className="ssh-form-actions" ref={confirmRef}><Button variant="ghost" onClick={() => setOpen(null)}>Cancel</Button><Button className="button--danger" disabled={actions.busy} onClick={() => { void actions.run('Remove', () => removeConnection(actions.csrf, connection.id), () => `${connection.accountName} removed`).then(r => r && actions.reload()); }}>Remove connection</Button></div>
    </div>}
  </article>;
}

function AddConnection({ actions, first }: { actions: Actions; first: boolean }) {
  const providers = actions.state.providers;
  const [open, setOpen] = useState(first);
  const [providerId, setProviderId] = useState(providers.find(p => p.id === 'custom')?.id ?? providers[0]?.id ?? '');
  const provider = providers.find(p => p.id === providerId);
  if (!providers.length) return <p className="settings-note">No model providers are registered.</p>;
  if (!open) return <Button className="ssh-add-toggle" onClick={() => setOpen(true)}><Plus size={14} strokeWidth={1.5} aria-hidden="true" />Add connection</Button>;
  return <section className="ssh-card" aria-label="Add connection">
    <h3>Add connection</h3>
    <SelectField name="provider" label="Provider" value={providerId} onChange={setProviderId} options={providers.map(p => ({ value: p.id, label: p.label }))} hint={provider?.description} />
    {provider && <ProviderForm key={provider.id} provider={provider} actions={actions} onDone={() => { if (!first) setOpen(false); }} />}
  </section>;
}

/** Settings → Models: owner management of provider connections through /models/api. */
export function ModelsPanel({ context }: { context: ExtensionContext }) {
  const [state, setState] = useState<ModelsState | null>(null);
  const [loadError, setLoadError] = useState<{ text: string; forbidden: boolean } | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async (signal?: AbortSignal) => {
    try { setState(await getModelsState(signal)); setLoadError(null); }
    catch (error) { if (signal?.aborted) return; setLoadError({ text: message(error, 'Не удалось загрузить модели'), forbidden: error instanceof ApiError && error.status === 403 }); }
  }, []);
  useEffect(() => { const c = new AbortController(); void load(c.signal); return () => c.abort(); }, [load]);
  const run: Actions['run'] = async (label, task, success) => {
    setBusy(true); setFeedback(null);
    try { const result = await task(); if (success) setFeedback({ tone: 'success', text: success(result) }); return result; }
    catch (error) { setFeedback({ tone: 'error', text: message(error, `${label} failed`) }); return null; }
    finally { setBusy(false); }
  };
  const actions: Actions | null = state && { csrf: state.csrfToken, busy, context, state, run, reload: () => load() };
  return <div className="settings-panel" data-page="models">
    <header className="settings-panel-header">
      <h2>Models</h2>
      <p>Connect model providers. These connections do not affect agents yet; agents still use LLM Connections.</p>
    </header>
    {feedback && <div className={`settings-feedback is-${feedback.tone}`} role={feedback.tone === 'error' ? 'alert' : 'status'} aria-live="polite">{feedback.text}</div>}
    {loadError ? <div className="settings-feedback is-error" role="alert">{loadError.forbidden ? 'Только владелец может управлять моделями.' : loadError.text}{!loadError.forbidden && <Button variant="ghost" onClick={() => { void load(); }}>Повторить</Button>}</div>
      : !state || !actions ? <p className="settings-loading" role="status">Загрузка…</p>
      : <>
        {state.connections.length > 0 && <div className="ssh-list">{state.connections.map(c => <ConnectionCard key={c.id} connection={c} provider={state.providers.find(p => p.id === c.provider)} actions={actions} />)}</div>}
        <AddConnection actions={actions} first={state.connections.length === 0} />
      </>}
  </div>;
}
