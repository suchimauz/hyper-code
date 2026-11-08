import { requestJson } from './hyper';

export type QueueItem = { id: string; sequence: number; text: string; version: number; status: 'pending' | 'promoted' | 'removed'; createdAt: number | string; files: { name: string; type: string; size: number }[]; messageIdx?: number };
const path = (agentId: string) => `/agent/${encodeURIComponent(agentId)}/queue`;
export function getQueue(agentId: string, signal?: AbortSignal) {
  return requestJson<{ items: QueueItem[] }>(path(agentId), { signal });
}
export function enqueueMessage(agentId: string, text: string, requestId: string, files: File[]) {
  const body = new FormData(); body.set('text', text); body.set('requestId', requestId);
  files.forEach(file => body.append('files', file));
  return requestJson<{ ok: boolean; queueId: string; version: number; duplicate?: boolean }>(path(agentId), { method: 'POST', headers: { 'Idempotency-Key': requestId }, body });
}
export function changeQueue(agentId: string, item: QueueItem, action: 'edit' | 'remove' | 'steer', text?: string) {
  const url = `${path(agentId)}/${encodeURIComponent(item.id)}`;
  return requestJson<{ ok: boolean }>(action === 'remove' ? `${url}?version=${item.version}` : action === 'steer' ? `${url}/steer` : url, {
    method: action === 'remove' ? 'DELETE' : action === 'steer' ? 'POST' : 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    ...(action === 'remove' ? {} : { body: JSON.stringify({ version: item.version, ...(action === 'edit' ? { text } : {}) }) }),
  });
}
