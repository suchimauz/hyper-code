import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ApiError } from '../../lib/hyper';
import { choiceAnswer, readChoiceDraft, readChoiceAnswers, saveChoiceAnswers, choiceEpisode, clearChoiceDraft, getChoiceInputs, submitChoiceBatch, submitChoiceInput, type ChoiceAnswer, type ChoiceInputsState, type ChoiceInput } from '../../lib/questions';
import { QuestionCard } from './QuestionCard';
import { SecureInputHost } from './SecureInputHost';
import { ConfirmCard } from './ConfirmCard';
import { clearConfirmComment, getConfirmInputs, pendingConfirm, submitConfirmInput, type ConfirmAnswer, type ConfirmInputsState } from '../../lib/confirms';
import { GridCard } from './GridCard';
import { getPluginHistoryInputs, type HistoryInput, type PluginHistoryInput } from '../../lib/history';
import { clearGridPicks, getGridInputs, pendingGrid, submitGridInput, type GridInputsState } from '../../lib/grids';
import { closeLocalPushNotification } from '../../lib/pushNotifications';
import { getSecretInputs, type SecretInputsState } from '../../lib/secrets';

/** Owns polling and the submit lock for an agent; key this boundary by agent id. */
export function ConnectedQuestionCard({ agentId, readOnly, onAccepted, onInputs, children, mascot }: { agentId: string; readOnly: boolean; onAccepted: () => void; onInputs?: (inputs: HistoryInput[]) => void; children: ReactNode; mascot?: ReactNode }) {
  const [state, setState] = useState<ChoiceInputsState | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmInputsState | null>(null);
  const [confirmClosed, setConfirmClosed] = useState<string[]>([]);
  const [gridState, setGridState] = useState<GridInputsState | null>(null);
  const [gridClosed, setGridClosed] = useState<string[]>([]);
  const [secretState, setSecretState] = useState<SecretInputsState | null>(null);
  const [pluginHistory, setPluginHistory] = useState<PluginHistoryInput[] | null>(null);
  // History rows need every native kind; each source keeps its last good snapshot.
  useEffect(() => { if (state || confirmState || gridState || secretState || pluginHistory) onInputs?.([...(state?.inputs || []), ...(confirmState?.inputs || []), ...(gridState?.inputs || []), ...(secretState?.inputs || []), ...(pluginHistory || [])]); }, [state, confirmState, gridState, secretState, pluginHistory, onInputs]);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);
  const [minimizedId, setMinimizedId] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [closed, setClosed] = useState<string[]>([]);
  const [answers, setAnswers] = useState(() => readChoiceAnswers(agentId));
  const [viewedId, setViewedId] = useState<string | null>(null);
  const episodeIds = useRef<string[]>([]);
  const answered = useRef(new Map<string, ChoiceInput>());
  const lock = useRef(false);
  const alive = useRef(true);
  const generation = useRef(0);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    let disposed = false;
    let controller: AbortController | null = null;
    let inFlight = false;
    const refresh = async () => {
      if (disposed || inFlight || lock.current || readOnly || document.visibilityState === 'hidden') return;
      inFlight = true; controller = new AbortController(); const signal = controller.signal;
      const attempt = ++generation.current;
      try { const next = await getChoiceInputs(agentId, signal); if (!disposed && !signal.aborted && attempt === generation.current) { setState(next); setError(''); } }
      catch (reason) { if (!disposed && !signal.aborted && attempt === generation.current) setError(reason instanceof Error ? reason.message : String(reason)); }
      // Confirm inputs are a separate native kind; their failure must not hide choice questions.
      try { const next = await getConfirmInputs(agentId, signal); if (!disposed && !signal.aborted && attempt === generation.current) setConfirmState(next); }
      catch { /* Keep the last authoritative confirm snapshot; the next poll retries. */ }
      // Grid inputs are their own native kind; same isolation as confirms.
      try { const next = await getGridInputs(agentId, signal); if (!disposed && !signal.aborted && attempt === generation.current) setGridState(next); }
      catch { /* Keep the last authoritative grid snapshot; the next poll retries. */ }
      // Secret rows feed history only; the open card itself is rendered by SecureInputHost.
      try { const next = await getSecretInputs(agentId, signal); if (!disposed && !signal.aborted && attempt === generation.current) setSecretState(next); }
      catch { /* Keep the last secret history snapshot; the next poll retries. */ }
      // Plugin rows feed history only (server Kind.history summaries); their open cards live in PluginInputHost.
      try { const next = await getPluginHistoryInputs(agentId, signal); if (!disposed && !signal.aborted && attempt === generation.current) setPluginHistory(next); }
      catch { /* Keep the last plugin history snapshot; the next poll retries. */ }
      finally { inFlight = false; }
    };
    void refresh(); const timer = window.setInterval(() => void refresh(), 4000);
    const focus = () => void refresh();
    window.addEventListener('focus', focus); document.addEventListener('visibilitychange', focus);
    return () => { disposed = true; controller?.abort(); clearInterval(timer); window.removeEventListener('focus', focus); document.removeEventListener('visibilitychange', focus); };
  }, [agentId, readOnly, revision]);
  const inputs = (state?.inputs || []).map(item => answered.current.get(item.id) || item);
  const episode = state?.batch ? inputs.filter(item => state.batch!.inputIds.includes(item.id) && !closed.includes(item.id)) : choiceEpisode(inputs.filter(item => !closed.includes(item.id) || answered.current.has(item.id)), episodeIds.current);
  episodeIds.current = episode.map(item => item.id);
  const current = state?.batch ? (episode.find(item => !answers[item.id]) || episode.at(-1)) : episode.find(item => (item.state === 'open' || item.state === 'processing') && !closed.includes(item.id));
  const input = current && (episode.find(item => item.id === viewedId) || current);
  const currentIndex = episode.findIndex(item => item.id === current?.id);
  const viewedIndex = episode.findIndex(item => item.id === input?.id);
  const navigation = <span className="question-navigation"><span aria-live="polite">{viewedIndex + 1}/{episode.length}</span>{episode.map((item, index) => <button type="button" key={item.id} aria-label={`Вопрос ${index + 1} из ${episode.length}`} aria-current={item.id === input?.id ? 'step' : undefined} disabled={busy || index > currentIndex} onClick={() => { setViewedId(item.id); setActionError(''); }}>{index + 1}</button>)}</span>;
  const submit = async (answer: ChoiceAnswer | { cancel: true }) => {
    if (!state || !input || lock.current || readOnly || input.state !== 'open') return;
    if (state.batch && !('cancel' in answer)) {
      const nextAnswers = { ...answers, [input.id]: answer };
      setAnswers(nextAnswers); saveChoiceAnswers(agentId, nextAnswers);
      const nextIndex = episode.findIndex(item => item.id === input.id) + 1;
      if (nextIndex < episode.length) { setViewedId(episode[nextIndex].id); return; }
      const missing = episode.find(item => !nextAnswers[item.id]);
      if (missing) { setViewedId(missing.id); return; }
      for (const item of episode) {
        try { nextAnswers[item.id] = choiceAnswer(item, readChoiceDraft(agentId, item.id)); }
        catch (reason) { setViewedId(item.id); setActionError(reason instanceof Error ? reason.message : String(reason)); return; }
      }
    }
    lock.current = true; ++generation.current; setBusy(true); setActionError('');
    try {
      if (state.batch && !('cancel' in answer)) {
        await submitChoiceBatch(agentId, state.batch.revision, episode.map(item => ({ id: item.id, ...choiceAnswer(item, readChoiceDraft(agentId, item.id)) })), state.csrfToken);
        for (const item of episode) clearChoiceDraft(agentId, item.id);
        // This device showed the notification for these requests; close it here.
        for (const item of episode) await closeLocalPushNotification(item.id);
        saveChoiceAnswers(agentId, {});
        if (alive.current) { setAnswers({}); setClosed(previous => [...previous, ...episode.map(item => item.id)]); setViewedId(null); onAccepted(); }
        return;
      }
      await submitChoiceInput(agentId, input.id, answer, state.csrfToken);
      await closeLocalPushNotification(input.id);
      answered.current.set(input.id, { ...input, state: 'cancel' in answer ? 'cancelled' : 'submitted', ...('cancel' in answer ? {} : { result: answer }) });
      setViewedId(null);
      clearChoiceDraft(agentId, input.id);
      if (alive.current) { setClosed(previous => [...previous, input.id]); onAccepted(); }
    } catch (reason) {
      if (alive.current) {
        if (reason instanceof ApiError && reason.status === 409) {
          try {
            const next = await getChoiceInputs(agentId);
            if (!alive.current) return;
            setState(next);
            const current = next.inputs.find(item => item.id === input.id);
            if (!current || current.state === 'submitted' || current.state === 'cancelled') { setClosed(previous => [...previous, input.id]); clearChoiceDraft(agentId, input.id); }
          } catch { /* Keep the draft and card until authoritative refresh succeeds. */ }
        }
setActionError(reason instanceof Error ? reason.message : String(reason));
      }
    } finally { lock.current = false; if (alive.current) { setBusy(false); setRevision(value => value + 1); } }
  };
  const confirm = !input && confirmState ? pendingConfirm(confirmState.inputs.filter(item => !confirmClosed.includes(item.id))) : undefined;
  const submitConfirm = async (answer: ConfirmAnswer) => {
    if (!confirmState || !confirm || lock.current || readOnly || confirm.state !== 'open') return;
    lock.current = true; ++generation.current; setBusy(true); setActionError('');
    try {
      await submitConfirmInput(agentId, confirm.id, answer, confirmState.csrfToken);
      await closeLocalPushNotification(confirm.id);
      clearConfirmComment(agentId, confirm.id);
      if (alive.current) { setConfirmClosed(previous => [...previous, confirm.id]); onAccepted(); }
    } catch (reason) {
      if (alive.current) {
        if (reason instanceof ApiError && reason.status === 409) setConfirmClosed(previous => [...previous, confirm.id]);
        setActionError(reason instanceof Error ? reason.message : String(reason));
      }
    } finally { lock.current = false; if (alive.current) { setBusy(false); setRevision(value => value + 1); } }
  };
  const grid = !input && !confirm && gridState ? pendingGrid(gridState.inputs.filter(item => !gridClosed.includes(item.id))) : undefined;
  const submitGrid = async (answer: { values: string[] } | { cancel: true }) => {
    if (!gridState || !grid || lock.current || readOnly || grid.state !== 'open') return;
    lock.current = true; ++generation.current; setBusy(true); setActionError('');
    try {
      await submitGridInput(agentId, grid.id, answer, gridState.csrfToken);
      await closeLocalPushNotification(grid.id);
      clearGridPicks(agentId, grid.id);
      if (alive.current) { setGridClosed(previous => [...previous, grid.id]); onAccepted(); }
    } catch (reason) {
      if (alive.current) {
        if (reason instanceof ApiError && reason.status === 409) { setGridClosed(previous => [...previous, grid.id]); clearGridPicks(agentId, grid.id); }
        setActionError(reason instanceof Error ? reason.message : String(reason));
      }
    } finally { lock.current = false; if (alive.current) { setBusy(false); setRevision(value => value + 1); } }
  };
  if (readOnly) return <>{children}</>;
  return <div className={`question-composer-stack${input || confirm || grid ? ' has-question' : ''}`}><div className="composer-input-anchor question-pet-perch">{mascot}</div>{input ? <><QuestionCard key={`${agentId}:${input.id}`} input={input} stepHint={state?.batch ? viewedIndex < episode.length - 1 ? 'Далее · ответы пока не отправлены' : 'Отправить все ответы агенту' : undefined} navigation={navigation} busy={busy || input.state === 'processing'} error={actionError || error} minimized={minimizedId === input.id} onMinimize={() => setMinimizedId(previous => previous === input.id ? null : input.id)} onCancel={input.id === current?.id ? () => void submit({ cancel: true }) : undefined} onSubmit={answer => void submit(answer)} /></> : confirm ? <ConfirmCard key={`${agentId}:${confirm.id}`} input={confirm} busy={busy || confirm.state === 'processing'} error={actionError} minimized={minimizedId === confirm.id} onMinimize={() => setMinimizedId(previous => previous === confirm.id ? null : confirm.id)} onSubmit={answer => void submitConfirm(answer)} /> : grid ? <GridCard key={`${agentId}:${grid.id}`} input={grid} busy={busy || grid.state === 'processing'} error={actionError} minimized={minimizedId === grid.id} onMinimize={() => setMinimizedId(previous => previous === grid.id ? null : grid.id)} onSubmit={values => void submitGrid({ values })} onCancel={() => void submitGrid({ cancel: true })} /> : <>{error && <div className="question-load-error" role="alert">{error} <button onClick={() => setRevision(value => value + 1)}>Повторить загрузку вопросов</button></div>}</>}<SecureInputHost agentId={agentId} />{children}</div>;
}
