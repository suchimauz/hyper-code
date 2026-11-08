import { requestJson } from './hyper';

export type DirectoryListing = { path: string; parentPath: string | null; entries: { name: string; path: string }[]; canCreate: boolean; csrfToken: string };
export function browseDirectories(path: string | undefined, showHidden: boolean, signal: AbortSignal) {
  return requestJson<DirectoryListing>(`/ui-lab-api/directories?${new URLSearchParams({ ...(path ? { path } : {}), showHidden: String(showHidden) })}`, { signal });
}
export async function createDirectory(path: string, name: string, token: string, signal: AbortSignal) {
  return requestJson<{ path: string }>('/ui-lab-api/directories', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-csrf-token': token }, body: JSON.stringify({ path, name }), signal });
}
export async function openWorkspaceDirectory(dir: string, token: string, signal: AbortSignal) {
  const result = await requestJson<{ ok: boolean; error?: string; url?: string }>('/projects/action', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-csrf-token': token }, body: JSON.stringify({ action: 'create', dir }), signal });
  if (!result.ok) throw new Error(result.error || 'Could not open workspace');
  return result;
}
export function directoryBreadcrumbs(path: string) {
  return [{ name: '/', path: '/' }, ...path.split('/').filter(Boolean).map((name, index, parts) => ({ name, path: '/' + parts.slice(0, index + 1).join('/') }))];
}
