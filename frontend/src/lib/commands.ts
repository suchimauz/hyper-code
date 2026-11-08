import { ApiError, requestJson } from './hyper';

export type CommandDescriptor = { name: string; description: string; usage: string[]; inputHint?: string; attachments?: boolean };
export type CommandCatalogue = { version: 1; commands: CommandDescriptor[]; csrfToken?: string };
export type CommandResult = { ok: boolean; command: string; operationId: string; status: 'running' | 'completed' | 'failed' | 'interrupted'; error?: string; result?: { status: 'compacted' | 'not_needed' | 'stale' } };
/** Submit through Hyper's existing dispatcher, retaining the caller's key across uncertain retries. */
export async function executeCommand(agentId: string, text: string, requestId: string): Promise<CommandResult> {
  const catalogue = await getCommands();
  if (!catalogue.csrfToken) throw new Error('Сервер не выдал токен команды. Обновите страницу.');
  return requestJson<CommandResult>(`/agent/${encodeURIComponent(agentId)}/commands`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': catalogue.csrfToken }, body: JSON.stringify({ text, requestId }) });
}
/** Fetch the authoritative catalogue; a failed request must never turn a command into a model prompt. */
export async function getCommands(signal?: AbortSignal): Promise<CommandCatalogue> {
  const value = await requestJson<CommandCatalogue>('/commands', { signal }).catch(reason => {
    if (reason instanceof ApiError && reason.status === 404) throw new Error('Команды ещё недоступны на сервере. Повторите позже.');
    throw reason;
  });
  if (value.version !== 1 || !Array.isArray(value.commands)) throw new Error('Каталог команд недоступен. Повторите попытку.');
  return value;
}
/** Validate before accepting a draft; the backend remains responsible for dispatch and permissions. */
export async function validateCommand(text: string, fileCount = 0): Promise<void> {
  if (!text.startsWith('/')) return;
  const { commands } = await getCommands();
  const name = /^\/([a-z0-9_-]+)(?:\s|$)/.exec(text)?.[1];
  const command = commands.find(item => item.name === name);
  if (!command) throw new Error('Неизвестная команда. Введите /, чтобы выбрать команду из списка.');
  if (fileCount && !command.attachments) throw new Error(`Команда /${command.name} пока не принимает файлы. Уберите вложения или отправьте их отдельным сообщением.`);
}
export function notifyPlanningChanged(agentId: string) { window.dispatchEvent(new CustomEvent('hyper-planning-changed', { detail: agentId })); }
