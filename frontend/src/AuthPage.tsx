import { useEffect, useState } from 'react';
import './styles/auth.css';

/** Public display data only: never sessions, tokens, provider secrets or user records. */
export type AuthModel = {
  kind: 'login'; next: string; message: string; error: string | null;
  showPassword: boolean; needsEmail: boolean; google: { domain: string } | null;
  oidc: { label: string } | null; providerUnavailable: boolean;
} | { kind: 'setup'; name: string; email: string; needsCurrent: boolean; error: string | null };

/** Native pre-auth presentation. Browser form POSTs preserve the existing auth protocol. */
export function AuthForm({ model }: { model: AuthModel }) {
  return <main className="auth-entry"><section className="auth-card" aria-labelledby="auth-heading">
    <h1 id="auth-heading">{model.kind === 'setup' ? 'Welcome to Hyper' : 'Hyper'}</h1>
    <p>{model.kind === 'login' ? model.message : model.needsCurrent ? 'Your existing password stays the same. Confirm who you are.' : 'Tell Hyper who you are.'}</p>
    {model.error && <p role="alert" className="auth-error">{model.error}</p>}
    {model.kind === 'login' ? <>
      {model.oidc && <a className="auth-provider" href={`/auth/oidc?next=${encodeURIComponent(model.next)}`}>Sign in with {model.oidc.label}</a>}
      {model.google && <a className="auth-provider" href={`/auth/google?next=${encodeURIComponent(model.next)}`}>Sign in with Google ({model.google.domain})</a>}
      {model.providerUnavailable && <p role="alert">The sign-in service is unreachable. Try again in a minute.</p>}
      {model.showPassword && <form method="post" action="/auth/login">
        <input type="hidden" name="next" value={model.next} />
        {model.needsEmail && <label>Email<input name="email" type="email" autoComplete="username" required /></label>}
        <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
        <button type="submit">Sign in</button>
      </form>}
    </> : <form method="post" action="/auth/setup">
      {model.needsCurrent && <label>Current password<input name="current" type="password" autoComplete="current-password" required autoFocus /></label>}
      <label>Your name<input name="name" defaultValue={model.name} required autoFocus={!model.needsCurrent} /></label>
      <label>Email (optional)<input name="email" type="email" autoComplete="email" defaultValue={model.email} /></label>
      {!model.needsCurrent && <label>Password (optional — without one, Hyper opens without sign-in)<input name="password" type="password" minLength={8} autoComplete="new-password" /></label>}
      <button type="submit">Continue</button>
    </form>}
  </section></main>;
}

/** Mount only at /auth/login or /auth/setup, before the authenticated application shell. */
export default function AuthPage() {
  const [model, setModel] = useState<AuthModel | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const path = window.location.pathname;
    if (path !== '/auth/login' && path !== '/auth/setup') { setError('Unknown sign-in page.'); return; }
    void fetch(path + window.location.search, { headers: { Accept: 'application/json' }, credentials: 'same-origin', signal: controller.signal }).then(async response => {
      // Availability guards redirect to setup/login/home. Navigate the browser, not the form.
      if (response.redirected) { window.location.replace(response.url); return; }
      if (!response.ok) throw new Error('Sign-in page is unavailable. Please reload to try again.');
      const data = await response.json() as AuthModel;
      if (data.kind !== 'login' && data.kind !== 'setup') throw new Error('Invalid sign-in page response.');
      setModel(data);
      document.title = `${data.kind === 'login' ? 'Sign in' : 'Setup'} · Hyper`;
    }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Sign-in page is unavailable.'); });
    return () => controller.abort();
  }, []);
  if (model) return <AuthForm model={model} />;
  return <main className="auth-entry"><section className="auth-card"><h1>Hyper</h1><p role={error ? 'alert' : 'status'}>{error ?? 'Loading sign-in…'}</p>{error && <a href={window.location.href}>Reload</a>}</section></main>;
}
