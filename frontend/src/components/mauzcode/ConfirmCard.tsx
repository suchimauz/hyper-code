import { useId, useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { ChatMarkdown } from './ChatMarkdown';
import { readConfirmComment, saveConfirmComment, type ConfirmAnswer, type ConfirmInput } from '../../lib/confirms';
import '../../styles/scrollbar.css';
import '../../styles/questions.css';

/** Native MauzCode confirm (yes/no) input in the same frame as choice questions. */
export function ConfirmCard({ input, busy = false, error = '', onSubmit, minimized = false, onMinimize }: { input: ConfirmInput; busy?: boolean; error?: string; minimized?: boolean; onMinimize?: () => void; onSubmit: (answer: ConfirmAnswer) => void }) {
  const titleId = useId();
  const [comment, setComment] = useState(() => readConfirmComment(input.agentId, input.id));
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => { const node = ref.current; if (!node || minimized) return; node.style.height = 'auto'; node.style.height = `${node.scrollHeight + 2}px`; }, [comment, minimized]);
  const locked = busy || input.state !== 'open';
  const send = (decision: 'yes' | 'no') => { if (!locked) onSubmit({ decision, ...(comment.trim() ? { comment: comment.trim() } : {}) }); };
  return <div className="question-frame"><section className={`question-card confirm-card${minimized ? ' is-minimized' : ''}`} aria-labelledby={titleId} aria-busy={busy}>
    {minimized && onMinimize && <button type="button" className="question-expand-strip" aria-label="Развернуть вопрос" aria-expanded={false} onClick={onMinimize}><ChevronDown size={16} aria-hidden="true"/></button>}
    <header className="question-header"><span>Подтверждение</span><span>{input.spec.danger ? 'Необратимое действие' : 'Да или нет'}</span>{!minimized && onMinimize && <button type="button" className="question-minimize" aria-label="Свернуть вопрос" aria-expanded={true} onClick={onMinimize}><ChevronUp size={16}/></button>}</header>
    <h2 id={titleId}>{minimized ? <span className="question-copy-clamped">{input.title}</span> : input.title}</h2>
    <div className="question-body" hidden={minimized}>
      {input.message && <p className="question-message">{input.message}</p>}
      {input.spec.details && <div className="confirm-details"><ChatMarkdown>{input.spec.details}</ChatMarkdown></div>}
      <textarea ref={ref} className="question-other confirm-comment" aria-label="Комментарий" placeholder="Комментарий (необязательно)" rows={1} maxLength={2000} disabled={locked} value={comment}
        onChange={event => { setComment(event.target.value); saveConfirmComment(input.agentId, input.id, event.target.value); }}
        onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) { event.preventDefault(); send('yes'); } }} />
    </div>
    {!minimized && error && <p className="question-error" role="alert">{error}</p>}
    <footer className="question-footer" hidden={minimized}><span>{input.state !== 'open' ? 'Вопрос уже закрыт' : 'Ответ будет отправлен агенту'}</span><span className="confirm-actions">
      <button type="button" className="confirm-decline" disabled={locked} onClick={() => send('no')}>{input.spec.declineLabel}</button>
      <button type="button" className={`confirm-accept${input.spec.danger ? ' is-danger' : ''}`} disabled={locked} onClick={() => send('yes')}>{busy ? 'Отправляем…' : input.spec.confirmLabel}</button>
    </span></footer>
  </section></div>;
}
