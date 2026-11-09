import { pageCsrfToken } from '../../lib/csrf';
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
  // POST /canvas/:id requires the cookie-bound CSRF token: the page's meta, else ask /state once.
  let csrfToken = pageCsrfToken();
  if (!csrfToken) {
    const state = await fetch(`/canvas/${encodeURIComponent(agentId)}/state`, { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } });
    if (!state.ok) throw new Error(`Не удалось открыть файл в Canvas (HTTP ${state.status})`);
    csrfToken = String(((await state.json().catch(() => ({}))) as { csrfToken?: unknown }).csrfToken ?? '');
  }
  const response = await fetch(`/canvas/${encodeURIComponent(agentId)}`, {
    method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-CSRF-Token': csrfToken },
    body: JSON.stringify({ show: { kind: 'file', args: file } }),
  });
  if (!response.ok) throw new Error(`Не удалось открыть файл в Canvas (HTTP ${response.status})`);
  if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('Сессия Canvas недоступна. Войдите в Hyper снова.');
}
