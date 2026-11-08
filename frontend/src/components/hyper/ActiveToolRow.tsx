import { useToolReveal } from './useToolReveal';
import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { ActiveTool } from '../../lib/hyper';
import { ToolPreview } from './ToolPreview';
import { ToolShimmer } from './ToolShimmer';
import { ToolTiming } from './ToolTiming';
import { toolKind } from './toolKind';
import { ToolModal } from './ToolModal';
import { useIsMobile } from '../../hooks/useIsMobile';
import './tool-row.css';
/** Running state comes from the live tool registry, never inferred from transcript order. */
export function ActiveToolRow({ run, autoOpen = true }: { run: ActiveTool; autoOpen?: boolean }) {
  const [manualOpen, setManualOpen] = useState<boolean | null>(null);
  const mobile = useIsMobile();
  // Mobile never expands inline: only an explicit tap opens the live output in a modal.
  const open = mobile ? manualOpen === true : manualOpen ?? autoOpen;
  const { row, requestReveal } = useToolReveal(open, run.tail);
  const { icon: Icon, label } = toolKind(run.name);
  return <section ref={row} className="tool-row" data-state={run.state}>
    <button className="tool-row-summary" type="button" aria-expanded={mobile ? undefined : open} aria-haspopup={mobile ? 'dialog' : undefined} onClick={() => { if (!mobile) requestReveal(!open); setManualOpen(!open); }}>
      <span className="tool-row-leading"><Icon className="tool-row-icon" size={14} strokeWidth={1.4} aria-hidden="true" />{open ? <ChevronUp className="tool-row-toggle" size={14} /> : <ChevronDown className="tool-row-toggle" size={14} />}</span>
      <ToolShimmer className="tool-row-words"><span className="tool-row-title">{label}</span><span className="tool-row-dot" aria-hidden="true" /><span className="tool-row-description">{run.subject}</span></ToolShimmer>
      <ToolTiming startedAt={run.startedAt} timeoutMs={run.timeoutMs} />
      <span className="sr-only">{run.state === 'stopping' ? 'Останавливается' : 'Выполняется'}</span>
    </button>
    {(() => {
      const panel = <div className="tool-row-panel"><ToolPreview text={run.tail || (run.state === 'stopping' ? 'Останавливается…' : 'Ожидание вывода…')} limit={Number.POSITIVE_INFINITY} /></div>;
      return mobile ? <ToolModal open={open} onOpenChange={setManualOpen} title={run.subject ? `${label} · ${run.subject}` : label}>{panel}</ToolModal> : open && panel;
    })()}
  </section>;
}
