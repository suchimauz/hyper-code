import { requestJson } from './hyper';
import type { NavigationIcon } from './navigation';
export type HeaderChild = { tokens?: number | null; durationMs?: number | null; modelLabel?: string; lastReplyAt?: number | null; id: string; title: string; icon?: NavigationIcon | null; colorHue?: number | null; runState: string };
export type ChatHeaderData = { parent?: { id: string; title: string } | null; siblings?: HeaderChild[]; agentId: string; title: string; children: HeaderChild[]; csrfToken: string };
export async function getChatHeader(agentId: string, signal?: AbortSignal) {
  const data = await requestJson<ChatHeaderData>(`/ui-lab-api/chat-header?agentId=${encodeURIComponent(agentId)}`, { signal });
  if (data.agentId !== agentId || !Array.isArray(data.children) || typeof data.csrfToken !== 'string') throw new Error('Не удалось загрузить панель чата');
  return data;
}
export async function renameChat(agentId: string, title: string, csrfToken: string) {
  return requestJson<{ agentId: string; title: string }>('/ui-lab-api/chat-header', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrfToken }, body: JSON.stringify({ agentId, title }) });
}
