import { useLayoutEffect, useRef } from 'react';
import { ChatMarkdown } from '../ChatMarkdown';
import { isCommitEnter } from './InputFrame';

export type ConfirmSpec = { details?: string; confirmLabel?: string; declineLabel?: string; danger?: boolean };
export type ConfirmDecision = 'yes' | 'no';

/** Confirm content only: the exact markdown preview and an optional comment. */
export function ConfirmBody({ details, comment, onComment, disabled = false, onEnter }: { details?: string; comment: string; onComment: (comment: string) => void; disabled?: boolean; onEnter?: () => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => { const node = ref.current; if (!node) return; node.style.height = 'auto'; node.style.height = `${node.scrollHeight + 2}px`; }, [comment]);
  return <>
    {details && <div className="confirm-details"><ChatMarkdown>{details}</ChatMarkdown></div>}
    <textarea ref={ref} className="question-other confirm-comment" aria-label="Комментарий" placeholder="Комментарий (необязательно)" rows={1} maxLength={2000} disabled={disabled} value={comment}
      onChange={event => onComment(event.target.value)}
      onKeyDown={event => { if (onEnter && isCommitEnter(event)) { event.preventDefault(); onEnter(); } }} />
  </>;
}

/**
 * Confirm decision buttons. Standalone they answer at once; in a batch pass `selected`
 * and they become a pressed/unpressed pair that only records the draft decision.
 */
export function ConfirmActions({ spec, busy = false, disabled = false, selected, onDecide }: { spec: ConfirmSpec; busy?: boolean; disabled?: boolean; selected?: ConfirmDecision | null; onDecide: (decision: ConfirmDecision) => void }) {
  const toggle = selected !== undefined;
  const pressed = (decision: ConfirmDecision) => toggle ? { 'aria-pressed': selected === decision } : {};
  const accept = `confirm-accept${spec.danger ? ' is-danger' : ''}`;
  // As a toggle, the unpressed button looks secondary so the choice is visible.
  return <span className="confirm-actions">
    <button type="button" className={toggle && selected === 'no' ? 'confirm-accept' : 'confirm-decline'} disabled={disabled} onClick={() => onDecide('no')} {...pressed('no')}>{spec.declineLabel || 'Нет'}</button>
    <button type="button" className={toggle && selected !== 'yes' ? 'confirm-decline' : accept} disabled={disabled} onClick={() => onDecide('yes')} {...pressed('yes')}>{busy && !toggle ? 'Отправляем…' : spec.confirmLabel || 'Да'}</button>
  </span>;
}
