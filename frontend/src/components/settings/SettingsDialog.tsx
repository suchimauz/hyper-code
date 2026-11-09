// Geometry follows the dsh settings modal (DeepSeek Harness, MIT); see THIRD_PARTY_NOTICES.md.
import { Dialog } from '@base-ui/react/dialog';
import { Plug, Server, X } from 'lucide-react';
import { LlmConnectionsPanel } from './LlmConnectionsPanel';
import { SshInstancesPanel } from './SshInstancesPanel';
import './settings.css';

export const SETTINGS_TABS = [{ id: 'llm-connections', label: 'LLM Connections', icon: Plug }, { id: 'ssh-instances', label: 'SSH Instances', icon: Server }] as const;
export type SettingsTab = typeof SETTINGS_TABS[number]['id'];

/**
 * Centered settings modal like dsh: mask + 800px panel, section list on the left,
 * close button in the content header. Escape, mask click and the close button close it.
 */
export function SettingsDialog({ open, tab, onTab, onOpenChange }: { open: boolean; tab: SettingsTab; onTab: (tab: SettingsTab) => void; onOpenChange: (open: boolean) => void }) {
  return <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal>
      <Dialog.Backdrop className="settings-mask" />
      <Dialog.Popup className="settings-panel-modal" aria-describedby={undefined}>
        <nav className="settings-nav" aria-label="Разделы настроек">
          <Dialog.Title className="settings-nav-title">Settings</Dialog.Title>
          <div className="settings-nav-list">
            {SETTINGS_TABS.map(({ id, label, icon: Icon }) => <button key={id} type="button" className={`settings-nav-cell ${tab === id ? 'is-active' : ''}`} aria-current={tab === id ? 'true' : undefined} onClick={() => onTab(id)}><Icon size={16} strokeWidth={1.5} aria-hidden="true" /><span>{label}</span></button>)}
          </div>
        </nav>
        <div className="settings-content">
          <div className="settings-header"><Dialog.Close className="settings-close" aria-label="Закрыть настройки"><X size={14} strokeWidth={1.5} /></Dialog.Close></div>
          <div className="settings-options">{tab === 'llm-connections' && <LlmConnectionsPanel />}{tab === 'ssh-instances' && <SshInstancesPanel onOpenConnections={() => onTab('llm-connections')} />}</div>
        </div>
      </Dialog.Popup>
    </Dialog.Portal>
  </Dialog.Root>;
}
