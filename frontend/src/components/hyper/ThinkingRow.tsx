import { useId, useState } from 'react';
import { Atom, ChevronDown, ChevronUp } from 'lucide-react';
import { ChatMarkdown } from './ChatMarkdown';
import { ToolShimmer } from './ToolShimmer';
import { ToolModal } from './ToolModal';
import { useIsMobile } from '../../hooks/useIsMobile';
import './tool-row.css';
/** dsh-style disclosure, restricted to explicitly public provider summaries. */
export function ThinkingRow({ running = true, summary = '', durationMs, interrupted = false }: { running?: boolean; summary?: string; durationMs?: number | null; interrupted?: boolean }) {
  const [open, setOpen] = useState(false);
  const mobile = useIsMobile();
  const id = useId();
  const preview = summary.split('\n').find(line => line.trim())?.replace(/\*\*/g, '') || '';
  const status = running ? 'Модель обдумывает ответ' : interrupted ? 'Обдумывание прервано' : 'Обдумывание завершено';
  const content = <>
    <span className="tool-row-leading"><Atom className="tool-row-icon" size={14} strokeWidth={1.4} aria-hidden="true" />{!running && (open ? <ChevronUp className="tool-row-toggle" size={14} aria-hidden="true" /> : <ChevronDown className="tool-row-toggle" size={14} aria-hidden="true" />)}</span>
    {running ? <ToolShimmer className="tool-row-title" text="Thinking" /> : <span className="tool-row-title">Think</span>}
    {(preview || !running) && <><span className="tool-row-dot" aria-hidden="true" /><span className="tool-row-description">{preview || (interrupted ? 'Прервано' : 'Завершено')}</span></>}
    {!running && durationMs != null && <span className="tool-row-kind">{Math.max(0, Math.round(durationMs / 1000))} с</span>}
  </>;
  return <div className="tool-row thinking-row" data-state={running ? 'running' : interrupted ? 'stopping' : 'ok'}>
    {running && !summary ? <div className="tool-row-summary" role="status" aria-label={status}>{content}</div> : <button className="tool-row-summary" type="button" aria-label={status} aria-expanded={mobile ? undefined : open} aria-haspopup={mobile ? 'dialog' : undefined} aria-controls={mobile ? undefined : id} onClick={() => setOpen(!open)}>{content}</button>}
    {(() => {
      const body = <div id={id} className="thinking-body">
        {summary ? <ChatMarkdown>{summary}</ChatMarkdown> : <p>Провайдер не предоставил публичное резюме.</p>}
        {!running && <p>{status}{durationMs != null ? ` · ${Math.max(0, Math.round(durationMs / 1000))} с` : ''}</p>}
      </div>;
      return mobile ? <ToolModal open={open} onOpenChange={setOpen} title={running ? 'Thinking' : 'Think'}>{body}</ToolModal> : open && body;
    })()}
  </div>;
}
