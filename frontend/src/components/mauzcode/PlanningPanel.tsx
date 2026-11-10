import { useId } from 'react';
import { Button } from '../ui/Button';
import { ChatMarkdown } from './ChatMarkdown';
import './planning-panel.css';

export type PlanningState = {
  mode: 'plan' | 'execute';
  revision: number;
  advisory: true;
  proposal: null | {
    id: string;
    inputId: string;
    plan: string;
    status: 'pending' | 'approved' | 'kept';
    createdAt: number;
  };
};

export type PlanningPanelProps = {
  state: PlanningState;
  busy?: boolean;
  running: boolean;
  readOnly?: boolean;
  onDecision: (decision: 'approve' | 'keep') => void;
  onExit: () => void;
};

/** Controlled advisory planning card. Decisions never change local state or invoke an API. */
export function PlanningPanel({ state, busy = false, running, readOnly = false, onDecision, onExit }: PlanningPanelProps) {
  const id = useId();
  const pending = state.proposal?.status === 'pending' ? state.proposal : null;
  // Active mode lives in the composer footer; only a real proposal needs a review card.
  if (!pending) return null;
  const disabled = busy || running || readOnly;
  const reason = running
    ? 'Сначала остановите агента, чтобы принять решение или выйти из режима планирования.'
    : readOnly
      ? 'Только чтение: решения и выход из режима планирования недоступны.'
      : busy ? 'Сохраняем решение…' : null;

  return (
    <section className="planning-panel" aria-labelledby={`${id}-title`} aria-busy={busy}>
      <header className="planning-panel__header">
        <h2 id={`${id}-title`}>{state.mode === 'plan' ? 'Plan mode' : 'План на согласовании'}</h2>
        {state.mode === 'plan' && <Button variant="ghost" disabled={disabled} aria-describedby={reason ? `${id}-reason` : undefined} onClick={onExit}>Выйти из Plan mode</Button>}
      </header>
      <p className="planning-panel__advisory">Это инструкции для агента, а не sandbox: режим не изолирует и не блокирует действия инструментов.</p>
      {reason && <p className="planning-panel__reason" id={`${id}-reason`} role="status">{reason}</p>}
      {pending ? <>
        <div className="planning-panel__content markdown" role="region" aria-label="Предложенный план" tabIndex={0}>
          <ChatMarkdown>{pending.plan}</ChatMarkdown>
        </div>
        <div className="planning-panel__actions" aria-describedby={reason ? `${id}-reason` : undefined}>
          <Button variant="primary" disabled={disabled} onClick={() => onDecision('approve')}>Начать реализацию</Button>
          <Button disabled={disabled} onClick={() => onDecision('keep')}>Уточнить план</Button>
        </div>
      </> : state.proposal && <p className="planning-panel__previous">{state.proposal.status === 'approved' ? 'Предыдущий план одобрен.' : 'Продолжаем обсуждение плана.'}</p>}
    </section>
  );
}
