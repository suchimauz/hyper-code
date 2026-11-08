import { X } from 'lucide-react';
/** Same authenticated React chat in an isolated side surface; closing preserves the parent chat. */
export function SubagentPanel({ id, title, onClose }: { id: string; title: string; onClose: () => void }) {
  return <section className="subagent-panel" aria-label={`Сабагент: ${title}`}><div className="subagent-panel-bar"><span>{title}</span><button type="button" onClick={onClose} aria-label="Закрыть сабагента"><X size={14} strokeWidth={1} /></button></div><iframe title={`Чат сабагента ${title}`} src={`/ui-lab/?agent=${encodeURIComponent(id)}&embedded=1`} /></section>;
}
