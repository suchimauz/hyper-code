import { requestJson } from './mauzcode';
import type { ModelConnectionView, ModelProviderView, ModelTransportSpec } from '../extensions/types';
import type { NavigationIcon } from './navigation';

export type { ModelConnectionView, ModelProviderView, ModelTransportSpec, ModelFieldSpec } from '../extensions/types';

/** Mirrors the backend UsageReport: status-only, or with quota windows and balance. */
export type ModelUsageReport = {
  status: 'available' | 'unavailable' | 'configured' | 'disabled';
  reason?: string;
  /** Subscription plan reported by the provider, when available. */
  plan?: string;
  checkedAt: number;
  windows?: { label: string; usedPercent?: number; remaining?: number; resetAt?: number }[];
  balance?: { amount: number; currency: string };
};
export type ModelTestResult = { status: ModelUsageReport['status']; reason: string; message: string; checkedAt: number };
export type ModelInfo = { id: string; label?: string; description?: string; contextWindow?: number; maxOutputTokens?: number; disabled?: boolean };
export type SavedProxy = { id: string; name: string; host: string; port: number };
/** Secret-free overview from GET /models/api; trusted SSH instances only. */
export type ModelsState = { providers: ModelProviderView[]; connections: ModelConnectionView[]; /** Brand mark by provider id; null or missing means generic icon. */ providerLogos?: Record<string, NavigationIcon | null>; proxies: SavedProxy[]; instances: string[]; csrfToken: string };
/** Connection create/update payload. Secrets: omitted key keeps the stored value, null clears it. */
export type ConnectionInput = { accountName: string; config: Record<string, unknown>; secrets: Record<string, string | null>; transport: ModelTransportSpec; enabled?: boolean };

const PATH = '/models/api';

export async function getModelsState(signal?: AbortSignal): Promise<ModelsState> {
  const data = await requestJson<ModelsState>(PATH, { signal });
  if (!Array.isArray(data.providers) || !Array.isArray(data.connections) || typeof data.csrfToken !== 'string') throw new Error('Не удалось загрузить модели');
  return { ...data, proxies: Array.isArray(data.proxies) ? data.proxies : [], instances: Array.isArray(data.instances) ? data.instances : [] };
}

function post<T>(csrfToken: string, body: Record<string, unknown>, signal?: AbortSignal) {
  return requestJson<T>(PATH, { method: 'POST', signal, headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken }, body: JSON.stringify(body) });
}

export const createConnection = (csrf: string, provider: string, input: ConnectionInput) =>
  post<{ connection: ModelConnectionView }>(csrf, { action: 'create', provider, ...input }).then(r => r.connection);
export const updateConnection = (csrf: string, id: string, input: Partial<ConnectionInput>) =>
  post<{ connection: ModelConnectionView }>(csrf, { action: 'update', id, ...input }).then(r => r.connection);
export const setConnectionEnabled = (csrf: string, id: string, enabled: boolean) => updateConnection(csrf, id, { enabled });
/** The backend rejects removal without explicit `confirmed: true`. */
export const removeConnection = (csrf: string, id: string) => post<{ removed: string }>(csrf, { action: 'remove', id, confirmed: true });
export const testConnection = (csrf: string, id: string) => post<{ result: ModelTestResult }>(csrf, { action: 'test', id }).then(r => r.result);
export const connectionUsage = (csrf: string, id: string, refresh = false, signal?: AbortSignal) =>
  post<{ usage: ModelUsageReport }>(csrf, { action: 'usage', id, refresh }, signal).then(r => r.usage);
export const setModelEnabled = (csrf: string, id: string, model: string, enabled: boolean) =>
  post<{ connection: ModelConnectionView }>(csrf, { action: 'setModelEnabled', id, model, enabled }).then(r => r.connection);
/** Runs a provider-declared action (for example Codex login/loginStatus/cancelLogin/logout). */
export const connectionAction = <T = unknown>(csrf: string, id: string, name: string, input: unknown = null, signal?: AbortSignal) =>
  post<{ result: T }>(csrf, { action: 'action', id, name, input }, signal).then(r => r.result);
export const connectionModels = (csrf: string, id: string, refresh = false) => post<{ models: ModelInfo[]; source: 'provider' | 'manual'; cachedAt?: number | null; error?: string }>(csrf, { action: 'models', id, refresh });

export function transportLabel(transport: ModelTransportSpec, proxies: readonly SavedProxy[]): string {
  if (transport.kind === 'socks') return `SOCKS5 · ${proxies.find(p => p.id === transport.proxyId)?.name ?? 'missing proxy'}`;
  if (transport.kind === 'ssh-tunnel') return `SSH · ${transport.instance}`;
  return 'Direct';
}
