import { createPortal } from 'react-dom';
import { useRef, useState, type ReactNode } from 'react';
import { MessageInput } from './MessageInput';
import { sendMessage, stopAgent } from '../../lib/hyper';
import { executeCommand, notifyPlanningChanged, validateCommand } from '../../lib/commands';
import { ComposerFooter } from './ComposerFooter';
import { PendingAttachments } from './PendingAttachments';
import { useChatFileDrop } from '../../hooks/useChatFileDrop';
import { attachmentLimitError } from '../../lib/attachments';
import { useMessageQueue } from '../../hooks/useMessageQueue';
import { QueueDock } from './QueueDock';
import { GoalDock } from './GoalDock';

type Pending = { text: string; key: string; target?: 'queue' | 'send' };
function readDraft(id: string): Pending | null {
  try { const value = JSON.parse(sessionStorage.getItem(`hyper-ui-draft:${id}`) || 'null'); return value && typeof value.text === 'string' && typeof value.key === 'string' ? value : null; } catch { return null; }
}
type LiveComposerProps = { focusRequest?: number; readOnly?: boolean; agentId: string; running: boolean; onAccepted: () => void; mascot?: ReactNode; planningBadge?: ReactNode };
export function LiveComposer(props: LiveComposerProps) { return <SessionComposer key={props.agentId} {...props} />; }
function SessionComposer({ focusRequest, agentId, running, onAccepted, mascot, planningBadge, readOnly = false }: LiveComposerProps) {
  const queue = useMessageQueue(agentId, onAccepted);
  const [goalEditor, setGoalEditor] = useState<{ text: string } | null>(null);
  const queueRetry = useRef<string | null>(null);
  const pending = useRef<Pending | null>(readDraft(agentId));
  const [text, setText] = useState(pending.current?.text || '');
  const [busy, setBusy] = useState(false); const lock = useRef(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const compactKey = useRef<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [revision, setRevision] = useState(0);
  const anchor = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const filesKey = useRef<string | null>(null);
  const persist = (value: Pending) => { pending.current = value; try { sessionStorage.setItem(`hyper-ui-draft:${agentId}`, JSON.stringify(value)); } catch { /* Draft still survives retries while mounted. */ } };
  const addFiles = (added: File[]) => {
    if (lock.current || readOnly) return;
    const next = [...files, ...added]; const issue = attachmentLimitError(next);
    if (issue) { setError(issue); return; }
    setFiles(next); filesKey.current = null; pending.current = null; setError('');
  };
  const removeFile = (index: number) => {
    if (lock.current || readOnly) return;
    setFiles(files.filter((_, i) => i !== index)); filesKey.current = null; pending.current = null;
  };
  const dragging = useChatFileDrop({ anchor, onFiles: addFiles, disabled: busy || readOnly });
  const send = async () => {
    const value = text.trim(); if ((!value && !files.length) || lock.current || readOnly) return;
    lock.current = true; setBusy(true); setError('');
    const submission = files.length ? { text: value, key: filesKey.current ?? (filesKey.current = crypto.randomUUID()) } : pending.current?.text === value ? pending.current : { text: value, key: crypto.randomUUID() };
    const queued = !value.startsWith('/') && (submission.target === 'queue' || queueRetry.current === submission.key || (submission.target !== 'send' && (running || queue.waitingForInput)));
    submission.target = queued ? 'queue' : 'send';
    if (queued) queueRetry.current = submission.key;
    // Files stay in browser memory; never persist their request key for a text-only remount.
    persist(files.length ? { text: value, key: crypto.randomUUID() } : submission);
    try {
      if (/^\/goal(?:\s|$)/.test(value)) {
        if (files.length) throw new Error('Команда /goal не принимает вложения');
        setGoalEditor({ text: value.slice(5).trim() });
      } else {
      if (value.startsWith('/') && running) throw new Error('Сначала остановите выполнение, затем повторите команду.');
      await validateCommand(value, files.length);
      if (value.startsWith('/') && !files.length) {
        const result = await executeCommand(agentId, value, submission.key);
        if (result.status === 'failed' || result.status === 'interrupted') { persist({ text: value, key: crypto.randomUUID() }); throw new Error(result.error || 'Команда не выполнена. Новая отправка начнёт новую попытку.'); }
        notifyPlanningChanged(agentId); setNotice('');
      } else if (queued) await queue.enqueue(value, submission.key, files);
      else { const ack = await sendMessage(agentId, value, submission.key, files); if (ack.queued) void queue.refresh(); }
      }
      setFiles([]); filesKey.current = null; setRevision(n => n + 1);
      setText(''); pending.current = null;
      try { sessionStorage.removeItem(`hyper-ui-draft:${agentId}`); } catch { /* In-memory state has already cleared. */ }
      onAccepted();
    } catch (err) { setError(`${err instanceof Error ? err.message : String(err)}. Файлы сохраняются до закрытия этой страницы. Повторная отправка использует тот же ключ.`); }
    finally { lock.current = false; setBusy(false); }
  };
  const stop = async () => {
    if (lock.current || readOnly) return; lock.current = true; setBusy(true); setError('');
    try { await stopAgent(agentId); onAccepted(); } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { lock.current = false; setBusy(false); }
  };
  const compact = async () => {
    if (lock.current || running || readOnly) return;
    lock.current = true; setBusy(true); setError(''); setNotice('');
    try {
      const result = await executeCommand(agentId, '/compact', compactKey.current ?? (compactKey.current = crypto.randomUUID()));
      if (result.status !== 'running') compactKey.current = null;
      if (result.status === 'failed' || result.status === 'interrupted') throw new Error(result.error || 'Сжатие не выполнено.');
      setRevision(n => n + 1); onAccepted();
    }
    catch (err) { setNotice(''); setError(err instanceof Error ? err.message : String(err)); }
    finally { lock.current = false; setBusy(false); }
  };
  return <fieldset disabled={readOnly} className={`composer-readonly-boundary ${readOnly ? 'is-archived' : ''}`} aria-label={readOnly ? 'Ввод недоступен' : undefined}><div ref={anchor} className="composer-input-anchor">{dragging && anchor.current?.closest('.chat-panel') && createPortal(<div className="chat-file-drop-overlay" aria-hidden="true">Перетащите файлы, чтобы прикрепить к сообщению</div>, anchor.current.closest('.chat-panel')!)}{mascot}<GoalDock agentId={agentId} running={running} disabled={readOnly || busy} editor={goalEditor} onClose={() => setGoalEditor(null)} onAccepted={onAccepted} /><QueueDock queue={queue} running={running} disabled={readOnly || busy} /><MessageInput focusRequest={focusRequest} onSteerAll={running && !queue.waitingForInput && queue.items.length ? () => { if (!busy && !readOnly && !queue.processing) void queue.perform(queue.items, 'steer'); } : undefined} commandsEnabled commandMenuOpen={menuOpen} onCommandMenuClose={() => setMenuOpen(false)} onFile={() => fileInput.current?.click()} onCompact={() => { void compact(); }} placeholder={running && queue.items.length ? 'Ctrl/Cmd+Enter — направить всю очередь агенту' : 'Сообщение или /команда…'} onFiles={addFiles} attachments={files.length ? <PendingAttachments files={files} disabled={busy || readOnly} onRemove={removeFile} /> : undefined} hasAttachments={files.length > 0} value={text} disabled={busy || readOnly} running={running && !readOnly} onStop={() => { void stop(); }} onSend={() => { void send(); }}
    onChange={value => { setText(value); filesKey.current = null; if (value.trim() !== pending.current?.text) persist({ text: value, key: crypto.randomUUID() }); }}
  /></div>
    <input ref={fileInput} type="file" multiple hidden aria-label="Добавить файлы" onChange={event => {
      addFiles(Array.from(event.target.files || [])); event.target.value = '';
    }} />
    <div><ComposerFooter planningBadge={planningBadge} onModelBusy={value => { lock.current = value; setBusy(value); }} onModelSaved={() => { setRevision(n => n + 1); onAccepted(); }} menuOpen={menuOpen} onMenuToggle={() => setMenuOpen(open => !open)} agentId={agentId} busy={busy || readOnly} running={running} revision={revision} /></div>
    {error && running && text.startsWith('/') && <button type="button" className="button button--secondary" disabled={busy || readOnly} onClick={() => { void stop(); }}>Остановить выполнение</button>}
    {notice && <p role="status" className="transcript-notice">{notice}</p>}{error && <p role="alert" className="connection-error">{error}</p>}</fieldset>;
}
