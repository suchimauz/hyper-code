import { CornerDownLeft } from 'lucide-react';
import './batch-card.css';
import { Component, useEffect, useRef, useState, type ReactNode } from 'react';
import { usePluginUi } from '../../extensions/pluginRuntime';
import type { ExtensionBatchInputProps } from '../../extensions/types';
import { batchFieldUrl, getBatch, writeBatch, type BatchDraft, type BatchSnapshot } from '../../lib/batches';
import { InputFrame, isCommitEnter } from './inputs/InputFrame';
import { BatchFields, nativeBatchKinds } from './inputs/batch';
import { SecretBody, secretModeLabel } from './inputs/secret';

class EditorBoundary extends Component<{ children: ReactNode; onFailure: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFailure(); }
  render() { return this.state.failed ? <p role="alert">Редактор недоступен. Восстановите плагин или отмените вопросы.</p> : this.props.children; }
}
export { BatchFields } from './inputs/batch';

/** Parent never receives secret values: only origin/source-bound ready/saved/error acknowledgements. */
export function BatchCard({ initial, onSnapshot }: { initial: BatchSnapshot; onSnapshot: (snapshot: BatchSnapshot) => void }) {
  const { registry } = usePluginUi();
  const [snapshot, setSnapshot] = useState(initial);
  const [draft, setDraft] = useState<BatchDraft>(() => initial.items[initial.currentStep]?.draft || {});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [ready, setReady] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [editorFailed, setEditorFailed] = useState(false);
  const localDrafts = useRef<Record<string, BatchDraft>>({});
  const lock = useRef(false);
  const alive = useRef(true);
  const iframe = useRef<HTMLIFrameElement>(null);
  const pending = useRef<{ resolve: () => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> } | null>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const item = snapshot.items[snapshot.currentStep];
  const theme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  const discardLocalDrafts = () => {
    if (Object.keys(localDrafts.current).length) setNotice('Набор обновлён. Несохранённые правки сброшены, чтобы не перезаписать ответы из другого окна. Проверьте сохранённые ответы.');
    localDrafts.current = {};
  };
  // Only successful writes made by this card may carry local edits into the next revision.
  const accept = (next: BatchSnapshot, ownWrite = false) => { if (!alive.current) return; if (!ownWrite) discardLocalDrafts(); setSnapshot(next); setDraft(next.items[next.currentStep]?.kind === 'secret' ? {} : localDrafts.current[next.items[next.currentStep]?.key] || next.items[next.currentStep]?.draft || {}); onSnapshot(next); };
  useEffect(() => { alive.current = true; return () => { alive.current = false; if (pending.current) { clearTimeout(pending.current.timer); pending.current.reject(new Error('Закрыто')); pending.current = null; } }; }, []);
  // Polling may update processing/terminal receipts, but must not replace an unsaved open editor.
  useEffect(() => {
    if (!lock.current && (initial.state !== 'open' || initial.revision > snapshot.revision)) {
      discardLocalDrafts();
      setSnapshot(initial); setDraft(initial.items[initial.currentStep]?.kind === 'secret' ? {} : initial.items[initial.currentStep]?.draft || {});
      setUncertain(false);
      if (initial.state === 'open') setError('Набор обновлён в другом окне. Проверьте сохранённые ответы.');
    }
  }, [initial, busy]);
  useEffect(() => { setReady(false); setEditorFailed(false); title.current?.focus(); }, [item?.key]);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      const data = event.data;
      if (event.origin !== window.location.origin || event.source !== iframe.current?.contentWindow || !data || data.source !== 'mauzcode-batch-secret' || data.id !== snapshot.id || data.key !== item?.key) return;
      if (data.state === 'ready') setReady(true);
      if (!pending.current || !['saved', 'error'].includes(data.state)) return;
      const wait = pending.current; pending.current = null; clearTimeout(wait.timer);
      if (data.state === 'error') wait.reject(new Error('Не удалось сохранить секрет. Проверьте поле и повторите вручную.'));
      else wait.resolve();
    };
    window.addEventListener('message', receive); return () => window.removeEventListener('message', receive);
  }, [snapshot.id, item?.key]);
  const saveSecret = () => new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { pending.current = null; reject(new Error('Нет ответа от защищённого поля. Состояние будет обновлено без повторной отправки.')); }, 15000);
    pending.current = { resolve, reject, timer };
    iframe.current?.contentWindow?.postMessage({ target: 'mauzcode-batch-secret', id: snapshot.id, key: item.key, action: 'save', revision: snapshot.revision }, window.location.origin);
  });
  const act = async (action: 'next' | 'back' | 'submit' | 'cancel', targetStep?: number) => {
    if (lock.current || uncertain || snapshot.state !== 'open') return;
    lock.current = true; setBusy(true); setError('');
    try {
      let current = snapshot;
      if (action === 'cancel') current = await writeBatch(snapshot.id, 'cancel', { revision: snapshot.revision }, snapshot.csrfToken);
      else if (action === 'back') current = await writeBatch(snapshot.id, 'draft', { revision: snapshot.revision, key: item.key, currentStep: targetStep ?? snapshot.currentStep - 1 }, snapshot.csrfToken);
      else {
        if (item.kind === 'secret') { await saveSecret(); current = await getBatch(snapshot.id); }
        current = await writeBatch(snapshot.id, 'draft', { revision: current.revision, key: item.key, ...(item.kind === 'secret' ? {} : { values: draft }), currentStep: action === 'next' ? snapshot.currentStep + 1 : snapshot.currentStep }, current.csrfToken || snapshot.csrfToken);
        delete localDrafts.current[item.key];
        if (action === 'submit') {
          for (const [key, values] of Object.entries(localDrafts.current)) {
            current = await writeBatch(snapshot.id, 'draft', { revision: current.revision, key, values }, current.csrfToken || snapshot.csrfToken);
            delete localDrafts.current[key];
          }
          current = await writeBatch(snapshot.id, 'submit', { revision: current.revision, requestId: crypto.randomUUID() }, current.csrfToken || snapshot.csrfToken);
        }
      }
      accept(current, true);
    } catch {
      // A network failure may mean the write succeeded. Read only; never replay a write.
      setError('Не удалось завершить действие. Проверьте ответы. Автоматической повторной отправки не будет.');
      try { const next = await getBatch(snapshot.id); if (next.revision !== snapshot.revision || next.state !== snapshot.state) accept(next); } catch { setUncertain(true); setError('Связь потеряна. Обновите состояние перед следующим действием.'); }
    } finally { lock.current = false; if (alive.current) setBusy(false); }
  };
  if (!item || !['open', 'processing'].includes(snapshot.state)) return null;
  const Plugin = registry.inputKinds.find(entry => entry.kind === item.kind)?.batchComponent;
  const native = item.kind === 'secret' || item.kind in nativeBatchKinds;
  const unavailable = editorFailed || (!native && !Plugin);
  const disabled = busy || uncertain || snapshot.state !== 'open';
  const change = (next: BatchDraft) => { localDrafts.current[item.key] = next; setDraft(next); };
  const props: ExtensionBatchInputProps = { context: { agentId: snapshot.agentId, theme, readOnly: disabled }, input: { id: snapshot.id, kind: item.kind, title: item.title, message: item.message, spec: item.spec, state: snapshot.state }, step: { key: item.key, index: snapshot.currentStep, count: snapshot.items.length }, draft, onChange: change, busy: disabled, readOnly: disabled, error };
  const last = snapshot.currentStep === snapshot.items.length - 1;
  const kind = nativeBatchKinds[item.kind];
  const navigation = <span className="question-navigation" aria-label="Навигация по вопросам"><span>{snapshot.currentStep + 1}/{snapshot.items.length}</span>{snapshot.items.map((step, index) => <button type="button" key={step.key} aria-label={`Вопрос ${index + 1} из ${snapshot.items.length}`} aria-current={index === snapshot.currentStep ? 'step' : undefined} disabled={disabled || index === snapshot.currentStep || (index > snapshot.currentStep && !snapshot.items.slice(0, index).every(entry => entry.filled))} onClick={() => void act('back', index)}>{index + 1}</button>)}</span>;
  const body = item.kind === 'secret'
    ? <SecretBody key={item.key} frameRef={iframe} title={item.title} src={batchFieldUrl(snapshot.id, item.key, theme)} hint={item.filled ? 'Секрет сохранён в черновике; значение скрыто.' : 'Значение останется в защищённом поле.'} />
    : kind ? <BatchFields key={item.key} item={item} draft={draft} onChange={change} busy={disabled} />
    : Plugin ? <EditorBoundary key={item.key} onFailure={() => setEditorFailed(true)}><Plugin {...props} /></EditorBoundary>
    : <p role="alert">Редактор недоступен. Восстановите плагин или отмените весь набор.</p>;
  return <InputFrame className="batch-card" noun="вопросы" ariaLabel={snapshot.title} busy={disabled} minimized={minimized} onMinimize={() => setMinimized(value => !value)}
    label={navigation} hint={item.kind === 'secret' ? secretModeLabel(item.spec.mode) : kind ? kind.hint(item.spec) : snapshot.title} title={item.title} titleRef={title} message={item.message}
    error={error && <>{error} <button type="button" disabled={busy} onClick={() => { void getBatch(snapshot.id).then(next => { accept(next); setUncertain(false); setError(''); }).catch(() => setError('Не удалось обновить состояние.')); }}>Обновить состояние</button></>}
    note={kind?.note?.(draft) ?? (last ? 'Ответы уйдут агенту вместе' : 'Ответы пока не отправлены')}
    leadingActions={<><button type="button" disabled={disabled} onClick={() => void act('cancel')}>Отменить всё</button><button type="button" disabled={disabled || snapshot.currentStep === 0} onClick={() => void act('back')}>Назад</button></>}
    actions={<button type="button" className="confirm-accept" disabled={disabled || unavailable || (item.kind === 'secret' && !ready)} onClick={() => void act(last ? 'submit' : 'next')}>{last ? 'Отправить все ответы' : 'Далее'} <CornerDownLeft size={14} aria-hidden="true" /></button>}
    onKeyDown={event => {
      if (!isCommitEnter(event) || minimized || disabled || unavailable) return;
      if (!(event.target instanceof HTMLTextAreaElement) && (!(event.target instanceof HTMLInputElement) || !['radio', 'checkbox'].includes(event.target.type))) return;
      event.preventDefault(); void act(last ? 'submit' : 'next');
    }}>
    {body}
    {notice && <p className="question-message" role="status">{notice}</p>}
    {snapshot.state === 'processing' && <p className="question-message" role="status">Сохраняем весь набор… Состояние обновится автоматически.</p>}
  </InputFrame>;
}
