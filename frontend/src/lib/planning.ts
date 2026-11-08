import { ApiError, requestJson } from './hyper';
export type PlanningState = {
  version: 1; agentId: string; mode: 'plan' | 'execute'; revision: number; scope: 'session'; advisory: true; runningPolicy: 'reject'; csrfToken: string;
  proposal: null | { id: string; inputId: string; plan: string; status: 'pending' | 'approved' | 'kept'; createdAt: number };
};
export async function getPlanning(agentId: string, signal?: AbortSignal) {
  const state = await requestJson<PlanningState>(`/agent/${encodeURIComponent(agentId)}/planning`, { signal }).catch(reason => {
    if (reason instanceof ApiError && reason.status === 404) throw new Error('Состояние планирования недоступно на сервере.');
    throw reason;
  });
  if (state.version !== 1 || !['plan', 'execute'].includes(state.mode) || typeof state.revision !== 'number') throw new Error('Не удалось получить режим сессии.');
  return state;
}
export function reviewPlan(agentId: string, state: PlanningState, decision: 'approve' | 'keep') {
  if (!state.proposal) throw new Error('Нет плана для согласования.');
  return requestJson<{ ok: true; planning: PlanningState; scheduled: boolean }>(`/agent/${encodeURIComponent(agentId)}/planning/review`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': state.csrfToken },
    body: JSON.stringify({ proposalId: state.proposal.id, decision, expectedRevision: state.revision }),
  });
}
