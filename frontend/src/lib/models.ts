import { requestJson } from './hyper';
import type { NavigationIcon } from './navigation';
import { readSessionSelection } from './newSession';
export type ModelOption = { provider: string; model: string; label: string; disabled: boolean; icon: NavigationIcon | null };
export type ModelSettings = {
  agentId: string; model: string; label: string; icon: NavigationIcon | null;
  models: ModelOption[];
  effort: { requested: string; applied: string; supported: string[]; mode: string };
};
export const getModelSettings = (id: string, signal?: AbortSignal) => requestJson<ModelSettings>(`/ui-lab-api/models?agentId=${encodeURIComponent(id)}`, { signal });
// Capability projection only: choosing a new-session model must not create or mutate an agent.
export async function getDraftModelSettings(model: string, effort: string, signal?: AbortSignal): Promise<ModelSettings> {
  // Fetch the catalogue independently: a removed remembered model must not trap the draft in HTTP 400.
  type Config = Omit<ModelSettings, 'agentId'> & { defaultModel: string };
  const catalogue = await requestJson<Config>('/ui-lab-api/new-session', { signal });
  const available = catalogue.models.filter(option => !option.disabled);
  const remembered = readSessionSelection().model;
  const selected = available.find(option => option.model === model)?.model
    ?? available.find(option => option.model === remembered)?.model ?? available[0]?.model ?? '';
  if (!selected) throw new Error('Нет доступных моделей');
  const config = selected === catalogue.model ? catalogue : await requestJson<Config>(`/ui-lab-api/new-session?${new URLSearchParams({ model: selected })}`, { signal });
  const requested = normalizeEffort(effort, config.effort.supported);
  return { ...config, agentId: '', model: selected, effort: { ...config.effort, requested, applied: requested === 'auto' ? config.effort.applied : requested } };
}
export const setAgentModel = (id: string, model: string) => requestJson<{ ok: boolean; model: string }>(`/api/v1/agents/${encodeURIComponent(id)}/model`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model }) });
export async function setAgentEffort(id: string, effort: string) {
  const body = new FormData(); body.set('effort', effort);
  const response = await fetch(`/agent/${encodeURIComponent(id)}/effort`, { method: 'POST', body, credentials: 'same-origin', redirect: 'error' });
  if (!response.ok) throw new Error((await response.text()).slice(0,300) || `Ошибка HTTP ${response.status}`);
  if (response.status !== 204) throw new Error('Hyper не подтвердил сохранение настройки. Обновите список моделей.');
}
export const normalizeEffort = (effort: string, supported: string[]) => supported.includes(effort) ? effort : 'auto';
export const effortLabel = (value: string) => ({ auto: 'Default', off: 'Off', minimal: 'Minimal', low: 'Low', medium: 'Medium', high: 'High', xhigh: 'Max' }[value] ?? value);
// SSH routes look like `ssh/<host>:<provider>/<account>:<model>`; group them per host account so accounts don't mix.
export const modelGroup = (option: Pick<ModelOption, 'provider' | 'model'>) => {
  const match = /^ssh\/([^:]+):([^:]+):/.exec(option.model);
  return match ? `${match[1]} · ${match[2]}` : option.provider;
};
