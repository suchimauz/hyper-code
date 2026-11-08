import { requestJson } from './hyper';
export type ConfirmInput = { id: string; agentId: string; kind: 'confirm'; title: string; message?: string; createdAt?: string; updatedAt?: string; state: 'open' | 'processing' | 'submitted' | 'cancelled'; result?: { confirmed: boolean; comment?: string } | null; spec: { details: string; confirmLabel: string; declineLabel: string; danger: boolean } };
export type ConfirmInputsState = { inputs: ConfirmInput[]; csrfToken: string };
export type ConfirmAnswer = { decision: 'yes' | 'no'; comment?: string };
const comments = new Map<string, string>();
const key = (agentId: string, inputId: string) => JSON.stringify([agentId, inputId]);
export const readConfirmComment = (agentId: string, inputId: string) => comments.get(key(agentId, inputId)) || '';
export const saveConfirmComment = (agentId: string, inputId: string, text: string) => { comments.set(key(agentId, inputId), text); };
export const clearConfirmComment = (agentId: string, inputId: string) => { comments.delete(key(agentId, inputId)); };
export function getConfirmInputs(agentId: string, signal?: AbortSignal) { return requestJson<ConfirmInputsState>(`/ui-lab-api/confirms?agentId=${encodeURIComponent(agentId)}`, { signal }); }
export function submitConfirmInput(agentId: string, inputId: string, answer: ConfirmAnswer, csrfToken: string) {
  const comment = answer.comment?.trim();
  return requestJson(`/ui-lab-api/confirms?agentId=${encodeURIComponent(agentId)}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken }, body: JSON.stringify({ id: inputId, decision: answer.decision, ...(comment ? { comment } : {}) }) });
}
/** The oldest still-open confirmation is the one the agent is waiting on. */
export const pendingConfirm = (inputs: ConfirmInput[]) => inputs.find(item => item.kind === 'confirm' && item.state === 'open' || item.state === 'processing');
