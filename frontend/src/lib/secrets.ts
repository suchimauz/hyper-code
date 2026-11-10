import { requestJson } from './hyper';
/** History projection of a secret input: only the target reference, never a value. */
export type SecretHistoryInput = { id: string; agentId: string; kind: 'secret'; title: string; message?: string; createdAt?: number; updatedAt?: number; state: 'open' | 'processing' | 'submitted' | 'cancelled'; spec: { saveAs: string; mode: 'password' | 'otp' | 'text' }; result?: { ref: string } | null };
export type SecretInputsState = { inputs: SecretHistoryInput[] };
export function getSecretInputs(agentId: string, signal?: AbortSignal) { return requestJson<SecretInputsState>(`/ui-lab-api/secrets?agentId=${encodeURIComponent(agentId)}`, { signal }); }
