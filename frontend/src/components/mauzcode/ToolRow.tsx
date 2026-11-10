import { useToolReveal } from './useToolReveal';
import { toolSummary } from './toolSummary';
import { ToolBody } from './ToolBody';
import { ToolTiming } from './ToolTiming';
import { useEffect, useId, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { toolKind } from './toolKind';
import { getToolDetails, type ChatEvent, type ToolDetails } from '../../lib/mauzcode';
import { toolFileTarget, openToolFile } from './toolFileTarget';
import { ToolModal } from './ToolModal';
import { useIsMobile } from '../../hooks/useIsMobile';
import './tool-row.css';

function parseArgs(text?: string): Record<string, unknown> {
  try { const value: unknown = JSON.parse(text || '{}'); return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
  catch { return {}; }
}
export function ToolRow({ event, agentId, initialDetails }: { event: ChatEvent; agentId: string; initialDetails?: ToolDetails }) {
  const [open, setOpen] = useState(false);
  const mobile = useIsMobile();
  const [details, setDetails] = useState<ToolDetails | null>(initialDetails ?? null);
  const [error, setError] = useState('');
  const [fileError, setFileError] = useState('');
  const [openingFile, setOpeningFile] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const panelId = useId();
  const { row, requestReveal } = useToolReveal(open, details ?? error, Boolean(details || error));
  useEffect(() => {
    if ((!open && !['read', 'write', 'edit'].includes((event.name || '').split('.').pop() || '')) || details) return;
    const controller = new AbortController();
    setError('');
    getToolDetails(agentId, event.idx, controller.signal).then(response => {
      if (!controller.signal.aborted) setDetails(response.event);
    }).catch((err: unknown) => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'Не удалось загрузить подробности'); });
    return () => controller.abort();
  }, [open, details, agentId, event.idx, event.name, attempt]);
  const name = event.name || details?.name || 'tool';
  const shortName = name.split('.').pop() || name;
  const kind = toolKind(name);
  const Icon = kind.icon;
  const args = parseArgs(details?.args);
  const description = event.toolSummary ?? (details ? toolSummary(name, args) : event.type === 'tool_call' ? (event.preview || '').replace(/^(Read|Write|Edit|Search|Find|Run|Evaluate)\s+/, '') : '');
  const failed = event.isError || details?.isError;
  const title = kind?.label || name;
  const file = details && !details.argsTruncated && !failed && event.status !== 'interrupted' && event.status !== 'failed' ? toolFileTarget(name, args) : null;
  async function openFile() {
    if (!file || openingFile) return;
    setOpeningFile(true); setFileError('');
    try { await openToolFile(agentId, file); }
    catch (error) { setFileError(error instanceof Error ? error.message : 'Не удалось открыть файл'); }
    finally { setOpeningFile(false); }
  }
  function toggleDisclosure() {
    if (!mobile) requestReveal(!open);
    setOpen(!open);
  }
  return <section ref={row} className="tool-row" data-state={failed ? 'error' : 'ok'} data-error={failed || undefined}>
    <div className="tool-row-header" onClick={toggleDisclosure}>
    <button type="button" className="tool-row-summary" aria-expanded={mobile ? undefined : open} aria-haspopup={mobile ? 'dialog' : undefined} aria-controls={mobile ? undefined : panelId} onClick={event => { event.stopPropagation(); toggleDisclosure(); }}>
      <span className="tool-row-leading"><Icon className="tool-row-icon" size={14} strokeWidth={1.4} aria-hidden="true" />{open ? <ChevronUp className="tool-row-toggle" size={14} aria-hidden="true" /> : <ChevronDown className="tool-row-toggle" size={14} aria-hidden="true" />}</span>
      <span className="tool-row-title" title={name}>{title}</span>
      {event.type === 'tool_result' && <span className="tool-row-kind">Результат</span>}
      {!file && description && <><span className="tool-row-dot" aria-hidden="true" /><span className="tool-row-description" title={description}>{description}</span></>}
      {failed && <span className="sr-only">Ошибка выполнения</span>}
    </button>
    {file && <><span className="tool-row-dot" aria-hidden="true" /><button type="button" className="tool-row-file" title={`Открыть в Canvas: ${file.host ? file.host + ':' : ''}${file.path}`} aria-label={`Открыть в Canvas: ${file.path}`} disabled={openingFile} onClick={event => { event.stopPropagation(); void openFile(); }}>{file.path}</button></>}
    <ToolTiming durationMs={event.durationMs} timeoutMs={event.timeoutMs} />
    </div>
    {fileError && <p role="alert" className="tool-row-panel">{fileError}</p>}
    {(() => {
      const panel = <div id={panelId} hidden={!open} className="tool-row-panel">
        {open && !details && !error && <p role="status">Загрузка подробностей…</p>}
        {error && <div role="alert"><p>{error}</p><button type="button" className="button button--secondary" onClick={() => setAttempt(value => value + 1)}>Повторить</button></div>}
        {open && details && <ToolBody details={details} kind={shortName} args={args} />}
      </div>;
      return mobile ? <ToolModal open={open} onOpenChange={setOpen} title={description ? `${title} · ${description}` : title}>{panel}</ToolModal> : panel;
    })()}
  </section>;
}
