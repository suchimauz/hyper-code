import { requestJson } from './hyper';

export type Goal = {
  goalId: string; revision: number; objective: string;
  status: 'active' | 'paused' | 'blocked' | 'usage_limited' | 'budget_limited' | 'complete';
  tokenBudget: number | null; tokensUsed: number; timeUsedSeconds: number;
};
export type GoalSnapshot = { version: 1; enabled: boolean; goal?: Goal | null; csrfToken?: string; owner?: { runToken: string | null; stoppedAt: number | null; runState: string } };
export type GoalAction = 'create' | 'edit' | 'pause' | 'resume';
const path = (id: string) => `/agent/${encodeURIComponent(id)}/persistent-goal`;
export const getGoal = (id: string, signal?: AbortSignal) => requestJson<GoalSnapshot>(path(id), { signal });
/** Mutate exactly the displayed revision; conflicts must be reviewed, never silently retried. */
export function changeGoal(id: string, snapshot: GoalSnapshot, action: GoalAction, patch?: { objective: string; tokenBudget: number | null }) {
  if (!snapshot.enabled || !snapshot.owner || !snapshot.csrfToken) throw new Error('Управление целью недоступно.');
  return requestJson(path(id), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
    action, expectedGoalId: snapshot.goal?.goalId ?? null, expectedRevision: snapshot.goal?.revision ?? null,
    expectedRunToken: snapshot.owner.runToken, csrfToken: snapshot.csrfToken,
    ...(action === 'resume' ? { expectedStoppedAt: snapshot.owner.stoppedAt, resumeRequestId: crypto.randomUUID() } : {}), ...patch,
  }) });
}
export const goalStatus: Record<Goal['status'], string> = { active: 'В работе', paused: 'Пауза', blocked: 'Нужна помощь', usage_limited: 'Лимит использования', budget_limited: 'Бюджет исчерпан', complete: 'Завершена' };
