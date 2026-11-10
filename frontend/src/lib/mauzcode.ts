export type MauzCodeAgent = { id: string; title: string; model: string; runState: string; updatedAt: number; unread: number; workspaceDir: string };
export type ChatAuthor = { id: string; name: string; initials: string; hue: number; picture?: string | null; kind?: 'user' | 'agent'; agentId?: string };
export type CommandMetadata = { name: string; text: string; argsText?: string; requestId?: string; operationId?: string };
export type ChatEvent = { lifecycle?: Record<string, string | number | boolean> | null; excludedFromLlm?: boolean; runId?: string | null; subject?: string | null; elapsedSec?: number | null; retryId?: string; retry?: number; maxRetries?: number | null; retryMode?: 'normal' | 'always'; delayMs?: number; failureCode?: string; failureMessage?: string; failureStatus?: number | null; provider?: string; retryState?: 'scheduled' | 'started' | 'cancelled'; inputId?: string; kind?: string; pluginHistory?: boolean; command?: CommandMetadata | null; commandName?: string; commandText?: string; argsText?: string; requestId?: string; operationId?: string; status?: 'running' | 'completed' | 'failed' | 'interrupted'; result?: unknown; error?: unknown; isFinalReply?: boolean; actor?: string | null; navigationEligible?: boolean; author?: ChatAuthor | null; peerAuthor?: ChatAuthor | null; agentMessage?: { from: string; title?: string; body: string; hop?: number; onBehalfOf?: string } | null; outgoingAgentMessage?: { to: string; title?: string; body: string; status: 'queued' | 'delivered'; messageIdx?: number | null } | null; revision?: number | null; summary?: string | null; tokensBefore?: number | null; tokensAfter?: number | null; tokensBeforeSource?: 'provider' | 'estimate' | null; tokensAfterEstimated?: boolean; keptMessages?: number | null; messageIdx?: number | null; toolSummary?: string | null; publicSummary?: string | null; durationMs?: number | null; goalStatus?: string | null; goalBeforeStatus?: string | null; goalOrigin?: string; timeoutMs?: number | null; thinkingStatus?: 'completed' | 'interrupted'; idx: number; ts: number; type: string; text: string | null; html?: string | null; htmlSource?: 'assistant-answer' | null; name?: string | null; preview?: string | null; isError?: boolean; attachments?: import('./attachments').ChatAttachment[] };
export type ActiveTool = { id: string; name: string; subject: string; startedAt: number; timeoutMs?: number | null; state: 'running' | 'stopping'; tail: string };
export type EventPage = { mascot?: 'crab' | 'deepy' | 'whalegirl' | 'desksprite' | 'bitty' | 'tmuxai' | 'planet' | 'rainbow-terminal-cat'; streamHandoff?: boolean; archived?: boolean; runs?: import('../components/mauzcode/transcriptGroups').RunMetadata[]; turnStartedAt?: number | null; activityStartedAt?: number | null; thinking?: { startedAt: number; publicSummary?: string } | null; activeTools?: ActiveTool[]; agentId: string; events: ChatEvent[]; olderBefore: number | null; hasOlder: boolean; isRunning: boolean; runState: string; lastError: string | null; partial: { text: string; revision: number; startedAt: number } | null };
export type ToolDetails = { idx: number; ts: number; type: string; name: string; args: string; argsTruncated: boolean; result: string; resultTruncated: boolean; isError: boolean };
/** Fetch details only when a tool row is expanded, using the existing bounded endpoint. */
export function getToolDetails(agentId: string, idx: number, signal?: AbortSignal) {
  return requestJson<{ event: ToolDetails }>(`/api/v1/agents/${encodeURIComponent(agentId)}/events/${idx}`, { signal });
}
export class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }

export async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, { credentials: 'same-origin', cache: 'no-store', ...init, headers: { Accept: 'application/json', ...init.headers } });
  const isJson = response.headers.get('content-type')?.includes('application/json');
  if (!isJson) throw new ApiError('Сессия недоступна. Откройте MauzCode и войдите снова.', response.status === 200 ? 401 : response.status);
  const body = await response.json();
  if (!response.ok) throw new ApiError(body.message || body.error || `Ошибка HTTP ${response.status}`, response.status);
  return body as T;
}
export function getAgents(signal?: AbortSignal) { return requestJson<{ agents: MauzCodeAgent[] }>('/api/v1/agents', { signal }); }
export function getEvents(id: string, signal?: AbortSignal, before?: number) {
  return requestJson<EventPage>(`/api/v1/agents/${encodeURIComponent(id)}/events?limit=80${before == null ? '' : `&before=${before}`}`, { signal });
}
/** The same idempotency key must survive an uncertain retry with identical text. */
export function markChatRead(id: string, throughTs: number, signal?: AbortSignal) {
  return requestJson<{ ok: boolean; seenAt: number }>(`/api/v1/agents/${encodeURIComponent(id)}/read`, {
    method: 'POST', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ throughTs }),
  });
}

export function sendMessage(id: string, text: string, requestId: string, files: File[] = []) {
  const body = new FormData(); body.set('text', text); body.set('requestId', requestId);
  files.forEach(file => body.append('files', file));
  return requestJson<{ ok: boolean; messageIdx?: number; queued?: boolean; queueId?: string }>(`/agent/${encodeURIComponent(id)}`, { method: 'POST', headers: { 'Idempotency-Key': requestId }, body });
}
export type ContextBudget = { estimatedTokens: number; usedTokens?: number; usedSource?: 'provider' | 'estimate'; contextWindow: number | null; mode: 'full' | 'compact'; fallback: string | null; lastReportedTokens: number | null };
export type ContextDetails = {
  coverage?: { requests: number; tokenRequests: number; timedRequests: number; ttftRequests: number; cacheRequests: number; tools: number; timedTools: number };
  breakdown: { systemPrompt: number; toolDefinitions: number; messages: number } | null;
  session: { llmTimeMs: number | null; toolTimeMs: number | null; avgTtftMs: number | null; tokensPerSecond: number | null };
  usage: { cacheWriteTokens?: number | null; requests: number; inputTokens: number | null; uncachedInputTokens: number | null; cachedInputTokens: number | null; outputTokens: number | null; cacheHitRatio: number | null; costUsd?: number | null; price?: { input: number; output: number; cacheRead: number | null; cacheWrite: number | null } | null };
};
export function getContextBudget(id: string, signal?: AbortSignal) { return requestJson<{ budget: ContextBudget | null; details?: ContextDetails | null }>(`/api/v1/agents/${encodeURIComponent(id)}/context`, { signal }); }
export function compactAgent(id: string) { return requestJson<{ ok: boolean; status: 'compacted' | 'not_needed' | 'stale' }>(`/api/v1/agents/${encodeURIComponent(id)}/compact`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); }
export function stopAgent(id: string) { return requestJson<{ ok: boolean }>(`/api/v1/agents/${encodeURIComponent(id)}/stop`, { method: 'POST' }); }

/** Merge a refreshed tail, replacing its range while preserving loaded older pages. */
export function mergeTail(previous: ChatEvent[], page: EventPage): ChatEvent[] {
  if (page.olderBefore == null) return settleRetries(page.events);
  return settleRetries([...previous.filter(event => event.idx < page.olderBefore!), ...page.events]);
}

const RETRY_PROGRESS = new Set(['assistant', 'tool_call', 'tool_result', 'thinking', 'error']);
/**
 * Lifecycle markers are hidden and incremental pages never resend an older retry row,
 * so a row outside the refreshed tail keeps its fetch-time state. Durable later rows
 * prove the outcome: a later attempt or model output means it started; a stop
 * (the 'stopped by user' error the backend writes) means cancelled.
 */
export function settleRetries(events: ChatEvent[]): ChatEvent[] {
  let changed = false;
  const result = events.map((event, index) => {
    if (event.type !== 'llm_retry' || (event.retryState ?? 'scheduled') !== 'scheduled') return event;
    for (const later of events.slice(index + 1)) {
      const state = later.type === 'stop' || (later.type === 'error' && /^stopped by user/.test(later.text ?? '')) ? 'cancelled'
        : (later.type === 'llm_retry' && later.retryId === event.retryId && (later.retry ?? 0) > (event.retry ?? 0)) || RETRY_PROGRESS.has(later.type) ? 'started' : null;
      if (state) { changed = true; return { ...event, retryState: state } as ChatEvent; }
    }
    return event;
  });
  return changed ? result : events;
}
