import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { closeLocalPushNotification } from '../../lib/pushNotifications';
import '../../styles/scrollbar.css';
import '../../styles/questions.css';

export type SecretInput = { id: string; kind: 'secret'; title: string; message?: string; saveAs?: string; mode?: string };
type FieldMessage = { source: 'mauzcode-secret'; id: string; state: 'ready' | 'open' | 'processing' | 'submitted' | 'cancelled'; error?: string; filled?: boolean };

/**
 * Native MauzCode secret card. The frame, copy and buttons are React; only the value field lives in an
 * isolated same-origin document that owns the CSRF-bound POST. The card sends submit/cancel/focus commands
 * and receives state and error text only, never the typed value.
 */
export function SecretCard({ agentId, input, theme, onDone }: { agentId: string; input: SecretInput; theme: 'light' | 'dark'; onDone?: () => void }) {
  const titleId = useId();
  const frame = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [minimized, setMinimized] = useState(false);
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
  const modeLabel = input.mode === 'otp' ? 'Одноразовый код' : input.mode === 'text' ? 'Скрытое значение' : 'Пароль или ключ';
  return <div className="question-frame"><section className={`question-card secret-card${minimized ? ' is-minimized' : ''}`} aria-labelledby={titleId} aria-busy={busy}>
    {minimized && <button type="button" className="question-expand-strip" aria-label="Развернуть форму" aria-expanded={false} onClick={() => setMinimized(false)}><ChevronDown size={16} aria-hidden="true" /></button>}
    <header className="question-header"><span>Секрет</span><span>{modeLabel}</span>{!minimized && <button type="button" className="question-minimize" aria-label="Свернуть форму" aria-expanded={true} onClick={() => setMinimized(true)}><ChevronUp size={16} /></button>}</header>
    <h2 id={titleId}>{minimized ? <span className="question-copy-clamped">{input.title}</span> : input.title}</h2>
    <div className="question-body" hidden={minimized}>
      {input.message && <p className="question-message">{input.message}</p>}
      <iframe ref={frame} className="secret-field-frame" title={input.title} src={src} referrerPolicy="no-referrer" sandbox="allow-scripts allow-forms allow-same-origin" />
      <p className="secret-hint">{input.saveAs ? <>Сохранится как <code>{input.saveAs}</code> · </> : null}значение не увидят ни агент, ни история чата</p>
    </div>
    {!minimized && error && <p className="question-error" role="alert">{error}</p>}
    <footer className="question-footer" hidden={minimized}><span>Значение уйдёт в зашифрованное хранилище</span><span className="confirm-actions">
      <button type="button" className="confirm-decline" disabled={locked} onClick={() => command('cancel')}>Отмена</button>
      <button type="button" className="confirm-accept" disabled={locked} onClick={() => command('submit')}>{busy ? 'Сохраняем…' : 'Сохранить'}</button>
    </span></footer>
  </section></div>;
}
