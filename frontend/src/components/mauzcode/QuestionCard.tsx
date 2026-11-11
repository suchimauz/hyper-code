import { useId, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { InputFrame, QuestionCopy, isCommitEnter } from './inputs/InputFrame';
import { ChoiceActions, ChoiceBody } from './inputs/choice';
import { choiceAnswer, choiceOptions, readChoiceDraft, saveChoiceDraft, type ChoiceAnswer, type ChoiceDraft, type ChoiceInput } from '../../lib/questions';

/** Ordinary choice form: shared frame + ChoiceBody + ChoiceActions. Draft state is scoped to both agent and input, never to labels. */
export function QuestionCard({ input, busy = false, error = '', disabled = false, onSubmit, onCancel, navigation, stepHint, minimized = false, onMinimize }: { stepHint?: string; navigation?: ReactNode; onCancel?: () => void; minimized?: boolean; onMinimize?: () => void; input: ChoiceInput; busy?: boolean; error?: string; disabled?: boolean; onSubmit: (answer: ChoiceAnswer) => void }) {
  const name = useId();
  const [draft, setDraft] = useState<ChoiceDraft>(() => input.result ? { values: input.result.values || (input.result.value ? [input.result.value] : []), otherSelected: typeof input.result.other === 'string', other: input.result.other || '' } : readChoiceDraft(input.agentId, input.id));
  const [validation, setValidation] = useState('');
  const locked = disabled || busy || input.state !== 'open';
  const update = (next: ChoiceDraft) => { setDraft(next); saveChoiceDraft(input.agentId, input.id, next); setValidation(''); };
  const submit = () => { if (locked) return; try { onSubmit(choiceAnswer(input, draft)); } catch (reason) { setValidation(reason instanceof Error ? reason.message : String(reason)); } };
  return <InputFrame noun="вопрос" busy={busy} minimized={minimized} onMinimize={onMinimize}
    label={navigation || 'Вопрос'} hint={input.spec.multiple ? 'Можно выбрать несколько' : 'Выберите один вариант'}
    headerExtra={onCancel && <button type="button" className="question-minimize" aria-label="Отменить вопрос" title="Отменить вопрос" disabled={locked} onClick={onCancel}><X size={16}/></button>}
    title={<QuestionCopy text={input.title}/>} compactTitle={input.title} message={input.message && <QuestionCopy text={input.message}/>} error={validation || error}
    note={input.state !== 'open' ? 'Вопрос уже закрыт' : stepHint || 'Ответ будет отправлен агенту'}
    actions={<ChoiceActions busy={busy} disabled={locked} onSubmit={submit} />}
    onKeyDown={event => {
      // Match chat: Enter submits, Shift+Enter inserts a newline; native buttons stay native.
      if (!isCommitEnter(event) || minimized) return;
      if (!(event.target instanceof HTMLTextAreaElement) && (!(event.target instanceof HTMLInputElement) || !['radio', 'checkbox'].includes(event.target.type))) return;
      event.preventDefault(); submit();
    }}>
    <ChoiceBody name={name} options={choiceOptions(input)} multiple={!!input.spec.multiple} allowOther={!!input.spec.allowOther} draft={draft} onChange={update} disabled={locked} />
  </InputFrame>;
}
