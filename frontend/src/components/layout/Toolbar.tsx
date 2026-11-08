import type { ReactNode } from 'react';
export type ToolbarProps = { title: string; subtitle?: string; leading?: ReactNode; actions?: ReactNode };
export function Toolbar({ title, subtitle, leading, actions }: ToolbarProps) {
  return <header className="toolbar">{leading}<div className="toolbar-heading"><h2>{title}</h2>{subtitle && <span>{subtitle}</span>}</div>{actions && <div className="toolbar-actions">{actions}</div>}</header>;
}
