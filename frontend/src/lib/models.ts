import { requestJson } from './mauzcode';
import type { NavigationIcon } from './navigation';
import { readSessionSelection } from './newSession';
export type ModelOption = { provider: string; model: string; label: string; groupLabel?: string; disabled: boolean; icon: NavigationIcon | null };
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
  // Legacy aliases of a remembered or requested route still select the canonical catalogue entry.
  const same = (value: string) => (option: ModelOption) => !!value && (option.model === value || parseModelRoute(option.model).route === parseModelRoute(value).route);
  const selected = available.find(same(model))?.model
    ?? available.find(same(readSessionSelection().model ?? ''))?.model ?? available[0]?.model ?? '';
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
  if (response.status !== 204) throw new Error('MauzCode не подтвердил сохранение настройки. Обновите список моделей.');
}
export const normalizeEffort = (effort: string, supported: string[]) => supported.includes(effort) ? effort : 'auto';
export const effortLabel = (value: string) => ({ auto: 'Default', off: 'Off', minimal: 'Minimal', low: 'Low', medium: 'Medium', high: 'High', xhigh: 'Max' }[value] ?? value);
// Canonical route template shared with the server (llm.parseModelRoute): `[ssh/<host>:]<provider>/<account>:<model>`.
export type ModelRoute = { host: string | null; provider: string; account: string; model: string; route: string };
export const parseModelRoute = (value: string): ModelRoute => {
  const ssh = /^ssh\/([^:]+):(.+)$/.exec(value);
  const host = ssh ? ssh[1] : null; const rest = ssh ? ssh[2] : value;
  const m = /^([a-z][\w-]*)(?:\/([\w.-]+))?:(.+)$/.exec(rest);
  const provider = m ? m[1] : 'lmstudio'; const account = m?.[2] ?? 'default'; const model = m ? m[3] : rest;
  return { host, provider, account, model, route: `${host ? `ssh/${host}:` : ''}${provider}/${account}:${model}` };
};
// SSH routes are grouped per host account so accounts don't mix.
export const modelGroup = (option: Pick<ModelOption, 'provider' | 'model' | 'groupLabel'>) => {
  if (option.groupLabel) return option.groupLabel;
  const route = parseModelRoute(option.model);
  return route.host ? `${route.host} · ${route.provider}/${route.account}` : option.provider;
};
// Account name alone, for compact captions under the current model.
export const modelAccount = (model: string) => parseModelRoute(model).account;
// Provider and account line under a model name; the SSH host is already shown by the group.
export const modelSourceLabel = (model: string) => { const { provider, account } = parseModelRoute(model); return `${provider} · ${account}`; };
