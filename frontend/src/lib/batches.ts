import { requestJson } from '../sdk/api';
export type BatchDraft = Record<string, string | string[]>;
export type BatchItem = { key: string; kind: string; title: string; message?: string; spec: Record<string, unknown>; filled: boolean; draft?: BatchDraft; contractVersion: 1 };
export type BatchSnapshot = { csrfToken?: string; id: string; agentId: string; kind: 'batch'; title: string; message?: string; state: 'open' | 'processing' | 'submitted' | 'cancelled' | 'expired'; revision: number; currentStep: number; items: BatchItem[]; error?: { code: string; message: string; stepKey?: string }; history?: { summary: string; items: { key: string; kind: string; title: string; message?: string; summary: string; details?: { label: string; value: string }[] }[] } };
const path = (id: string) => `/input/batch/${encodeURIComponent(id)}`;
/** Treat endpoint responses as untrusted; a missing/old endpoint must never mount another kind. */
export function isBatchSnapshot(value: unknown): value is BatchSnapshot {
  if (!value || typeof value !== 'object') return false;
  const row = value as Partial<BatchSnapshot>;
  return row.kind === 'batch' && typeof row.id === 'string' && typeof row.agentId === 'string' && typeof row.title === 'string'
    && ['open', 'processing', 'submitted', 'cancelled', 'expired'].includes(String(row.state))
    && Number.isSafeInteger(row.revision) && Number(row.revision) >= 0 && Number.isSafeInteger(row.currentStep)
    && Array.isArray(row.items) && row.items.length > 0 && row.items.length <= 30 && Number(row.currentStep) >= 0 && Number(row.currentStep) < row.items.length
    && row.items.every(item => item && typeof item.key === 'string' && typeof item.kind === 'string' && typeof item.title === 'string' && item.spec && typeof item.spec === 'object' && !Array.isArray(item.spec) && typeof item.filled === 'boolean' && item.contractVersion === 1 && (item.kind !== 'secret' || item.draft === undefined));
}
function snapshot(value: unknown, id: string): BatchSnapshot {
  if (!isBatchSnapshot(value) || value.id !== id) throw new Error('Invalid batch response');
  return value;
}
export async function getBatches(agentId: string, signal?: AbortSignal) {
  const response = await requestJson<{ inputs?: unknown }>(`/input/batches?agentId=${encodeURIComponent(agentId)}`, { signal });
  return { inputs: Array.isArray(response?.inputs) ? response.inputs.filter(isBatchSnapshot).filter(input => input.agentId === agentId) : [] };
}
export const getBatch = async (id: string, signal?: AbortSignal) => snapshot(await requestJson<unknown>(path(id), { signal }), id);
/** Writes are never retried: after an ambiguous response the host reads the receipt. */
export const writeBatch = async (id: string, action: 'draft' | 'submit' | 'cancel', body: Record<string, unknown>, csrfToken?: string) => snapshot(await requestJson<unknown>(`${path(id)}/${action}`, { method: 'POST', body, csrfToken }), id);
export const batchFieldUrl = (id: string, key: string, theme: string) => `${path(id)}/field?key=${encodeURIComponent(key)}&theme=${theme}`;
