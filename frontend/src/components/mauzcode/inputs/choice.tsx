import { useLayoutEffect, useRef } from 'react';
import { Check, CornerDownLeft } from 'lucide-react';
import { QuestionCopy } from './InputFrame';
import type { ChoiceDraft, ChoiceOption } from '../../../lib/questions';
import type { BatchDraft } from '../../../lib/batches';

const recommended = /\s*(?:\((?:recommended|推荐)\)|（(?:recommended|推荐)）)\s*$/i;

export type ChoiceBodyProps = { name: string; options: ChoiceOption[]; multiple: boolean; allowOther: boolean; draft: ChoiceDraft; onChange: (draft: ChoiceDraft) => void; disabled?: boolean };

/** Choice content only: options, "Другое" and its text. No submit, no footer. */
export function ChoiceBody({ name, options, multiple, allowOther, draft, onChange, disabled = false }: ChoiceBodyProps) {
  const otherRef = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const node = otherRef.current;
    if (!node) return;
    node.style.height = 'auto';
    node.style.height = `${node.scrollHeight + 2}px`;
  }, [draft.other, draft.otherSelected]);
  const select = (value: string) => onChange({ ...draft, values: multiple ? draft.values.includes(value) ? draft.values.filter(item => item !== value) : [...draft.values, value] : [value], otherSelected: multiple ? draft.otherSelected : false });
  const selectOther = () => onChange({ ...draft, otherSelected: !draft.otherSelected, values: multiple ? draft.values : [] });
  return <fieldset disabled={disabled} className="question-options"><legend className="sr-only">Варианты ответа</legend>
    {options.map((option, index) => {
      const selected = draft.values.includes(option.value);
      const label = option.label || option.value;
      return <label className={`question-option ${selected ? 'is-selected' : ''}`} key={option.value}>
        <input type={multiple ? 'checkbox' : 'radio'} name={name} checked={selected} onChange={() => select(option.value)} />
        <span className="question-option-number" aria-hidden="true">{selected ? <Check size={14} /> : index + 1}</span>
        <span className="question-option-copy"><span className="question-option-label">{label.replace(recommended, '')}{recommended.test(label) && <span className="question-recommended">Рекомендуется</span>}</span>{option.description && <QuestionCopy className="question-description" text={option.description}/>}</span>
      </label>;
    })}
    {allowOther && <><label className={`question-option ${draft.otherSelected ? 'is-selected' : ''}`}>
      <input type={multiple ? 'checkbox' : 'radio'} name={name} checked={draft.otherSelected} onChange={selectOther} />
      <span className="question-option-number" aria-hidden="true">{draft.otherSelected ? <Check size={14} /> : options.length + 1}</span><span className="question-option-copy">Другое</span>
    </label>{draft.otherSelected && <textarea ref={otherRef} className="question-other" aria-label="Свой вариант ответа" placeholder="Напишите свой вариант…" rows={1} value={draft.other} onChange={event => onChange({ ...draft, other: event.target.value })} />}</>}
  </fieldset>;
}

/** Choice footer button for a standalone question. */
export function ChoiceActions({ busy = false, disabled = false, onSubmit }: { busy?: boolean; disabled?: boolean; onSubmit: () => void }) {
  return <button type="button" aria-label="Отправить" disabled={disabled} onClick={onSubmit}>{busy ? 'Отправляем…' : <>Enter <CornerDownLeft size={14} aria-hidden="true" /></>}</button>;
}

/** Normalized batch spec → choice options. */
export const choiceSpecOptions = (spec: Record<string, unknown>): ChoiceOption[] => ((spec.options || []) as (string | ChoiceOption)[]).map(option => typeof option === 'string' ? { value: option, label: option } : option);
/** Batch wire draft ({ pick, other }) ↔ choice body draft. */
export const choiceFromBatch = (draft: BatchDraft): ChoiceDraft => ({ values: typeof draft.pick === 'string' ? [draft.pick] : draft.pick || [], otherSelected: typeof draft.other === 'string', other: typeof draft.other === 'string' ? draft.other : '' });
export const choiceToBatch = (draft: ChoiceDraft): BatchDraft => ({ pick: draft.values, ...(draft.otherSelected ? { other: draft.other } : {}) });
