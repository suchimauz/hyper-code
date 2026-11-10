import { ChevronDown, ChevronUp, CornerDownLeft } from 'lucide-react';
import './batch-card.css';
import { Component, useEffect, useRef, useState, type ReactNode } from 'react';
import { usePluginUi } from '../../extensions/pluginRuntime';
import type { ExtensionBatchInputProps } from '../../extensions/types';
import { batchFieldUrl, getBatch, writeBatch, type BatchDraft, type BatchItem, type BatchSnapshot } from '../../lib/batches';

class EditorBoundary extends Component<{ children: ReactNode; onFailure: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFailure(); }
  render() { return this.state.failed ? <p role="alert">Редактор недоступен. Восстановите плагин или отмените вопросы.</p> : this.props.children; }
}
const picked = (draft: BatchDraft) => typeof draft.pick === 'string' ? [draft.pick] : draft.pick || [];
/** Collection-only native fields: no nested forms, endpoint calls or completion capabilities. */
export function BatchFields({ item, draft, onChange, busy }: { item: BatchItem; draft: BatchDraft; onChange: (value: BatchDraft) => void; busy: boolean }) {
  const [query, setQuery] = useState('');
  const spec = item.spec;
  const pick = (value: string, multiple: boolean) => onChange({ ...draft, pick: multiple ? picked(draft).includes(value) ? picked(draft).filter(v => v !== value) : [...picked(draft), value] : [value] });
  if (item.kind === 'confirm') return <fieldset className="question-options" disabled={busy}><legend>Ваш ответ</legend>{typeof spec.details === 'string' && <p>{spec.details}</p>}{[['yes', spec.confirmLabel || 'Да'], ['no', spec.declineLabel || 'Нет']].map(([value, label]) => <label className={`question-option ${draft.decision === value ? 'is-selected' : ''}`} key={String(value)}><input type="radio" name={item.key} checked={draft.decision === value} onChange={() => onChange({ ...draft, decision: String(value) })} /><span className="question-option-number" aria-hidden="true">{draft.decision === value ? '✓' : ''}</span><span className="question-option-label">{String(label)}</span></label>)}<label>Комментарий<textarea value={String(draft.comment || '')} onChange={event => onChange({ ...draft, comment: event.target.value })} /></label></fieldset>;
  if (item.kind === 'choice') {
    const options = (spec.options || []) as (string | { value: string; label?: string; description?: string })[];
    return <fieldset className="question-options" disabled={busy}><legend>Выберите ответ</legend>{options.map((raw, index) => { const option = typeof raw === 'string' ? { value: raw, label: raw } : raw; return <label className={`question-option ${picked(draft).includes(option.value) ? 'is-selected' : ''}`} key={option.value}><input type={spec.multiple ? 'checkbox' : 'radio'} name={item.key} checked={picked(draft).includes(option.value)} onChange={() => pick(option.value, !!spec.multiple)} /><span className="question-option-number" aria-hidden="true">{picked(draft).includes(option.value) ? '✓' : index + 1}</span><span className="question-option-copy"><span className="question-option-label">{option.label || option.value}</span>{option.description && <small className="question-description">{option.description}</small>}</span></label>; })}{!!spec.allowOther && <label>Другой ответ<textarea value={String(draft.other || '')} onChange={event => onChange({ ...draft, other: event.target.value })} /></label>}</fieldset>;
  }
  const rows = (spec.rows || []) as Record<string, unknown>[];
  const columns = (spec.columns || []) as { key: string; label?: string }[];
  const valueKey = String(spec.valueKey || 'id');
  const visible = rows.filter(row => JSON.stringify(row).toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return <fieldset className="question-options" disabled={busy}><legend>Выберите строки</legend><label>Поиск<input type="search" value={query} onChange={event => setQuery(event.target.value)} /></label><div style={{ maxHeight: 280, overflow: 'auto' }}><table><thead><tr><th scope="col">Выбор</th>{columns.map(column => <th scope="col" key={column.key}>{column.label || column.key}</th>)}</tr></thead><tbody>{visible.map(row => { const value = String(row[valueKey]); return <tr key={value}><td><input aria-label={`Выбрать ${String(row[String(spec.labelKey || valueKey)] ?? value)}`} type={spec.multiple ? 'checkbox' : 'radio'} name={item.key} checked={picked(draft).includes(value)} onChange={() => pick(value, !!spec.multiple)} /></td>{columns.map(column => <td key={column.key}>{String(row[column.key] ?? '')}</td>)}</tr>; })}</tbody></table></div><p role="status">Выбрано: {picked(draft).length}</p></fieldset>;
}

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
  const native = ['choice', 'confirm', 'grid', 'secret'].includes(item.kind);
  const unavailable = editorFailed || (!native && !Plugin);
  const disabled = busy || uncertain || snapshot.state !== 'open';
  const change = (next: BatchDraft) => { localDrafts.current[item.key] = next; setDraft(next); };
  const props: ExtensionBatchInputProps = { context: { agentId: snapshot.agentId, theme, readOnly: disabled }, input: { id: snapshot.id, kind: item.kind, title: item.title, message: item.message, spec: item.spec, state: snapshot.state }, step: { key: item.key, index: snapshot.currentStep, count: snapshot.items.length }, draft, onChange: change, busy: disabled, readOnly: disabled, error };
  return <div className="question-frame"><section className={`question-card batch-card${minimized ? ' is-minimized' : ''}`} aria-label={snapshot.title} aria-busy={disabled} onKeyDown={event => {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing || event.keyCode === 229 || event.repeat || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey || minimized || disabled || unavailable) return;
    if (!(event.target instanceof HTMLTextAreaElement) && (!(event.target instanceof HTMLInputElement) || !['radio', 'checkbox'].includes(event.target.type))) return;
    event.preventDefault(); void act(snapshot.currentStep === snapshot.items.length - 1 ? 'submit' : 'next');
  }}>
    {minimized && <button type="button" className="question-expand-strip" aria-label="Развернуть вопросы" onClick={() => setMinimized(false)}><ChevronDown size={16} /></button>}
    <header className="question-header"><span className="question-navigation" aria-label="Навигация по вопросам"><span>{snapshot.currentStep + 1}/{snapshot.items.length}</span>{snapshot.items.map((step, index) => <button type="button" key={step.key} aria-label={`Вопрос ${index + 1} из ${snapshot.items.length}`} aria-current={index === snapshot.currentStep ? 'step' : undefined} disabled={disabled || index === snapshot.currentStep || (index > snapshot.currentStep && !snapshot.items.slice(0, index).every(entry => entry.filled))} onClick={() => void act('back', index)}>{index + 1}</button>)}</span><span>{snapshot.title}</span>{!minimized && <button type="button" className="question-minimize" aria-label="Свернуть вопросы" onClick={() => setMinimized(true)}><ChevronUp size={16} /></button>}</header>
    <h2 ref={title} tabIndex={-1}>{item.title}</h2>
    <div className="question-body" hidden={minimized}>{item.message && <p className="question-message">{item.message}</p>}<p>Ответы пока не отправлены. До отправки всего набора их можно изменить.</p>
    {item.kind === 'secret' ? <><iframe key={item.key} ref={iframe} title={item.title} src={batchFieldUrl(snapshot.id, item.key, theme)} sandbox="allow-scripts allow-forms allow-same-origin" referrerPolicy="no-referrer" style={{ width: '100%', height: 160, border: 0 }} /><p>{item.filled ? 'Секрет сохранён в черновике; значение скрыто.' : 'Значение останется в защищённом поле.'}</p></> : native ? <BatchFields key={item.key} item={item} draft={draft} onChange={change} busy={disabled} /> : Plugin ? <EditorBoundary key={item.key} onFailure={() => setEditorFailed(true)}><Plugin {...props} /></EditorBoundary> : <p role="alert">Редактор недоступен. Восстановите плагин или отмените весь набор.</p>}
    {notice && <p role="status">{notice}</p>}
    {error && <p role="alert">{error} <button type="button" disabled={busy} onClick={() => { void getBatch(snapshot.id).then(next => { accept(next); setUncertain(false); setError(''); }).catch(() => setError('Не удалось обновить состояние.')); }}>Обновить состояние</button></p>}
    {snapshot.state === 'processing' && <p role="status">Сохраняем весь набор… Состояние обновится автоматически.</p>}
    </div><footer className="question-footer" hidden={minimized}><button type="button" disabled={disabled} onClick={() => void act('cancel')}>Отменить всё</button><button type="button" disabled={disabled || snapshot.currentStep === 0} onClick={() => void act('back')}>Назад</button><button type="button" disabled={disabled || unavailable || (item.kind === 'secret' && !ready)} onClick={() => void act(snapshot.currentStep === snapshot.items.length - 1 ? 'submit' : 'next')}>{snapshot.currentStep === snapshot.items.length - 1 ? 'Отправить все ответы' : 'Далее'} <CornerDownLeft size={14} aria-hidden="true" /></button></footer>
  </section></div>;
}
