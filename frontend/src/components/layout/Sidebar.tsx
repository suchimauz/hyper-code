import type { ReactNode } from 'react';
export type SidebarProps = { header: ReactNode; children: ReactNode; footer?: ReactNode };
export function Sidebar({ header, children, footer }: SidebarProps) {
  return <nav className="sidebar" aria-label="Навигация по агентам"><div className="sidebar-header">{header}</div><div className="sidebar-content">{children}</div>{footer && <div className="sidebar-footer">{footer}</div>}</nav>;
}
