import { requestJson } from './hyper';
export type GridInput = { id: string; agentId: string; kind: 'grid'; title: string; message?: string; createdAt?: string; updatedAt?: string; state: 'open' | 'processing' | 'submitted' | 'cancelled'; spec: { columns: { label: string }[]; multiple: boolean }; result?: { rows: string[][] } | null };
export type GridInputsState = { inputs: GridInput[]; csrfToken: string };
export type GridRow = { value: string; cells: string[] };
export type GridSearch = { id: string; q: string; page: number; rows: GridRow[] };
const url = (agentId: string) => `/ui-lab-api/grids?agentId=${encodeURIComponent(agentId)}`;
/** Picked rows survive card remounts (minimize, poll refresh) until submit or cancel. */
const picks = new Map<string, GridRow[]>();
const key = (agentId: string, inputId: string) => JSON.stringify([agentId, inputId]);
export const readGridPicks = (agentId: string, inputId: string) => picks.get(key(agentId, inputId)) || [];
export const saveGridPicks = (agentId: string, inputId: string, rows: GridRow[]) => { picks.set(key(agentId, inputId), rows); };
export const clearGridPicks = (agentId: string, inputId: string) => { picks.delete(key(agentId, inputId)); };
export function getGridInputs(agentId: string, signal?: AbortSignal) { return requestJson<GridInputsState>(url(agentId), { signal }); }
export function searchGrid(agentId: string, inputId: string, q: string, signal?: AbortSignal) { return requestJson<GridSearch>(`${url(agentId)}&id=${encodeURIComponent(inputId)}&q=${encodeURIComponent(q)}`, { signal }); }
export function submitGridInput(agentId: string, inputId: string, answer: { values: string[] } | { cancel: true }, csrfToken: string) {
  return requestJson(url(agentId), { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken }, body: JSON.stringify({ id: inputId, ...answer }) });
}
/** The oldest still-open grid is the one the agent is waiting on. */
export const pendingGrid = (inputs: GridInput[]) => inputs.find(item => item.kind === 'grid' && (item.state === 'open' || item.state === 'processing'));
