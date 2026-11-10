// Independently implemented from the MIT DeepSeek Harness directory-picker UI.
// Copyright (c) 2026 DeepSeek. License: ../../../THIRD_PARTY_NOTICES.md.
import { useEffect, useRef, useState } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { Check, ChevronRight, Folder, FolderPlus, Pencil } from 'lucide-react';
import { browseDirectories, createDirectory, directoryBreadcrumbs, openWorkspaceDirectory, type DirectoryListing } from '../../lib/workspaceDirectories';
import './workspace-directory-dialog.css';

type Frame = { current: DirectoryListing; parent: DirectoryListing | null };
/** Browse server directories and register the explicitly opened directory as a MauzCode project. */
export function WorkspaceDirectoryDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; onCreated: () => void }) {
  const [target, setTarget] = useState<string>();
  const [frame, setFrame] = useState<Frame | null>(null);
  const [hidden, setHidden] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [newFolder, setNewFolder] = useState(false);
  const [name, setName] = useState('');
  const [folderError, setFolderError] = useState('');
  const [busy, setBusy] = useState(false);
  const action = useRef<AbortController | null>(null);
  const lock = useRef(false);
  const pathInput = useRef<HTMLInputElement>(null);
  const newInput = useRef<HTMLInputElement>(null);
  const columns = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) { action.current?.abort(); lock.current = false; setBusy(false); setFrame(null); setTarget(undefined); setEditing(false); setNewFolder(false); setError(''); }
    return () => { action.current?.abort(); };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true); setError('');
    void (async () => {
      try {
        const current = await browseDirectories(target, hidden, controller.signal);
        // Commit both panes together; no intermediate parent/child mismatch.
        let parent: DirectoryListing | null = null;
        if (current.parentPath) {
          try { parent = await browseDirectories(current.parentPath, hidden, controller.signal); }
          catch (cause) { if (controller.signal.aborted) throw cause; /* A readable child may have an unreadable parent. */ }
        }
        if (!controller.signal.aborted) setFrame({ current, parent });
      } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not read directory'); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => controller.abort();
  }, [open, target, hidden, retry]);
  useEffect(() => { if (editing) { pathInput.current?.focus(); pathInput.current?.select(); } }, [editing]);
  useEffect(() => { if (columns.current) columns.current.scrollLeft = columns.current.scrollWidth; }, [frame]);
  const navigate = (path: string) => { setTarget(path); setRetry(value => value + 1); setEditing(false); };
  const runAction = async (kind: 'folder' | 'open') => {
    if (!frame || loading || lock.current) return;
    if (kind === 'folder' && (!name.trim() || /[/\\]/.test(name) || name === '.' || name === '..')) { setFolderError('Enter a folder name without path separators'); return; }
    const controller = new AbortController(); action.current = controller; lock.current = true; setBusy(true); setError(''); setFolderError('');
    try {
      if (kind === 'folder') {
        const result = await createDirectory(frame.current.path, name.trim(), frame.current.csrfToken, controller.signal);
        if (!controller.signal.aborted) { setNewFolder(false); navigate(result.path); }
      } else {
        await openWorkspaceDirectory(frame.current.path, frame.current.csrfToken, controller.signal);
        if (!controller.signal.aborted) { onCreated(); onOpenChange(false); }
      }
    } catch (cause) {
      if (!controller.signal.aborted) (kind === 'folder' ? setFolderError : setError)(cause instanceof Error ? cause.message : 'Request failed');
    } finally { if (!controller.signal.aborted) { lock.current = false; setBusy(false); } }
  };
  const pane = (listing: DirectoryListing, selected?: string) => <section className="workspace-directory-column" aria-label={`Directories in ${listing.path}`} key={listing.path}>
    {listing.entries.length ? listing.entries.map(entry => <button type="button" className="workspace-directory-row" aria-pressed={entry.path === selected} key={entry.path} disabled={busy} onClick={() => navigate(entry.path)} title={entry.path}><Folder size={16} strokeWidth={1.4} /><span>{entry.name}</span><ChevronRight size={13} strokeWidth={1.4} /></button>) : <p className="workspace-directory-empty">No folders</p>}
  </section>;
  return <Dialog.Root open={open} onOpenChange={value => { if (!lock.current) onOpenChange(value); }}><Dialog.Portal><Dialog.Backdrop className="workspace-directory-backdrop" /><Dialog.Popup className="workspace-directory-dialog" aria-describedby={undefined}>
    <header className="workspace-directory-header"><Dialog.Title>Select Workspace Directory</Dialog.Title><div className="workspace-directory-path">
      {editing ? <form onSubmit={event => { event.preventDefault(); if (draft.trim()) navigate(draft.trim()); }}><input ref={pathInput} aria-label="Directory path" value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setEditing(false); } }} onBlur={() => setEditing(false)} /></form> : <><nav aria-label="Directory path">{directoryBreadcrumbs(frame?.current.path || '/').map((crumb, index) => <span key={crumb.path}>{index > 0 && <ChevronRight size={12} />}<button type="button" disabled={busy} onClick={() => navigate(crumb.path)}>{crumb.name}</button></span>)}</nav><button type="button" className="workspace-directory-edit" aria-label="Edit directory path" disabled={busy} onClick={() => { setDraft((frame?.current.path || '/').replace(/\/$/, '') + '/'); setEditing(true); }}><Pencil size={13} /></button></>}
    </div></header>
    <div className="workspace-directory-content" aria-busy={loading}>
      {loading && <div role="status" className="workspace-directory-loading">Loading directories…</div>}
      {error && <div role="alert" className="workspace-directory-error">{error}<button type="button" onClick={() => setRetry(value => value + 1)}>Retry</button></div>}
      <div className="workspace-directory-columns" ref={columns}>{frame && <>{frame.parent && pane(frame.parent, frame.current.path)}{pane(frame.current)}</>}</div>
    </div>
    <footer className="workspace-directory-footer"><button type="button" disabled={!frame?.current.canCreate || loading || busy} onClick={() => { setName(''); setFolderError(''); setNewFolder(true); }}><FolderPlus size={15} />New folder</button><button type="button" className="workspace-directory-hidden" aria-pressed={hidden} disabled={busy} onClick={() => setHidden(value => !value)}><span className="workspace-directory-check">{hidden && <Check size={12} />}</span>Show hidden files</button><div className="workspace-directory-actions"><Dialog.Close disabled={busy}>Cancel</Dialog.Close><button type="button" className="workspace-directory-open" disabled={!frame || loading || busy || !!error} onClick={() => void runAction('open')}>{busy && !newFolder ? 'Opening…' : 'Open'}</button></div></footer>
    <Dialog.Root open={newFolder} onOpenChange={value => { if (!busy) setNewFolder(value); }}><Dialog.Portal><Dialog.Backdrop className="workspace-directory-backdrop workspace-directory-nested-backdrop" /><Dialog.Popup className="workspace-directory-new" initialFocus={newInput}><Dialog.Title>New folder</Dialog.Title><Dialog.Description>Create a folder in {frame?.current.path}</Dialog.Description><form onSubmit={event => { event.preventDefault(); void runAction('folder'); }}><label htmlFor="workspace-directory-name">Folder name</label><input id="workspace-directory-name" ref={newInput} value={name} disabled={busy} onChange={event => setName(event.target.value)} autoComplete="off" />{folderError && <p role="alert">{folderError}</p>}<div className="workspace-directory-actions"><Dialog.Close disabled={busy}>Cancel</Dialog.Close><button type="submit" disabled={busy || !name.trim()}>{busy ? 'Creating…' : 'Create'}</button></div></form></Dialog.Popup></Dialog.Portal></Dialog.Root>
  </Dialog.Popup></Dialog.Portal></Dialog.Root>;
}
