import { useEffect, useRef, useState } from 'react';
import { InputFrame } from './inputs/InputFrame';
import { SecretActions, SecretBody, secretModeLabel } from './inputs/secret';
import { closeLocalPushNotification } from '../../lib/pushNotifications';

export type SecretInput = { id: string; kind: 'secret'; title: string; message?: string; saveAs?: string; mode?: string };
type FieldMessage = { source: 'mauzcode-secret'; id: string; state: 'ready' | 'open' | 'processing' | 'submitted' | 'cancelled'; error?: string; filled?: boolean };

/**
 * Native MauzCode secret card. The frame, copy and buttons are React; only the value field lives in an
 * isolated same-origin document that owns the CSRF-bound POST. The card sends submit/cancel/focus commands
 * and receives state and error text only, never the typed value.
 */
export function SecretCard({ agentId, input, theme, onDone }: { agentId: string; input: SecretInput; theme: 'light' | 'dark'; onDone?: () => void }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const listen = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow) return;
      const data = event.data as FieldMessage;
      if (!data || data.source !== 'mauzcode-secret' || data.id !== input.id) return;
      if (data.state === 'ready') { setReady(true); return; }
      setBusy(data.state === 'processing');
      setError(data.error || '');
      if (data.state === 'submitted' || data.state === 'cancelled') {
        // This device showed the notification for this request; close it here.
        void closeLocalPushNotification(input.id);
        onDone?.();
      }
    };
    window.addEventListener('message', listen);
    return () => window.removeEventListener('message', listen);
  }, [input.id, onDone]);
  const command = (action: 'submit' | 'cancel' | 'focus') => frame.current?.contentWindow?.postMessage({ target: 'mauzcode-secret', id: input.id, action }, window.location.origin);
  const locked = busy || !ready;
  const src = `/input/compat?agentId=${encodeURIComponent(agentId)}&id=${encodeURIComponent(input.id)}&theme=${theme}&view=field`;
  return <InputFrame className="secret-card" busy={busy} label="Секрет" hint={secretModeLabel(input.mode)} title={input.title} message={input.message} error={error}
    note="Значение уйдёт в зашифрованное хранилище"
    actions={<SecretActions busy={busy} disabled={locked} onSubmit={() => command('submit')} onCancel={() => command('cancel')} />}>
    <SecretBody frameRef={frame} title={input.title} src={src} hint={<>{input.saveAs ? <>Сохранится как <code>{input.saveAs}</code> · </> : null}значение не увидят ни агент, ни история чата</>} />
  </InputFrame>;
}
