import { ClipboardList, CircleX } from 'lucide-react';
import './plan-mode-badge.css';

/** Session planning indicator; leaving uses the same guarded command action as review. */
export function PlanModeBadge({ disabled, busy, onExit }: { disabled: boolean; busy: boolean; onExit: () => void }) {
  return <button type="button" className="plan-mode-badge" disabled={disabled} aria-busy={busy} aria-label="Plan — выйти из режима планирования" title="Режим планирования — нажмите, чтобы выйти. Это инструкции для агента, а не sandbox." onClick={onExit}>
    <ClipboardList className="plan-mode-badge__icon" size={14} aria-hidden="true" />
    <CircleX className="plan-mode-badge__close" size={14} aria-hidden="true" />
    <span>Plan</span>
  </button>;
}
