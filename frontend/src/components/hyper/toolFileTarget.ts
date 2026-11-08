export type ToolFileTarget = { path: string; host?: string };

/** Only explicit file-tool arguments, never summaries, code, shell commands or search output. */
export function toolFileTarget(name: string, args: Record<string, unknown>): ToolFileTarget | null {
  if (!['read', 'write', 'edit'].includes(name.split('.').pop() || '')) return null;
  const path = [args.path, args.file_path].find(value => typeof value === 'string' && value.trim());
  if (typeof path !== 'string' || /[\r\n\0]/.test(path)) return null;
  if (args.host !== undefined && (typeof args.host !== 'string' || !args.host.trim())) return null;
  return { path, ...(typeof args.host === 'string' ? { host: args.host } : {}) };
}

/** Canvas resolves relative paths on the target agent's workspace and host. */
export async function openToolFile(agentId: string, file: ToolFileTarget): Promise<void> {
  const response = await fetch(`/canvas/${encodeURIComponent(agentId)}`, {
    method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ show: { kind: 'file', args: file } }),
  });
  if (!response.ok) throw new Error(`Не удалось открыть файл в Canvas (HTTP ${response.status})`);
  if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Сессия Canvas недоступна. Войдите в Hyper снова.');
}
