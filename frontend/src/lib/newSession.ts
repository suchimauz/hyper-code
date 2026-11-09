import { requestJson } from './hyper';
import { normalizeMascotChoice, type MascotChoice } from './mascots';
export type NewSessionDraft = { title?: string; workspaceDir?: string; createWorkspaceDir?: string; promptPreset?: string[]; systemPrompt?: string; mascot?: MascotChoice; projectId: string; model: string; effort: string; text: string; requestKey: string };
export type NewSessionDefaults = { version: number; defaultModel: string; csrfToken: string; promptPresets?: Record<string, { label: string; text: string }> };
const storageKey = 'hyper-ui-new-session';
const selectionKey = 'hyper-ui-last-session-selection';
export type SessionSelection = { projectId?: string; model?: string };
/** Local preferences only; always validate these IDs against the current authorized catalogue. */
export function readSessionSelection(): SessionSelection {
  try {
    const value = JSON.parse(localStorage.getItem(selectionKey) || 'null');
    return { ...(typeof value?.projectId === 'string' ? { projectId: value.projectId } : {}), ...(typeof value?.model === 'string' ? { model: value.model } : {}) };
  } catch { return {}; }
}
export function rememberSessionSelection(selection: SessionSelection) {
  try { localStorage.setItem(selectionKey, JSON.stringify({ ...readSessionSelection(), ...selection })); } catch { /* Preferences are optional. */ }
}
/** Use the last workspace only while it remains available; archived and virtual groups are not targets. */
export function resolveNewSessionProject(projects: { id: string; archived?: boolean; virtual?: boolean }[], preferred?: string): string {
  const available = projects.filter(project => !project.archived && !project.virtual);
  return available.find(project => project.id === preferred)?.id ?? available[0]?.id ?? '';
}
export function readNewSessionDraft(): NewSessionDraft {
  const query = new URLSearchParams(window.location.search);
  if (query.get('newSession') === '1') {
    const last = readSessionSelection();
    return { title: query.get('title') || '', workspaceDir: query.get('workspaceDir') || '', promptPreset: query.getAll('promptPreset'), systemPrompt: query.get('systemPrompt') || '', mascot: 'random', projectId: query.get('projectId') || last.projectId || '', model: query.get('model') || last.model || '', effort: query.get('effort') || '', text: query.get('text') || '', requestKey: crypto.randomUUID() };
  }
  try { const d = JSON.parse(sessionStorage.getItem(storageKey) || 'null'); if (d && ['projectId','model','effort','text','requestKey'].every(k => typeof d[k] === 'string')) return { ...d, mascot: normalizeMascotChoice(d.mascot) }; } catch { /* Browser storage is optional. */ }
  const last = readSessionSelection();
  return { mascot: 'random', projectId: last.projectId || '', model: last.model || '', effort: '', text: '', requestKey: crypto.randomUUID() };
}
export function persistNewSessionDraft(draft: NewSessionDraft) { try { sessionStorage.setItem(storageKey, JSON.stringify(draft)); } catch { /* In-memory draft stays usable. */ } }
export function clearNewSessionDraft() { try { sessionStorage.removeItem(storageKey); } catch { /* Optional browser storage. */ } }
export function getNewSessionDefaults(signal?: AbortSignal) { return requestJson<NewSessionDefaults>('/ui-lab-api/new-session', { signal }); }
export function submitNewSession(draft: NewSessionDraft, csrfToken: string, files: readonly File[] = []) {
  const advanced = { title: draft.title || '', workspaceDir: draft.workspaceDir || '', createWorkspaceDir: draft.createWorkspaceDir || '', promptPreset: draft.promptPreset || [], systemPrompt: draft.systemPrompt || '' };
  if (files.length) {
    const body = new FormData();
    body.set('requestKey', draft.requestKey); body.set('projectId', draft.workspaceDir ? '' : draft.projectId); body.set('text', draft.text.trim());
    if (draft.model) body.set('model', draft.model);
    if (draft.effort) body.set('effort', draft.effort);
    body.set('mascot', normalizeMascotChoice(draft.mascot));
    for (const [key, value] of Object.entries(advanced)) body.set(key, Array.isArray(value) ? JSON.stringify(value) : value);
    files.forEach(file => body.append('files', file, file.name));
    return requestJson<{ agentId: string; projectId: string; status: 'sent' }>('/ui-lab-api/new-session', { method: 'POST', headers: { 'X-CSRF-Token': csrfToken }, body });
  }
  return requestJson<{ agentId: string; projectId: string; status: 'sent' }>('/ui-lab-api/new-session', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken }, body: JSON.stringify({ ...advanced, mascot: normalizeMascotChoice(draft.mascot), requestKey: draft.requestKey, projectId: draft.workspaceDir ? '' : draft.projectId, ...(draft.model ? { model: draft.model } : {}), ...(draft.effort ? { effort: draft.effort } : {}), text: draft.text.trim() }) });
}
