import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CornerDownLeft, ChevronDown, ChevronRight, Pause, Pencil, Play, Target } from 'lucide-react';
import { changeGoal, getGoal, goalStatus, type GoalAction, type GoalSnapshot } from '../../lib/goal';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import './queue-dock.css';
import './goal-dock.css';

export function GoalDock({ agentId, running, disabled, editor, onClose, onAccepted }: { agentId: string; running: boolean; disabled: boolean; editor: { text: string } | null; onClose: () => void; onAccepted: () => void }) {
  const [snapshot, setSnapshot] = useState<GoalSnapshot | null>(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [objective, setObjective] = useState('');
  const [budget, setBudget] = useState('');
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const objectiveInput = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const input = objectiveInput.current;
    if (!input) return;
    input.style.height = 'auto';
    const style = getComputedStyle(input);
    const borders = parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
    input.style.height = `${Math.min(input.scrollHeight + (borders || 0), 160)}px`;
  }, [objective, editing]);
  const refresh = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    const controller = new AbortController(); let reading = false;
    const read = async () => {
      if (reading || locked.current) return;
      reading = true;
      try { const value = await getGoal(agentId, controller.signal); if (!controller.signal.aborted) setSnapshot(value); }
      catch (reason) { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : String(reason)); }
      finally { reading = false; }
    };
    refresh.current = read; void read();
    const poll = () => { if (!document.hidden) void read(); };
    const timer = setInterval(poll, 2000); document.addEventListener('visibilitychange', poll);
    return () => { controller.abort(); clearInterval(timer); document.removeEventListener('visibilitychange', poll); };
  }, [agentId]);
  useEffect(() => { if (editor) { setObjective(editor.text || snapshot?.goal?.objective || ''); setBudget(snapshot?.goal?.tokenBudget?.toString() || ''); setEditing(true); setExpanded(true); void refresh.current(); } }, [editor]);
  const goal = snapshot?.goal;
  const close = () => { setEditing(false); onClose(); };
  const perform = async (action: GoalAction) => {
    if (!snapshot || locked.current || disabled) return;
    const tokens = budget.trim() ? Number(budget) : null;
    if ((action === 'create' || action === 'edit') && (!objective.trim() || (tokens !== null && (!Number.isSafeInteger(tokens) || tokens <= 0)))) { setError('Введите цель и положительный целый бюджет либо оставьте бюджет пустым.'); return; }
    locked.current = true; setBusy(true); setError('');
    try { await changeGoal(agentId, snapshot, action, action === 'create' || action === 'edit' ? { objective: objective.trim(), tokenBudget: tokens } : undefined); close(); onAccepted(); }
    catch (reason) { setError(`${reason instanceof Error ? reason.message : String(reason)} Обновите цель перед новой попыткой.`); }
    finally { locked.current = false; setBusy(false); await refresh.current(); }
  };
  if (!goal && !editor && !editing) return null;
  return <section className="queue-dock goal-dock" aria-label="Цель агента">
    <div className="queue-row">
      <Target size={16} className="queue-lead" />
      <button type="button" className="goal-summary" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}<span className="queue-preview">{goal?.objective || 'Новая цель'}</span></button>
      {goal && <span className="goal-status-dot" data-status={goal.status} role="status" aria-label={goalStatus[goal.status]} title={goalStatus[goal.status]} />}
      <div className="goal-actions">
        {goal && <IconButton size="compact" label="Редактировать цель" disabled={disabled || busy} onClick={() => { setObjective(goal.objective); setBudget(goal.tokenBudget?.toString() || ''); setEditing(true); setExpanded(true); }}><Pencil size={16} /></IconButton>}
        {goal && goal.status !== 'complete' && <IconButton size="compact" label={goal.status === 'active' ? 'Приостановить цель' : 'Продолжить цель'} disabled={disabled || busy || (goal.status !== 'active' && (running || !!snapshot?.owner?.runToken))} onClick={() => void perform(goal.status === 'active' ? 'pause' : 'resume')}>{goal.status === 'active' ? <Pause size={16} /> : <Play size={16} />}</IconButton>}
      </div>
    </div>
    {expanded && goal && !editing && <div className="goal-details"><p>{goal.objective}</p><span>Токены: {goal.tokensUsed.toLocaleString('ru-RU')}{goal.tokenBudget === null ? ' · без лимита' : ` / ${goal.tokenBudget.toLocaleString('ru-RU')}`} · Время: {Math.floor(goal.timeUsedSeconds / 60)} мин</span></div>}
    {editing && <form className="goal-details goal-form" onSubmit={event => { event.preventDefault(); if (snapshot?.enabled && objective.trim()) void perform(goal ? 'edit' : 'create'); }} onKeyDown={event => {
      if (event.key !== 'Enter' || event.nativeEvent.isComposing || event.shiftKey || event.target instanceof HTMLButtonElement) return;
      event.preventDefault(); event.currentTarget.requestSubmit();
    }}>
      <label>Цель<textarea ref={objectiveInput} rows={1} autoFocus className="queue-editor" value={objective} onChange={event => setObjective(event.target.value)} disabled={busy || disabled} /></label>
      <label>Бюджет токенов<input className="queue-editor" type="number" min="1" step="1" placeholder="Без лимита" value={budget} onChange={event => setBudget(event.target.value)} disabled={busy || disabled} /></label>
      {!snapshot?.enabled && <span role="status">{snapshot ? 'Goal отключён на сервере.' : 'Загрузка цели…'}</span>}
      {!goal && <span>Цель будет сохранена на паузе. Нажмите «Продолжить цель», чтобы запустить.</span>}
      <div className="goal-form-actions"><Button size="compact" variant="secondary" disabled={busy} onClick={close}>Отмена</Button><Button size="compact" variant="primary" type="submit" aria-label="Сохранить цель" disabled={disabled || busy || !snapshot?.enabled || !objective.trim()}>Enter <CornerDownLeft size={14} aria-hidden="true" /></Button></div>
    </form>}
    {error && <div className="queue-error" role="alert">{error} <button type="button" disabled={busy} onClick={() => { setError(''); void refresh.current(); }}>Обновить цель</button></div>}
  </section>;
}
