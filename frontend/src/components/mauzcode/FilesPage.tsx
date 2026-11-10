import { useEffect, useMemo, useState } from 'react';
import { requestJson } from '../../sdk/api';
import { CanvasFile, type FileData, type FileTransport } from './CanvasFile';

/** Decode canonical local, embedded and SSH Files links without interpreting a host as a path. */
export function parseFilesLocation(url: URL) {
  let path = url.searchParams.get('path') ?? '', host = url.searchParams.get('host') ?? '';
  const remote = /^\/files\/remote\/(?:embed\/)?([^/]+)(\/.*)?$/.exec(url.pathname);
  const local = /^\/files\/(?:absolute|embed)(\/.*)?$/.exec(url.pathname);
  if (remote) { host = decodeURIComponent(remote[1]!); path = decodeURIComponent(remote[2] || '/'); }
  else if (local) path = decodeURIComponent(local[1] || '/');
  return { path, host, mode: ['code', 'edit'].includes(url.searchParams.get('tab') ?? '') ? 'source' : url.searchParams.get('tab') === 'preview' ? 'preview' : 'auto' };
}

/** Standalone Files reuses the native Canvas viewer, not a legacy document or a synthetic agent. */
export function FilesPage({ csrfToken: suppliedToken = '', theme = 'light' }: { csrfToken?: string; theme?: 'light' | 'dark' } = {}) {
  const [csrfToken, setCsrfToken] = useState(suppliedToken);
  const [sessionError, setSessionError] = useState('');
  useEffect(() => { if (suppliedToken) return; let active = true; requestJson<{csrfToken: string}>('/files?format=session').then(data => { if (active) setCsrfToken(data.csrfToken); }).catch(error => { if (active) setSessionError(String(error)); }); return () => { active = false; }; }, [suppliedToken]);
  const location = useMemo(() => { try { return parseFilesLocation(new URL(window.location.href)); } catch { return null; } }, []);
  const transport = useMemo<FileTransport | undefined>(() => {
    if (!location) return undefined;
    const query = new URLSearchParams({ path: location.path, ...(location.host ? { host: location.host } : {}) });
    return {
      read: () => requestJson<FileData>(`/files?${query}&format=json`),
      save: (content, expectedContent) => requestJson<FileData>(`/files?${query}`, { method: 'PUT', csrfToken, body: { content, expectedContent } }),
      navigate: async path => { const target = new URL('/files', window.location.origin); target.searchParams.set('path', path); if (location.host) target.searchParams.set('host', location.host); if (window.location.pathname.includes('/embed/') || new URLSearchParams(window.location.search).get('embed') === '1') target.searchParams.set('embed', '1'); window.location.assign(target); },
      documentUrl: `/files/raw?${query}`,
    };
  }, [location, csrfToken]);
  if (sessionError) return <main><p role="alert">{sessionError}</p></main>;
  if (!location || !transport) return <main><p role="alert">Некорректный адрес файла.</p></main>;
  return <main style={{ display: 'flex', flexDirection: 'column', height: '100dvh', minHeight: 0 }}><CanvasFile agentId="" item={{ id: 0, title: location.path, icon: 'file', active: true, kind: 'file', args: location }} csrfToken={csrfToken} theme={theme} refresh={() => {}} transport={transport} /></main>;
}
