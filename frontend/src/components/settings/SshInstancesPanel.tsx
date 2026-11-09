import { useCallback, useEffect, useId, useState, type FormEvent } from 'react';
import { Check, Copy, Plus, RefreshCw } from 'lucide-react';
import { Button } from '../ui/Button';
import { ApiError } from '../../lib/hyper';
import { getSshInstances, runSshAction, sshTarget, type SshAction, type SshActionResult, type SshInstance, type SshProbe } from '../../lib/sshInstances';

type Feedback = { tone: 'success' | 'error'; text: string } | null;
type Run = (action: SshAction) => Promise<SshActionResult | null>;

const NAME_PATTERN = '[A-Za-z0-9][A-Za-z0-9_.\\-]*';

function Field({ label, hint, ...input }: { label: string; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return <label className="settings-field" htmlFor={id}><span className="settings-field-label">{label}</span><input id={id} {...input} />{hint && <span className="settings-field-hint">{hint}</span>}</label>;
}

function readEndpoint(form: HTMLFormElement, name: string) {
  const data = new FormData(form);
  const value = (key: string) => String(data.get(key) ?? '').trim();
  return { name, host: value('host'), user: value('user'), port: Number(value('port')) };
}

function CopyKey({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => { try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { setCopied(false); } };
  return <div className="ssh-key">
    <pre tabIndex={0} aria-label="SSH public key">{value}</pre>
    <Button variant="ghost" className="ssh-key-copy" onClick={() => { void copy(); }} aria-label={copied ? 'Скопировано' : 'Копировать публичный ключ'}>{copied ? <Check size={14} strokeWidth={1.5} /> : <Copy size={14} strokeWidth={1.5} />}{copied ? 'Copied' : 'Copy'}</Button>
  </div>;
}

function TrustForm({ item, run, busy }: { item: SshInstance; run: Run; busy: boolean }) {
  const replacing = !!item.pinnedHostKey;
  const [hostKey, setHostKey] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const ok = await run({ action: 'trust', name: item.name, hostKey: hostKey.trim(), confirmed: true, ...(replacing ? { replace: true } : {}) });
    if (ok) { setHostKey(''); setConfirmed(false); }
  };
  const keyscan = `ssh-keyscan -t ed25519 -p ${item.port} ${item.host}`;
  return <form className="ssh-form" onSubmit={submit}>
    <p className="settings-note">Get the host key on the server itself or from a trusted channel, e.g. <code>{keyscan}</code>, and compare it before pasting. Only Ed25519 keys are accepted.</p>
    <Field label="Host public key" name="hostKey" required placeholder="ssh-ed25519 AAAA…" value={hostKey} onChange={event => setHostKey(event.target.value)} spellCheck={false} autoComplete="off" />
    <label className="settings-check"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />{replacing ? `I verified the new host key of ${item.name} independently and want to replace the pinned key.` : `I verified this host key of ${item.name} independently.`}</label>
    <div className="ssh-form-actions"><Button variant="primary" type="submit" disabled={busy || !confirmed || !hostKey.trim()}>{replacing ? 'Replace host key' : 'Verify host key'}</Button></div>
  </form>;
}

function EditForm({ item, run, busy }: { item: SshInstance; run: Run; busy: boolean }) {
  const submit = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); await run({ action: 'save', ...readEndpoint(event.currentTarget, item.name) }); };
  return <form className="ssh-form" onSubmit={submit}>
    <p className="settings-note">The name stays the same. Changing host, user or port clears host verification and requires reconnecting provider accounts. Hyper’s public key stays the same.</p>
    <div className="ssh-grid">
      <Field label="Host" name="host" required defaultValue={item.host} autoComplete="off" spellCheck={false} />
      <Field label="User" name="user" required maxLength={64} defaultValue={item.user} autoComplete="off" spellCheck={false} />
      <Field label="Port" name="port" type="number" required min={1} max={65535} step={1} defaultValue={item.port} />
    </div>
    <div className="ssh-form-actions"><Button variant="primary" type="submit" disabled={busy}>Save changes</Button></div>
  </form>;
}

function RemoveForm({ item, run, busy }: { item: SshInstance; run: Run; busy: boolean }) {
  const [confirmed, setConfirmed] = useState(false);
  const submit = async (event: FormEvent) => { event.preventDefault(); await run({ action: 'remove', name: item.name, confirmed: true }); };
  return <form className="ssh-form" onSubmit={submit}>
    <p className="settings-note">Removes this connection and its provider-account records from Hyper. Remote credentials and authorized_keys are not changed; this does not revoke server access.</p>
    <label className="settings-check"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />Remove {item.name} and its account records from Hyper.</label>
    <div className="ssh-form-actions"><Button className="button--danger" type="submit" disabled={busy || !confirmed}>Remove instance</Button></div>
  </form>;
}

function ProbeResult({ probe }: { probe: SshProbe }) {
  return <ul className="ssh-probe" aria-label="Результат проверки">{(['python3', 'codex', 'claude'] as const).map(key => <li key={key} className={probe[key] ? 'is-ok' : 'is-missing'}><span aria-hidden="true" />{key}<em>{probe[key] ? 'available' : 'missing'}</em></li>)}</ul>;
}

type Section = 'key' | 'trust' | 'edit' | 'remove' | null;

function InstanceCard({ item, run, busy, probe }: { item: SshInstance; run: Run; busy: boolean; probe?: SshProbe }) {
  const trusted = !!item.pinnedHostKey;
  const [open, setOpen] = useState<Section>(trusted ? null : 'key');
  const toggle = (section: Exclude<Section, null>) => setOpen(open === section ? null : section);
  const tabs: [Exclude<Section, null>, string][] = [['key', 'Public key'], ['trust', trusted ? 'Replace host key' : 'Verify host key'], ['edit', 'Edit connection'], ['remove', 'Remove']];
  return <article className="ssh-card" data-ssh-instance={item.name} aria-label={item.name}>
    <header className="ssh-card-header">
      <div className="ssh-card-title">
        <div className="ssh-card-name"><h3>{item.name}</h3><span className={`ssh-badge ${trusted ? 'is-verified' : 'is-pending'}`}><span aria-hidden="true" />{trusted ? 'Host verified' : 'Setup required'}</span></div>
        <p className="ssh-card-target">{sshTarget(item)}</p>
      </div>
      <Button onClick={() => { void run({ action: 'probe', name: item.name }); }} disabled={!trusted || busy} title={trusted ? 'Check SSH, python3, codex and claude on the server' : 'Verify the host key first'}><RefreshCw size={14} strokeWidth={1.5} />Test connection</Button>
    </header>
    {probe && <ProbeResult probe={probe} />}
    {!trusted && <ol className="ssh-steps"><li>Add the public key to <code>~/.ssh/authorized_keys</code> of the remote user.</li><li>Verify the server host key.</li><li>Test the connection.</li></ol>}
    <div className="ssh-card-tabs" role="group" aria-label={`Действия ${item.name}`}>
      {tabs.map(([id, label]) => <button key={id} type="button" className={`ssh-card-tab ${id === 'remove' ? 'is-danger' : ''}`} aria-expanded={open === id} onClick={() => toggle(id)}>{label}</button>)}
    </div>
    {open === 'key' && <div className="ssh-card-section"><p className="settings-note">Add this public key to <code>~/.ssh/authorized_keys</code> for <b>{item.user}</b>. The private key stays in Hyper.</p><CopyKey value={item.publicKey} />{trusted && <p className="settings-note">Pinned host key: <code className="ssh-pinned">{item.pinnedHostKey}</code></p>}</div>}
    {open === 'trust' && <div className="ssh-card-section"><TrustForm item={item} run={run} busy={busy} /></div>}
    {open === 'edit' && <div className="ssh-card-section"><EditForm key={item.updatedAt} item={item} run={run} busy={busy} /></div>}
    {open === 'remove' && <div className="ssh-card-section"><RemoveForm item={item} run={run} busy={busy} /></div>}
  </article>;
}

function AddForm({ run, busy, first }: { run: Run; busy: boolean; first: boolean }) {
  const [open, setOpen] = useState(first);
  useEffect(() => { if (first) setOpen(true); }, [first]);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const name = String(new FormData(form).get('name') ?? '').trim();
    const ok = await run({ action: 'create', ...readEndpoint(form, name) });
    if (ok) { form.reset(); if (!first) setOpen(false); }
  };
  if (!open) return <Button className="ssh-add-toggle" onClick={() => setOpen(true)}><Plus size={14} strokeWidth={1.5} />Add SSH instance</Button>;
  return <section className="ssh-card ssh-add" aria-label="Add SSH instance">
    <h3>Add SSH instance</h3>
    <form className="ssh-form" onSubmit={submit}>
      <div className="ssh-grid">
        <Field label="Name" name="name" required placeholder="work-server" maxLength={64} pattern={NAME_PATTERN} hint="A short name to recognize this server in LLM Connections." autoComplete="off" spellCheck={false} />
        <Field label="Host" name="host" required placeholder="server.example.com" autoComplete="off" spellCheck={false} />
        <Field label="User" name="user" required placeholder="runner" maxLength={64} autoComplete="off" spellCheck={false} />
        <Field label="Port" name="port" type="number" required defaultValue={22} min={1} max={65535} step={1} />
      </div>
      <div className="ssh-form-footer">
        <p className="settings-note">A dedicated SSH key is created locally. Adding a server does not connect to it.</p>
        <div className="ssh-form-actions">{!first && <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>}<Button variant="primary" type="submit" disabled={busy}>Add instance</Button></div>
      </div>
    </form>
  </section>;
}

/** Settings tab: manage owner SSH instances through the authenticated UI Lab bridge. */
export function SshInstancesPanel({ onOpenConnections }: { onOpenConnections?: () => void }) {
  const [instances, setInstances] = useState<SshInstance[] | null>(null);
  const [csrf, setCsrf] = useState('');
  const [loadError, setLoadError] = useState<{ text: string; forbidden: boolean } | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [busy, setBusy] = useState(false);
  const [probes, setProbes] = useState<Record<string, SshProbe>>({});
  const load = useCallback(async (signal?: AbortSignal) => {
    try { const data = await getSshInstances(signal); setInstances(data.instances); setCsrf(data.csrfToken); setLoadError(null); }
    catch (error) { if (signal?.aborted) return; setLoadError({ text: error instanceof Error ? error.message : 'Не удалось загрузить SSH Instances', forbidden: error instanceof ApiError && error.status === 403 }); }
  }, []);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);
  const run: Run = async action => {
    setBusy(true); setFeedback(null);
    try {
      const result = await runSshAction(action, csrf);
      if (result.probe) setProbes(previous => ({ ...previous, [action.name]: result.probe! }));
      else setProbes(previous => { const next = { ...previous }; delete next[action.name]; return next; });
      setFeedback({ tone: 'success', text: result.message });
      await load();
      return result;
    } catch (error) {
      setFeedback({ tone: 'error', text: error instanceof Error ? error.message : 'SSH action failed' });
      return null;
    } finally { setBusy(false); }
  };
  return <div className="settings-panel" data-page="ssh-instances">
    <header className="settings-panel-header">
      <h2>SSH Instances</h2>
      <p>Connect a server to run subscription requests remotely. Manage provider accounts in {onOpenConnections ? <button type="button" onClick={onOpenConnections}>LLM Connections</button> : 'the LLM Connections settings tab'}.</p>
    </header>
    {feedback && <div className={`settings-feedback is-${feedback.tone}`} role={feedback.tone === 'error' ? 'alert' : 'status'} aria-live="polite">{feedback.text}</div>}
    {loadError ? <div className="settings-feedback is-error" role="alert">{loadError.forbidden ? 'Только владелец может управлять SSH Instances.' : loadError.text}{!loadError.forbidden && <Button variant="ghost" onClick={() => { void load(); }}>Повторить</Button>}</div>
      : instances === null ? <p className="settings-loading" role="status">Загрузка…</p>
      : <>
        {instances.length > 0 && <div className="ssh-list">{instances.map(item => <InstanceCard key={item.name} item={item} run={run} busy={busy} probe={probes[item.name]} />)}</div>}
        <AddForm run={run} busy={busy} first={instances.length === 0} />
        <p className="settings-footnote">The remote server needs Python 3 and Codex or Claude CLI. Use Edit connection to change its address, or Replace host key after a verified server key change.</p>
      </>}
  </div>;
}
