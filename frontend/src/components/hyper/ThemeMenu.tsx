import { Monitor, Moon, Sun } from 'lucide-react';
import type { ThemeMode } from '../../hooks/useTheme';
const options = [{ value: 'light', label: 'Светлая', icon: Sun }, { value: 'dark', label: 'Тёмная', icon: Moon }, { value: 'system', label: 'Системная', icon: Monitor }] as const;
/** Cycle the saved appearance preference without opening a menu. */
export function ThemeMenu({ mode, onChange }: { mode: ThemeMode; onChange: (mode: ThemeMode) => void }) {
  const index = options.findIndex(option => option.value === mode);
  const current = options[index];
  const next = options[(index + 1) % options.length];
  const Icon = current.icon;
  const label = `Тема: ${current.label}. Переключить на: ${next.label}`;
  return <button type="button" className="nav-icon-button workspace-theme" aria-label={label} title={label} onClick={() => onChange(next.value)}><Icon size={16} strokeWidth={1} aria-hidden="true" /></button>;
}
