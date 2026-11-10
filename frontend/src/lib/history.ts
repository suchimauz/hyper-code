import type { ChoiceInput } from './questions';
import type { ConfirmInput } from './confirms';
import type { GridInput } from './grids';
import type { SecretHistoryInput } from './secrets';
import { requestJson } from './mauzcode';
/** Terminal plugin input with a server-computed, display-safe history summary (Kind.history hook). */
export type PluginHistoryInput = { id: string; agentId: string; kind: string; plugin: true; title: string; message?: string; state: 'submitted' | 'cancelled' | 'expired'; history?: { summary: string; details?: { label: string; value: string }[] } };
/** Input kinds whose answered cards stay visible as transcript history rows. */
export type HistoryInput = ChoiceInput | ConfirmInput | GridInput | SecretHistoryInput | PluginHistoryInput;
export type NativeHistoryInput = Exclude<HistoryInput, PluginHistoryInput>;
export const HISTORY_KINDS = ['choice', 'confirm', 'grid', 'secret'] as const;
export const isHistoryKind = (kind: unknown): kind is NativeHistoryInput['kind'] => (HISTORY_KINDS as readonly unknown[]).includes(kind);
export const isPluginHistory = (input: HistoryInput): input is PluginHistoryInput => 'plugin' in input && input.plugin === true;
type CardRow = { id: string; kind: string; title: string; message?: string; state: string; history?: PluginHistoryInput['history'] };
/** Terminal plugin rows from the owner-only /input/cards projection; only kinds with a history hook. */
export async function getPluginHistoryInputs(agentId: string, signal?: AbortSignal): Promise<PluginHistoryInput[]> {
  const { inputs } = await requestJson<{ inputs: CardRow[] }>(`/input/cards?agentId=${encodeURIComponent(agentId)}`, { signal });
  return inputs.filter(row => row.history && !isHistoryKind(row.kind) && ['submitted', 'cancelled', 'expired'].includes(row.state))
    .map(row => ({ id: row.id, agentId, kind: row.kind, plugin: true, title: row.title, ...(row.message ? { message: row.message } : {}), state: row.state as PluginHistoryInput['state'], history: row.history }));
}
