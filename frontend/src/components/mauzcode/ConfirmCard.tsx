import { useState } from 'react';
import { InputFrame } from './inputs/InputFrame';
import { ConfirmActions, ConfirmBody, type ConfirmDecision } from './inputs/confirm';
import { readConfirmComment, saveConfirmComment, type ConfirmAnswer, type ConfirmInput } from '../../lib/confirms';

/** Native MauzCode confirm (yes/no) form: shared frame + ConfirmBody + ConfirmActions. */
export function ConfirmCard({ input, busy = false, error = '', onSubmit, minimized = false, onMinimize }: { input: ConfirmInput; busy?: boolean; error?: string; minimized?: boolean; onMinimize?: () => void; onSubmit: (answer: ConfirmAnswer) => void }) {
  const [comment, setComment] = useState(() => readConfirmComment(input.agentId, input.id));
  const locked = busy || input.state !== 'open';
  const send = (decision: ConfirmDecision) => { if (!locked) onSubmit({ decision, ...(comment.trim() ? { comment: comment.trim() } : {}) }); };
  return <InputFrame className="confirm-card" noun="вопрос" busy={busy} minimized={minimized} onMinimize={onMinimize}
    label="Подтверждение" hint={input.spec.danger ? 'Необратимое действие' : 'Да или нет'} title={input.title} message={input.message} error={error}
    note={input.state !== 'open' ? 'Вопрос уже закрыт' : 'Ответ будет отправлен агенту'}
    actions={<ConfirmActions spec={input.spec} busy={busy} disabled={locked} onDecide={send} />}>
    <ConfirmBody details={input.spec.details} comment={comment} disabled={locked} onEnter={() => send('yes')} onComment={text => { setComment(text); saveConfirmComment(input.agentId, input.id, text); }} />
  </InputFrame>;
}
