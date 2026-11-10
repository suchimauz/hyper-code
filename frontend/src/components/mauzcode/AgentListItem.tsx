import { Circle, MessageSquare } from 'lucide-react';
export type AgentListItemProps = { title: string; preview: string; selected?: boolean; active?: boolean; onSelect: () => void };
export function AgentListItem({ title, preview, selected, active, onSelect }: AgentListItemProps) {
  return <button className={`agent-item ${selected ? 'agent-item--selected' : ''}`} aria-current={selected ? 'page' : undefined} onClick={onSelect}>
    <MessageSquare size={16} aria-hidden="true" /><span className="agent-item-text"><strong>{title}</strong><span>{preview}</span></span>
    {active && <Circle size={7} className="status-dot" aria-label="В работе" />}
  </button>;
}
