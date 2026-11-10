import { useId, useState, useLayoutEffect, useRef, type ReactNode } from 'react';
import { Check, ChevronDown, ChevronUp, CornerDownLeft, X } from 'lucide-react';
import { choiceAnswer, choiceOptions, readChoiceDraft, saveChoiceDraft, type ChoiceAnswer, type ChoiceDraft, type ChoiceInput } from '../../lib/questions';
import '../../styles/scrollbar.css';
import '../../styles/questions.css';

function QuestionCopy({ text, className = '' }: { text: string; className?: string }) {
  const [expanded, setExpanded] = useState(false);
  const long = text.length > 220 || text.split('\n').length > 3;
  return <span className={className}><span className={long && !expanded ? 'question-copy-clamped' : ''}>{text}</span>{long && <button type="button" className="question-copy-toggle" aria-expanded={expanded} onClick={event => { event.preventDefault(); setExpanded(value => !value); }}>{expanded ? 'Свернуть' : 'Подробнее'}</button>}</span>;
}

/** Ordinary choice input only. Draft state is scoped to both agent and input, never to labels. */
export function QuestionCard({ input, busy = false, error = '', disabled = false, onSubmit, onCancel, navigation, stepHint, minimized = false, onMinimize }: { stepHint?: string; navigation?: ReactNode; onCancel?: () => void; minimized?: boolean; onMinimize?: () => void; input: ChoiceInput; busy?: boolean; error?: string; disabled?: boolean; onSubmit: (answer: ChoiceAnswer) => void }) {
  const titleId = useId();
  const [draft, setDraft] = useState(() => input.result ? { values: input.result.values || (input.result.value ? [input.result.value] : []), otherSelected: typeof input.result.other === 'string', other: input.result.other || '' } : readChoiceDraft(input.agentId, input.id));
  const [validation, setValidation] = useState('');
  const otherRef = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const node = otherRef.current;
    if (!node || minimized) return;
    node.style.height = 'auto';
    node.style.height = `${node.scrollHeight + 2}px`;
  }, [draft.other, draft.otherSelected, minimized]);
  const locked = disabled || busy || input.state !== 'open';
  const update = (next: ChoiceDraft) => { setDraft(next); saveChoiceDraft(input.agentId, input.id, next); setValidation(''); };
  const select = (value: string) => update({ ...draft, values: input.spec.multiple ? draft.values.includes(value) ? draft.values.filter(item => item !== value) : [...draft.values, value] : [value], otherSelected: input.spec.multiple ? draft.otherSelected : false });
  const selectOther = () => update({ ...draft, otherSelected: !draft.otherSelected, values: input.spec.multiple ? draft.values : [] });
  const submit = () => { if (locked) return; try { onSubmit(choiceAnswer(input, draft)); } catch (reason) { setValidation(reason instanceof Error ? reason.message : String(reason)); } };
  return <div className="question-frame"><section className={`question-card${minimized ? ' is-minimized' : ''}`} aria-labelledby={titleId} aria-busy={busy} onKeyDown={event => {
    // Match chat: Enter submits, Shift+Enter inserts a newline; native buttons stay native.
    if (event.key !== 'Enter' || event.nativeEvent.isComposing || event.keyCode === 229 || event.repeat || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey || minimized) return;
    if (!(event.target instanceof HTMLTextAreaElement) && (!(event.target instanceof HTMLInputElement) || !['radio', 'checkbox'].includes(event.target.type))) return;
    event.preventDefault(); submit();
  }}>
    {minimized && onMinimize && <button type="button" className="question-expand-strip" aria-label="Развернуть вопрос" aria-expanded={false} onClick={onMinimize}><ChevronDown size={16} aria-hidden="true"/></button>}
    <header className="question-header"><span>{navigation || 'Вопрос'}</span><span>{input.spec.multiple ? 'Можно выбрать несколько' : 'Выберите один вариант'}</span>{!minimized && onMinimize && <button type="button" className="question-minimize" aria-label={minimized ? 'Развернуть вопрос' : 'Свернуть вопрос'} aria-expanded={!minimized} onClick={onMinimize}>{minimized ? <ChevronDown size={16}/> : <ChevronUp size={16}/>}</button>}{!minimized && onCancel && <button type="button" className="question-minimize" aria-label="Отменить вопрос" title="Отменить вопрос" disabled={locked} onClick={onCancel}><X size={16}/></button>}</header>
    <h2 id={titleId}>{minimized ? <span className="question-copy-clamped">{input.title}</span> : <QuestionCopy text={input.title}/>}</h2>
    <div className="question-body" hidden={minimized}>
      {input.message && <p className="question-message"><QuestionCopy text={input.message}/></p>}
      <fieldset disabled={locked} className="question-options"><legend className="sr-only">Варианты ответа</legend>
        {choiceOptions(input).map((option, index) => {
          const selected = draft.values.includes(option.value);
          const label = option.label || option.value;
          const recommended = /\s*(?:\((?:recommended|推荐)\)|（(?:recommended|推荐)）)\s*$/i;
          return <label className={`question-option ${selected ? 'is-selected' : ''}`} key={option.value}>
            <input type={input.spec.multiple ? 'checkbox' : 'radio'} name={titleId} checked={selected} onChange={() => select(option.value)} />
            <span className="question-option-number" aria-hidden="true">{selected ? <Check size={14} /> : index + 1}</span>
            <span className="question-option-copy"><span className="question-option-label">{label.replace(recommended, '')}{recommended.test(label) && <span className="question-recommended">Рекомендуется</span>}</span>{option.description && <QuestionCopy className="question-description" text={option.description}/>}</span>
          </label>;
        })}
        {input.spec.allowOther && <><label className={`question-option ${draft.otherSelected ? 'is-selected' : ''}`}>
          <input type={input.spec.multiple ? 'checkbox' : 'radio'} name={titleId} checked={draft.otherSelected} onChange={selectOther} />
          <span className="question-option-number" aria-hidden="true">{draft.otherSelected ? <Check size={14} /> : choiceOptions(input).length + 1}</span><span className="question-option-copy">Другое</span>
        </label>{draft.otherSelected && <textarea ref={otherRef} className="question-other" aria-label="Свой вариант ответа" placeholder="Напишите свой вариант…" rows={1} value={draft.other} onChange={event => update({ ...draft, other: event.target.value })} />}</>}
      </fieldset>
    </div>
    {!minimized && (validation || error) && <p className="question-error" role="alert">{validation || error}</p>}
    <footer className="question-footer" hidden={minimized}><span>{input.state !== 'open' ? 'Вопрос уже закрыт' : stepHint || 'Ответ будет отправлен агенту'}</span><button type="button" aria-label="Отправить" disabled={locked} onClick={submit}>{busy ? 'Отправляем…' : <>Enter <CornerDownLeft size={14} aria-hidden="true" /></>}</button></footer>
  </section></div>;
}
