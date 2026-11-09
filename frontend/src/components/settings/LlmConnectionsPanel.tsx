import { CodexAccountReset } from './CodexAccountReset';
import { LlmPolicySettings } from './LlmPolicySettings';
import { RemoteLoginDiagnostics } from './RemoteLoginDiagnostics';
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { ExternalLink, Plus, RefreshCw } from 'lucide-react';
import { Button } from '../ui/Button';
import { NavigationChatIcon } from '../hyper/NavigationChatIcon';
import type { NavigationIcon } from '../../lib/navigation';
import { ApiError } from '../../lib/hyper';
import { accountSlot, getLlmConnections, LOGIN_PROVIDERS, REMOVABLE, runLlmAction, type LlmAccount, type LlmAction, type LlmActionResult, type LlmLogin, type LoginProvider, type QuotaWindow } from '../../lib/llmConnections';

type Feedback = { tone: 'success' | 'error'; text: string } | null;
type Run = (action: LlmAction, quiet?: boolean) => Promise<LlmActionResult | null>;

const GROUPS: { id: string; title: string; providers: string[]; login?: LoginProvider; hint?: string }[] = [
  { id: 'codex', title: 'Codex', providers: ['codex'], login: 'codex' },
  { id: 'claude', title: 'Claude', providers: ['claude-code', 'anthropic-oauth'], login: 'claude-code' },
  { id: 'kimi', title: 'Kimi Coding', providers: ['kimi-coding'], login: 'kimi-coding' },
  { id: 'grok', title: 'Grok', providers: ['xai'], login: 'xai' },
  { id: 'opencode', title: 'OpenCode', providers: ['opencode'], hint: 'API key is configured in Hyper settings.' },
  { id: 'zai', title: 'Z.ai', providers: ['zai-coding'], hint: 'API key is configured in Hyper settings.' },
  { id: 'minimax', title: 'MiniMax', providers: ['minimax-coding'], hint: 'API key is configured in Hyper settings.' },
];
const PROVIDER_NAME: Record<string, string> = { codex: 'Codex', 'claude-code': 'Claude Code', 'anthropic-oauth': 'Claude', 'kimi-coding': 'Kimi Coding', xai: 'Grok' };

function windowLabel(w: QuotaWindow, fallback: string) {
  const m = w.windowMinutes;
  return m == null ? fallback : m <= 300 ? `${Math.round(m / 60)}h` : m <= 10080 ? 'weekly' : 'monthly';
}
function resetIn(at: number | null | undefined) {
  if (!at) return '';
  const min = Math.max(0, Math.round((at - Date.now()) / 60000));
  return min < 60 ? `${min}m` : min < 2880 ? `${Math.round(min / 60)}h` : `${Math.round(min / 1440)}d`;
}
function tone(pct: number | null) { return pct == null ? 'is-unknown' : pct >= 95 ? 'is-critical' : pct >= 80 ? 'is-warning' : 'is-ok'; }

function Quota({ item }: { item: LlmAccount }) {
  const windows = item.windows ? (['primary', 'secondary', 'tertiary'] as const).flatMap(key => item.windows?.[key] ? [{ key, w: item.windows[key]! }] : []) : [];
  if (!windows.length) return <span className={`llm-quota ${tone(item.usedPercent)}`}>{item.usedPercent == null ? 'quota not measured' : `${item.usedPercent}% used`}</span>;
  return <span className="llm-quota-list">{windows.map(({ key, w }) => <span key={key} className={`llm-quota ${tone(w.usedPercent)}`} title={w.resetsAt ? `Resets ${new Date(w.resetsAt).toLocaleString()}` : undefined}>{windowLabel(w, key)} {Math.round(w.usedPercent)}%{w.resetsAt ? ` · ${resetIn(w.resetsAt)}` : ''}</span>)}</span>;
}

function LoginForm({ provider, instances, run, busy, onDone, account }: { provider: LoginProvider; instances: string[]; run: Run; busy: boolean; onDone: () => void; account?: { name: string; instance: string | null } }) {
  const id = useId();
  const remote = provider !== 'xai' && instances.length > 0;
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const instance = account ? account.instance ?? '' : String(data.get('instance') ?? '');
    const ok = await run({ action: 'login', provider, account: account?.name ?? String(data.get('account') ?? '').trim(), ...(instance ? { instance } : {}) });
    if (ok) onDone();
  };
  return <form className="ssh-form llm-login-form" onSubmit={submit}>
    {account ? <p className="settings-note">Reconnect <code>{account.name}</code>{account.instance ? <> on SSH <code>{account.instance}</code></> : null}. The official {PROVIDER_NAME[provider]} sign-in opens below.</p>
      : <div className="ssh-grid">
        <label className="settings-field" htmlFor={`${id}-a`}><span className="settings-field-label">Account name</span><input id={`${id}-a`} name="account" required maxLength={40} pattern="[A-Za-z0-9][A-Za-z0-9_\-]*" placeholder="work or personal" autoComplete="off" spellCheck={false} /><span className="settings-field-hint">Letters, digits, _ or -. Not “default”.</span></label>
        {remote && <label className="settings-field" htmlFor={`${id}-i`}><span className="settings-field-label">SSH Instance</span><select id={`${id}-i`} name="instance" className="settings-select" defaultValue=""><option value="">This machine (local)</option>{instances.map(name => <option key={name} value={name}>{name}</option>)}</select><span className="settings-field-hint">Where the CLI signs in and keeps credentials.</span></label>}
      </div>}
    <div className="ssh-form-actions"><Button variant="ghost" type="button" onClick={onDone}>Cancel</Button><Button variant="primary" type="submit" disabled={busy}>{account ? 'Reconnect' : 'Start login'}</Button></div>
  </form>;
}

function PendingLogin({ login, run, busy }: { login: LlmLogin; run: Run; busy: boolean }) {
  const [code, setCode] = useState('');
  const id = useId();
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const ok = await run(login.instance && login.id ? { action: 'code', id: login.id, code: code.trim() } : { action: 'code', provider: login.provider, account: login.account, code: code.trim() });
    if (ok) setCode('');
  };
  const failed = login.status === 'failed';
  return <div className={`llm-login ${failed ? 'is-failed' : ''}`} data-llm-login={`${login.provider}/${login.account}`}>
    <div className="llm-login-head"><span className={`ssh-badge ${failed ? 'is-failed' : 'is-pending'}`}><span aria-hidden="true" />{failed ? 'Login failed' : 'Waiting for sign-in'}</span><b>{login.account}</b><span className="llm-login-where">{PROVIDER_NAME[login.provider] ?? login.provider} · {login.instance ? `SSH ${login.instance}` : 'Local'}</span></div>
    {login.error && <p className="settings-note llm-error" role="alert">{login.error}</p>}
    {login.instance && <RemoteLoginDiagnostics diagnostics={login.diagnostics} />}
    {!failed && <>
      {login.verificationUri ? <a className="button button--primary llm-auth-link" href={login.verificationUri} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} strokeWidth={1.5} />Open authorization page</a>
        : <p className="settings-note" role="status">Waiting for the CLI to provide an authorization link…</p>}
      {login.userCode && <div className="llm-device-code"><span>Device code</span><code>{login.userCode}</code></div>}
      {login.callbackSubmitted && <p className="settings-note" role="status">Callback submitted. Status refreshes automatically. If login does not finish, cancel and start again; do not resend the callback.</p>}
      {login.needsCode && <form className="ssh-form" onSubmit={submit} autoComplete="off">
        <label className="settings-field" htmlFor={id}><span className="settings-field-label">{login.instance ? 'Callback URL' : 'Authorization code'}</span><input id={id} type="password" value={code} onChange={event => setCode(event.target.value)} required placeholder={login.instance ? 'http://localhost:…/callback?code=…' : 'Paste the code from the browser'} spellCheck={false} /><span className="settings-field-hint">{login.instance ? 'After sign-in the browser may show a localhost error. Copy the full address from that tab. It is sent privately to the SSH server.' : 'Sent directly to the running CLI and never stored.'}</span></label>
        <div className="ssh-form-actions"><Button type="submit" variant="primary" disabled={busy || !code.trim()}>Submit</Button></div>
      </form>}
    </>}
    {login.id && (login.instance || login.provider === 'kimi-coding') && !failed && <div className="ssh-form-actions"><Button variant="ghost" disabled={busy} onClick={() => { void run({ action: 'cancel', id: login.id! }); }}>Cancel login</Button></div>}
  </div>;
}

function RemoveAccount({ item, run, busy, onDone }: { item: LlmAccount; run: Run; busy: boolean; onDone: () => void }) {
  const [users, setUsers] = useState<NonNullable<LlmActionResult['users']> | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  useEffect(() => { void run({ action: 'users', provider: item.provider, account: item.account }, true).then(result => setUsers(result?.users ?? [])); }, [item.provider, item.account]); // eslint-disable-line react-hooks/exhaustive-deps
  const submit = async (event: FormEvent) => { event.preventDefault(); const ok = await run({ action: 'remove', provider: item.provider, account: item.account, confirmed: true, archiveUsers: !!users?.length }); if (ok) onDone(); };
  return <form className="ssh-form llm-remove" onSubmit={submit}>
    <p className="settings-note">Removes the credential <code>{item.provider}/{item.account}</code> from Hyper.{item.sshInstance ? ' Files on the SSH server are not changed.' : ''}</p>
    {users === null ? <p className="settings-loading" role="status">Checking agents…</p> : users.length > 0 && <p className="settings-note">Used by {users.length} agent{users.length === 1 ? '' : 's'}: {users.slice(0, 5).map(u => <code key={u.id}>{u.title || u.id}</code>).reduce<React.ReactNode[]>((acc, el, i) => i ? [...acc, ', ', el] : [el], [])}. They will be archived.</p>}
    <label className="settings-check"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />{users?.length ? `Archive ${users.length} agent${users.length === 1 ? '' : 's'} and remove the account.` : 'Remove this account.'}</label>
    <div className="ssh-form-actions"><Button variant="ghost" type="button" onClick={onDone}>Cancel</Button><Button className="button--danger" type="submit" disabled={busy || !confirmed || users === null}>Remove account</Button></div>
  </form>;
}

function AccountRow({ item, instances, run, busy, csrf }: { item: LlmAccount; instances: string[]; run: Run; busy: boolean; csrf: string }) {
  const [open, setOpen] = useState<'reconnect' | 'remove' | null>(null);
  const slot = accountSlot(item);
  const login = (item.provider === 'anthropic-oauth' ? 'claude-code' : item.provider) as LoginProvider;
  const canLogin = LOGIN_PROVIDERS.includes(login);
  const state = item.needsReconnect ? 'is-failed' : item.available ? 'is-verified' : 'is-pending';
  return <li className="llm-row" data-llm-account={`${item.provider}/${item.account}`}>
    <div className="llm-row-head">
      <span className={`llm-dot ${state}`} aria-hidden="true" />
      <span className="llm-row-name">{slot.name}</span>
      {slot.instance && <span className="llm-tag" title="Requests leave through this SSH instance">SSH · {slot.instance}</span>}
      {item.planType && <span className="llm-tag">{item.planType}</span>}
      {item.parkedAgents > 0 && <span className="llm-tag is-warning">{item.parkedAgents} parked</span>}
      <span className="llm-row-actions">
        {canLogin && <button type="button" className={`ssh-card-tab ${item.needsReconnect ? 'is-attention' : ''}`} aria-expanded={open === 'reconnect'} onClick={() => setOpen(open === 'reconnect' ? null : 'reconnect')}>Reconnect</button>}
        {REMOVABLE.has(item.provider) && <button type="button" className="ssh-card-tab is-danger" aria-expanded={open === 'remove'} onClick={() => setOpen(open === 'remove' ? null : 'remove')}>Remove</button>}
      </span>
    </div>
    <div className="llm-row-meta">
      {item.needsReconnect ? <span className="llm-quota is-critical">authentication required</span> : <Quota item={item} />}
      {!item.available && !item.needsReconnect && <span className="llm-quota is-unknown">unavailable</span>}
    </div>
    {item.provider === 'codex' && <CodexAccountReset key={item.account} account={item.account} csrfToken={csrf} disabled={busy} />}
    {open === 'reconnect' && <LoginForm provider={login} instances={instances} run={run} busy={busy} onDone={() => setOpen(null)} account={{ name: slot.instance ? slot.name : item.account, instance: slot.instance && /^ssh\./.test(item.account) ? slot.instance : null }} />}
    {open === 'remove' && <RemoveAccount item={item} run={run} busy={busy} onDone={() => setOpen(null)} />}
  </li>;
}

/** Settings → LLM Connections: subscription accounts grouped by provider, with official login flows. */
export function LlmConnectionsPanel() {
  const [accounts, setAccounts] = useState<LlmAccount[] | null>(null);
  const [logins, setLogins] = useState<LlmLogin[]>([]);
  const [instances, setInstances] = useState<string[]>([]);
  const [csrf, setCsrf] = useState('');
  const [icons, setIcons] = useState<Record<string, NavigationIcon | null>>({});
  const [loadError, setLoadError] = useState<{ text: string; forbidden: boolean } | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState<LoginProvider | null>(null);
  const loading = useRef(false);
  const load = useCallback(async (signal?: AbortSignal) => {
    if (loading.current && !signal) return; loading.current = true;
    try { const data = await getLlmConnections(signal); setAccounts(data.accounts); setLogins(data.logins); setInstances(data.instances); setCsrf(data.csrfToken); setIcons(data.providerIcons ?? {}); setLoadError(null); }
    catch (error) { if (signal?.aborted) return; setLoadError({ text: error instanceof Error ? error.message : 'Не удалось загрузить LLM Connections', forbidden: error instanceof ApiError && error.status === 403 }); }
    finally { loading.current = false; }
  }, []);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);
  const pending = logins.some(login => login.status === 'pending');
  useEffect(() => { if (!pending) return; const timer = setInterval(() => { void load(); }, 3000); return () => clearInterval(timer); }, [pending, load]);
  const run: Run = async (action, quiet) => {
    if (!quiet) { setBusy(true); setFeedback(null); }
    try {
      const result = await runLlmAction(action, csrf);
      if (!quiet) { if (result.message) setFeedback({ tone: 'success', text: result.message }); await load(); }
      return result;
    } catch (error) {
      setFeedback({ tone: 'error', text: error instanceof Error ? error.message : 'Action failed' });
      return null;
    } finally { if (!quiet) setBusy(false); }
  };
  const known = new Set(GROUPS.flatMap(group => group.providers));
  const other = accounts?.filter(item => !known.has(item.provider)) ?? [];
  return <div className="settings-panel" data-page="llm-connections">
    <header className="settings-panel-header llm-header">
      <div><h2>LLM Connections</h2><p>Subscription accounts used by agents. Sign in with the official provider flow locally or on an SSH instance.</p></div>
      <Button variant="ghost" onClick={() => { void load(); }} aria-label="Обновить" title="Refresh quota and status"><RefreshCw size={14} strokeWidth={1.5} /></Button>
    </header>
    {feedback && <div className={`settings-feedback is-${feedback.tone}`} role={feedback.tone === 'error' ? 'alert' : 'status'} aria-live="polite">{feedback.text}</div>}
    {loadError ? <div className="settings-feedback is-error" role="alert">{loadError.forbidden ? 'Только владелец может управлять LLM Connections.' : loadError.text}{!loadError.forbidden && <Button variant="ghost" onClick={() => { void load(); }}>Повторить</Button>}</div>
      : accounts === null ? <p className="settings-loading" role="status">Загрузка…</p>
      : <div className="llm-groups">
        {GROUPS.map(group => {
          const rows = accounts.filter(item => group.providers.includes(item.provider));
          const flows = logins.filter(login => group.providers.includes(login.provider));
          if (!rows.length && !flows.length && !group.login) return null;
          return <section key={group.id} className="llm-group" aria-labelledby={`llm-group-${group.id}`} data-provider={group.id}>
            <header className="llm-group-head">
              <NavigationChatIcon icon={icons[group.providers[0]]} />
              <h3 id={`llm-group-${group.id}`}>{group.title}</h3>
              <span className="llm-group-count">{rows.length || ''}</span>
              {group.login && <Button variant="ghost" className="llm-add" aria-expanded={adding === group.login} onClick={() => setAdding(adding === group.login ? null : group.login!)}><Plus size={14} strokeWidth={1.5} />Add account</Button>}
            </header>
            {adding === group.login && group.login && <LoginForm provider={group.login} instances={instances} run={run} busy={busy} onDone={() => setAdding(null)} />}
            {flows.map(login => <PendingLogin key={`${login.id ?? ''}${login.provider}/${login.account}`} login={login} run={run} busy={busy} />)}
            {rows.length > 0 ? <ul className="llm-rows">{rows.map(item => <AccountRow key={`${item.provider}/${item.account}`} item={item} instances={instances} run={run} busy={busy} csrf={csrf} />)}</ul>
              : !flows.length && <p className="settings-footnote">{group.hint ?? 'No accounts yet.'}</p>}
          </section>;
        })}
        {other.length > 0 && <section className="llm-group" aria-labelledby="llm-group-other"><header className="llm-group-head"><NavigationChatIcon /><h3 id="llm-group-other">Other</h3></header><ul className="llm-rows">{other.map(item => <AccountRow key={`${item.provider}/${item.account}`} item={item} instances={instances} run={run} busy={busy} csrf={csrf} />)}</ul></section>}
      </div>}
    {accounts !== null && !loadError && <LlmPolicySettings />}
  </div>;
}
