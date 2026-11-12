// Geometry follows the dsh settings modal (DeepSeek Harness, MIT); see THIRD_PARTY_NOTICES.md.
import { Dialog } from '@base-ui/react/dialog';
import { Bell, Network, Plug, RefreshCw, Server, X } from 'lucide-react';
import { LlmConnectionsPanel } from './LlmConnectionsPanel';
import { SshInstancesPanel } from './SshInstancesPanel';
import { PushSettingsPanel } from './PushSettingsPanel';
import { UpdatesPanel } from './UpdatesPanel';
import { SocksProxies } from '../../core-ui/socks-proxies';
import './settings.css';

export const SETTINGS_TABS = [{ id: 'llm-connections', label: 'LLM Connections', icon: Plug }, { id: 'ssh-instances', label: 'SSH Instances', icon: Server }, { id: 'push-notifications', label: 'Notifications', icon: Bell }, { id: 'updates', label: 'Updates', icon: RefreshCw }, { id: 'socks-proxies', label: 'SOCKS5', icon: Network }] as const;
export type SettingsTab = typeof SETTINGS_TABS[number]['id'];

/**
 * Centered settings modal like dsh: mask + 800px panel, section list on the left,
 * close button in the content header. Escape, mask click and the close button close it.
 */
export function SettingsDialog({ open, tab, onTab, onOpenChange, theme = 'light' }: { open: boolean; tab: SettingsTab; onTab: (tab: SettingsTab) => void; onOpenChange: (open: boolean) => void; theme?: 'light' | 'dark' }) {
  return <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal>
      <Dialog.Backdrop className="settings-mask" />
      <Dialog.Popup className="settings-panel-modal" aria-describedby={undefined}>
        <nav className="settings-nav" aria-label="Разделы настроек">
          <Dialog.Title className="settings-nav-title">Settings</Dialog.Title>
          <div className="settings-nav-list">
            {SETTINGS_TABS.map(({ id, label, icon: Icon }) => <button key={id} type="button" className={`settings-nav-cell ${tab === id ? 'is-active' : ''}`} aria-current={tab === id ? 'true' : undefined} onClick={() => onTab(id)}><Icon size={16} strokeWidth={1.5} aria-hidden="true" /><span>{label}</span></button>)}
          </div>
          <select className="settings-nav-select settings-select" aria-label="Раздел настроек" value={tab} onChange={(event) => onTab(event.target.value as SettingsTab)}>
            {SETTINGS_TABS.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}
          </select>
          <Dialog.Close className="settings-close settings-nav-close" aria-label="Закрыть настройки"><X size={16} strokeWidth={1.5} /></Dialog.Close>
        </nav>
        <div className="settings-content">
          <div className="settings-header" aria-hidden="true" />
          <div className="settings-options">{tab === 'push-notifications' && <PushSettingsPanel />}{tab === 'llm-connections' && <LlmConnectionsPanel />}{tab === 'ssh-instances' && <SshInstancesPanel onOpenConnections={() => onTab('llm-connections')} />}{tab === 'updates' && <UpdatesPanel />}{tab === 'socks-proxies' && <SocksProxies context={{ agentId: null, theme, readOnly: false }} />}</div>
        </div>
      </Dialog.Popup>
    </Dialog.Portal>
  </Dialog.Root>;
}
