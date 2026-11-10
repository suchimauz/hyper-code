import { useEffect, useRef, useState, type ReactNode } from 'react';
import { PlanningPanel } from './PlanningPanel';
import { getPlanning, reviewPlan, type PlanningState } from '../../lib/planning';
import { executeCommand, notifyPlanningChanged } from '../../lib/commands';
import { PlanModeBadge } from './PlanModeBadge';

/** Server-owned state: refresh after commands, run changes, focus and bounded visible-tab polling. */
export function ConnectedPlanningPanel({ agentId, running, readOnly, onAccepted, children }: { agentId: string; running: boolean; readOnly: boolean; onAccepted: () => void; children?: (badge: ReactNode, reviewPending: boolean, focusRequest: number) => ReactNode }) {
  const [state, setState] = useState<PlanningState | null>(null);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);
  const [focusRequest, setFocusRequest] = useState(0);
  const [revision, setRevision] = useState(0);
  const lock = useRef(false);
  const generation = useRef(0);
  const exitKey = useRef<string | null>(null);
  useEffect(() => {
    let disposed = false;
    let current: AbortController | null = null;
    const refresh = async () => {
      if (disposed || lock.current || document.visibilityState === 'hidden') return;
      current?.abort(); current = new AbortController(); const signal = current.signal;
      const attempt = ++generation.current;
      try { const next = await getPlanning(agentId, signal); if (!disposed && !signal.aborted && generation.current === attempt) { setState(next); setError(''); } }
      catch (reason) { if (!disposed && !signal.aborted && generation.current === attempt) setError(reason instanceof Error ? reason.message : String(reason)); }
    };
    const changed = (event: Event) => { if ((event as CustomEvent<string>).detail === agentId) void refresh(); };
    const focused = () => { void refresh(); };
    void refresh(); const timer = window.setInterval(focused, 8000);
    window.addEventListener('hyper-planning-changed', changed); window.addEventListener('focus', focused); document.addEventListener('visibilitychange', focused);
    return () => { disposed = true; current?.abort(); clearInterval(timer); window.removeEventListener('hyper-planning-changed', changed); window.removeEventListener('focus', focused); document.removeEventListener('visibilitychange', focused); };
  }, [agentId, running, revision]);
  const decide = async (decision: 'approve' | 'keep' | 'exit') => {
    if (!state || lock.current || running || readOnly) return;
    lock.current = true; ++generation.current; setBusy(true); setError(''); setActionError('');
    try {
      if (decision === 'exit') { const result = await executeCommand(agentId, '/plan off', exitKey.current ?? (exitKey.current = crypto.randomUUID())); if (!result.ok || result.status === 'failed') throw new Error(result.error || 'Не удалось выйти из Plan mode'); exitKey.current = null; }
      else {
        const result = await reviewPlan(agentId, state, decision);
        if (result.planning?.mode) setState({ ...state, ...result.planning, csrfToken: state.csrfToken });
      }
      if (decision === 'keep') setFocusRequest(value => value + 1);
      onAccepted();
      try { setState(await getPlanning(agentId)); }
      catch (reason) { setError(`Решение принято, но состояние не обновилось: ${reason instanceof Error ? reason.message : String(reason)}`); }
    } catch (reason) { setActionError(reason instanceof Error ? reason.message : String(reason)); }
    finally { lock.current = false; setBusy(false); notifyPlanningChanged(agentId); }
  };
  const badge = state?.mode === 'plan' ? <PlanModeBadge disabled={busy || running || readOnly} busy={busy} onExit={() => { void decide('exit'); }} /> : null;
  return <>{state && <PlanningPanel state={state} running={running} busy={busy} readOnly={readOnly} onDecision={decision => { void decide(decision); }} onExit={() => { void decide('exit'); }} />}
    {(error || actionError) && <p className="connection-error" role="alert">Режим планирования: {actionError || error} <button type="button" className="button button--ghost" disabled={busy} onClick={() => setRevision(n => n + 1)}>Обновить</button></p>}{children ? children(badge, state?.proposal?.status === 'pending', focusRequest) : badge}</>;
}
