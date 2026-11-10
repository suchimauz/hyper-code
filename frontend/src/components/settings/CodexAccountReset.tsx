import { useId, useRef, useState } from 'react';
import { Button } from '../ui/Button';
import { requestJson } from '../../lib/mauzcode';

type ResetResult = { outcome: 'reset' | 'nothingToReset' | 'noCredit' | 'alreadyRedeemed'; windowsReset: number | null };
const messages: Record<ResetResult['outcome'], string> = {
  reset: 'Codex quota reset completed.',
  nothingToReset: 'There is no quota to reset.',
  noCredit: 'No reset credit is available.',
  alreadyRedeemed: 'This reset attempt was already redeemed.',
};

/** Explicit finite-credit redemption. Persist the retry identity before sending so uncertain responses never silently create a new redemption. */
export function CodexAccountReset({ account, csrfToken, disabled = false }: { account: string; csrfToken: string; disabled?: boolean }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const inFlight = useRef(false);
  const attempt = useRef<string | null>(null);
  const storageKey = `mauzcode.codex-reset.pending:${account}`;
  const submit = async () => {
    if (!confirmed || disabled || !csrfToken || inFlight.current) return;
    inFlight.current = true;
    setBusy(true); setError(''); setMessage('');
    try {
      // Storage failure is fail-closed: no credit is spent without a recoverable retry identity.
      const key = attempt.current ?? sessionStorage.getItem(storageKey) ?? crypto.randomUUID();
      attempt.current = key;
      sessionStorage.setItem(storageKey, key);
      const result = await requestJson<ResetResult>('/llms/codex/reset', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
        body: JSON.stringify({ account, confirmed: true, idempotencyKey: key }),
      });
      if (!Object.prototype.hasOwnProperty.call(messages, result.outcome)) throw new Error('Unrecognized reset result');
      sessionStorage.removeItem(storageKey);
      attempt.current = null;
      setMessage(messages[result.outcome]); setOpen(false); setConfirmed(false);
    } catch {
      setError('Reset was not confirmed. Retry this same attempt; it will reuse its saved identity to avoid spending another credit. If you lack owner access or the request token expired, reopen Settings first.');
    } finally { inFlight.current = false; setBusy(false); }
  };
  return <div className="llm-reset">
    <Button variant="ghost" disabled={disabled || busy || !csrfToken} aria-expanded={open} aria-controls={id} onClick={() => { setOpen(!open); setConfirmed(false); }}>Reset Codex quota…</Button>
    {open && <div id={id} className="ssh-form">
      <p className="settings-note">Reset rate-limit quota for Codex account <code>{account}</code>. A successful reset spends one finite reset credit and cannot be undone. Codex chooses an available credit; if none is available, no reset occurs. This does not remove credentials or start sign-in. Owner access is required.</p>
      <p className="settings-note">After an uncertain response, retries use the same saved attempt, including after reopening this page in this tab.</p>
      <label className="settings-check"><input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} />I authorize spending one reset credit for this account.</label>
      <div className="ssh-form-actions">
        <Button variant="ghost" disabled={busy} onClick={() => { setOpen(false); setConfirmed(false); }}>Cancel</Button>
        <Button className="button--danger" disabled={!confirmed || busy || disabled || !csrfToken} onClick={() => { void submit(); }}>{busy ? 'Resetting…' : error ? 'Retry same reset' : 'Spend credit and reset'}</Button>
      </div>
    </div>}
    {error && <p className="settings-note llm-error" role="alert">{error}</p>}
    {message && <p className="settings-note" role="status">{message}</p>}
  </div>;
}
