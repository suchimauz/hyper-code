import type { ReactNode } from 'react';
export type AppShellProps = { sidebar: ReactNode; children: ReactNode; sidebarVisible?: boolean; sidebarCompact?: boolean; workspaceNav?: boolean; mobileHeader?: ReactNode };
export function AppShell({ sidebar, children, sidebarVisible = true, sidebarCompact = false, workspaceNav = false, mobileHeader }: AppShellProps) {
  return <div className={`app-shell ${sidebarVisible ? '' : 'app-shell--collapsed'} ${sidebarCompact ? 'app-shell--compact' : ''} ${workspaceNav ? 'app-shell--workspace-nav' : ''}`}>
    <a className="skip-link" href="#workspace">К содержимому</a>
    {sidebarVisible && <aside className="desktop-sidebar">{sidebar}</aside>}
    <div className="app-workspace">{mobileHeader && <div className="mobile-header">{mobileHeader}</div>}<main id="workspace" tabIndex={-1}>{children}</main></div>
  </div>;
}
