import { useEffect, useRef, useState } from 'react';
import { Menu } from '@base-ui/react/menu';
import { createPortal } from 'react-dom';
import { WorkspaceSuggestions } from './WorkspaceSuggestions';
import { PendingAttachments } from './PendingAttachments';
import { attachmentLimitError } from '../../lib/attachments';
import { useChatFileDrop } from '../../hooks/useChatFileDrop';
import { Check, Circle, FolderOpen, Network } from 'lucide-react';
import { ComposerAddButton } from './ComposerAddButton';
import { MessageInput } from './MessageInput';
import { ModelPicker } from './ModelPicker';
import { CrabMascot } from './CrabMascot';
import { MascotPicker } from './MascotPicker';
import { normalizeMascotChoice } from '../../lib/mascots';
import { ApiError } from '../../lib/mauzcode';
import { validateCommand } from '../../lib/commands';
import type { NavigationProject } from '../../lib/navigation';
import { clearNewSessionDraft, getNewSessionDefaults, persistNewSessionDraft, submitNewSession, type NewSessionDraft } from '../../lib/newSession';
import './new-session.css';
const pendingKey = 'mauzcode-ui-new-session-pending';
type PendingDraft = NewSessionDraft & { fileCount?: number };
// File objects never enter storage. A reload cannot turn a file request into text-only.
const pendingFiles = new Map<string, File[]>();
function readPending(): PendingDraft | null { try { return JSON.parse(sessionStorage.getItem(pendingKey) || 'null'); } catch { return null; } }
/** No agent-scoped endpoints run here. The first submit is the sole creation boundary. */
export function NewSessionComposer({ draft, onChange, projects, onCreated, onPending }: { draft: NewSessionDraft; onChange: (draft: NewSessionDraft) => void; projects: NavigationProject[]; onCreated: (id: string) => void; onPending: (pending: boolean) => void }) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [modelReady, setModelReady] = useState(false);
  const [pending, setPending] = useState<PendingDraft | null>(readPending);
  const [error, setError] = useState('');
  const [presets, setPresets] = useState<Record<string, {label: string; text: string}>>({});
  const [presetsError, setPresetsError] = useState('');
  useEffect(() => { const controller = new AbortController(); void getNewSessionDefaults(controller.signal).then(value => setPresets(value.promptPresets || {})).catch(error => { if (!controller.signal.aborted) setPresetsError(String(error)); }); return () => controller.abort(); }, []);
  const lock = useRef(false);
  const anchor = useRef<HTMLDivElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const locked = busy || !!pending;
  const shownFiles = pending ? pendingFiles.get(pending.requestKey) || [] : files;
  const missingFiles = !!pending?.fileCount && shownFiles.length !== pending.fileCount;
  const addFiles = (incoming: File[]) => {
    if (lock.current || locked) return;
    const next = [...files, ...incoming.filter(file => file.size > 0)];
    const problem = attachmentLimitError(next);
    if (problem) { setError(problem); return; }
    setFiles(next); setError(''); onChange({ ...draft, requestKey: crypto.randomUUID() });
  };
  const dragging = useChatFileDrop({ anchor, onFiles: addFiles, disabled: locked });
  const available = projects.filter(p => !p.archived && !p.virtual);
  const selected = available.find(p => p.id === draft.projectId);
  const shown = pending || draft;
  const mascot = normalizeMascotChoice(shown.mascot);
  useEffect(() => { onPending(busy || !!pending); }, [busy, pending, onPending]);
  const change = (patch: Partial<NewSessionDraft>) => { if (!busy && !pending) onChange({ ...draft, ...patch, requestKey: crypto.randomUUID() }); };
  const send = async () => {
    if (lock.current || missingFiles || (!pending && (!modelReady || !draft.model || (!draft.text.trim() && !files.length) || (!selected && !draft.workspaceDir)))) return;
    lock.current = true; setBusy(true); setError('');
    const snapshot = pending || { ...draft, text: draft.text.trim(), fileCount: files.length };
    const snapshotFiles = pending ? shownFiles : [...files];
    try { await validateCommand(snapshot.text, snapshotFiles.length); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); lock.current = false; setBusy(false); return; }
    pendingFiles.set(snapshot.requestKey, snapshotFiles);
    setPending(snapshot);
    try { sessionStorage.setItem(pendingKey, JSON.stringify(snapshot)); } catch { /* Mounted state retains the retry snapshot. */ }
    persistNewSessionDraft(snapshot);
    try {
      const defaults = await getNewSessionDefaults();
      const result = await (snapshotFiles.length ? submitNewSession(snapshot, defaults.csrfToken, snapshotFiles) : submitNewSession(snapshot, defaults.csrfToken));
      if (result.status !== 'sent' || !result.agentId) throw new Error('Сервер не подтвердил отправку. Повторите с тем же ключом.');
      clearNewSessionDraft(); try { sessionStorage.removeItem(pendingKey); } catch { /* Optional storage. */ }
      pendingFiles.delete(snapshot.requestKey); setFiles([]); setPending(null); onCreated(result.agentId);
    } catch (err) {
      // These responses reject the payload before creation; uncertain errors retain the immutable retry.
      if (err instanceof ApiError && [400, 401, 403, 404, 413, 415, 422].includes(err.status)) { pendingFiles.delete(snapshot.requestKey); setPending(null); try { sessionStorage.removeItem(pendingKey); } catch { /* Optional storage. */ } }
      setError(err instanceof Error ? err.message : String(err));
    } finally { lock.current = false; setBusy(false); }
  };
  return <div className="new-session-composer">
    <details className="new-session-advanced" onToggle={event => setAdvancedOpen(event.currentTarget.open)}>
      <summary>Advanced options</summary>
      {advancedOpen && <fieldset disabled={locked} className="new-session-advanced-fields">
        <label>Title<input maxLength={120} value={shown.title || ''} onChange={event => change({title: event.target.value})} placeholder="Optional title" /></label>
        <label>Project workspace<input readOnly value={selected ? `${selected.host ? selected.host + ':' : ''}${selected.dir}` : 'No project selected'} /></label>
        <WorkspaceSuggestions value={shown.workspaceDir || ''} onChange={workspaceDir => change({workspaceDir, createWorkspaceDir: ''})} />
        <p>A custom local directory creates an independent session, without the selected project's host or directory.</p>
        {shown.workspaceDir && <label><input type="checkbox" checked={shown.createWorkspaceDir === '1'} onChange={event => change({createWorkspaceDir: event.target.checked ? '1' : ''})} />Create this directory if it does not exist</label>}
        <fieldset><legend>Prompt presets</legend>
          {Object.entries(presets).map(([id, preset]) => <details key={id}><summary>{preset.label}</summary><label><input type="checkbox" checked={(shown.promptPreset || []).includes(id)} onChange={event => change({promptPreset: event.target.checked ? [...(shown.promptPreset || []), id] : (shown.promptPreset || []).filter(value => value !== id)})} />Use {preset.label}</label><pre>{preset.text}</pre></details>)}
          {presetsError && <p role="alert">Could not load prompt presets: {presetsError}</p>}
        </fieldset>
        <label>Additional system instructions<textarea rows={4} value={shown.systemPrompt || ''} onChange={event => change({systemPrompt: event.target.value})} /></label>
      </fieldset>}
    </details>
    <div className="new-session-chips"><Menu.Root><Menu.Trigger className="new-session-chip" disabled={busy || !!pending} aria-label="Выбрать Workspace"><FolderOpen size={16} strokeWidth={1} /><span>{available.find(p => p.id === shown.projectId)?.title || 'Выбрать Workspace'}</span></Menu.Trigger><Menu.Portal><Menu.Positioner side="top" align="start" sideOffset={8} collisionPadding={12} className="floating-positioner"><Menu.Popup className="workspace-view-menu" aria-label="Workspace"><Menu.RadioGroup value={draft.projectId} onValueChange={projectId => change({ projectId })}>{available.map(p => <Menu.RadioItem value={p.id} key={p.id} className="workspace-menu-item" title={[p.dir,p.host].filter(Boolean).join(' · ')}><FolderOpen size={14} strokeWidth={1} /><span>{p.title}</span><Menu.RadioItemIndicator><Check size={14} strokeWidth={1} /></Menu.RadioItemIndicator></Menu.RadioItem>)}</Menu.RadioGroup></Menu.Popup></Menu.Positioner></Menu.Portal></Menu.Root><span className="new-session-chip" title="Обычный агент MauzCode с настройками по умолчанию"><Network size={16} strokeWidth={1} />Standard mode</span><MascotPicker value={mascot} disabled={locked} onChange={mascot => change({ mascot })} /></div>
    <div ref={anchor} className="composer-input-anchor"><CrabMascot page={mascot === 'random' ? null : { mascot, agentId: 'new-session-preview', events: [], olderBefore: null, hasOlder: false, isRunning: false, runState: 'idle', lastError: null, partial: null }} /><MessageInput commandsEnabled commandMenuOpen={menuOpen} onCommandMenuClose={() => setMenuOpen(false)} onFile={() => picker.current?.click()} attachments={shownFiles.length > 0 ? <PendingAttachments files={shownFiles} disabled={locked} onRemove={index => { if (!locked) { setFiles(files.filter((_, i) => i !== index)); change({}); } }} /> : undefined} onFiles={addFiles} hasAttachments={shownFiles.length > 0} value={shown.text} placeholder="How can I help you today?" disabled={busy || !!pending} sendDisabled={!modelReady} onChange={text => change({ text })} onSend={() => { void send(); }} /></div>
    {dragging && anchor.current?.closest('.chat-panel') && createPortal(<div className="chat-file-drop-overlay" aria-hidden="true">Отпустите файлы, чтобы прикрепить</div>, anchor.current.closest('.chat-panel')!)}
    <input ref={picker} type="file" multiple hidden disabled={locked} onChange={event => { addFiles(Array.from(event.target.files || [])); event.target.value = ''; }} />
    <div className="new-session-footer"><ComposerAddButton open={menuOpen} disabled={locked} onClick={() => setMenuOpen(open => !open)} /><span className="new-session-draft-label">New Session</span><div className="new-session-model"><ModelPicker onReadyChange={setModelReady} agentId="" running={false} busy={busy || !!pending} revision={0} onSaved={() => {}} onBusyChange={() => {}} draft={{ model: shown.model, effort: shown.effort, onChange: (model, effort) => change({ model, effort }) }} /><Circle size={14} strokeWidth={2} aria-label="Контекст ещё не создан" /></div></div>
    {!available.length && <p className="transcript-notice">Добавьте Workspace в навигации, чтобы начать разговор.</p>}
    {error && <p className="connection-error" role="alert">{error} {pending && 'Первое сообщение ожидает подтверждения; повтор использует тот же ключ и не создаёт второй чат.'}</p>}
    {missingFiles && <p className="connection-error" role="alert">После перезагрузки файлы недоступны. Повтор заблокирован, чтобы не отправить только текст. Проверьте созданный чат в навигации.</p>}
    {pending && !busy && !missingFiles && <button className="new-session-retry" onClick={() => { void send(); }}>Повторить отправку</button>}
  </div>;
}
