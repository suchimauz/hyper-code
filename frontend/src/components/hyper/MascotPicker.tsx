import { Menu } from '@base-ui/react/menu';
import { Check, PawPrint, Shuffle } from 'lucide-react';
import { mascotNames, normalizeMascotChoice, type MascotChoice } from '../../lib/mascots';
export function MascotPicker({ value, disabled, onChange }: { value?: MascotChoice; disabled: boolean; onChange: (value: MascotChoice) => void }) {
  const choice = normalizeMascotChoice(value);
  return <Menu.Root><Menu.Trigger className="new-session-chip mascot-picker" disabled={disabled} aria-label="Выбрать питомца"><PawPrint size={16} strokeWidth={1} /><span>{choice === 'random' ? 'Случайный питомец' : mascotNames[choice]}</span></Menu.Trigger>
    <Menu.Portal><Menu.Positioner side="top" align="start" sideOffset={8} collisionPadding={12} className="floating-positioner"><Menu.Popup className="workspace-view-menu" aria-label="Питомец нового чата"><Menu.RadioGroup value={choice} onValueChange={value => onChange(normalizeMascotChoice(value))}>
      <Menu.RadioItem value="random" className="workspace-menu-item"><Shuffle size={14} strokeWidth={1} /><span>Случайный</span><Menu.RadioItemIndicator><Check size={14} /></Menu.RadioItemIndicator></Menu.RadioItem>
      {Object.entries(mascotNames).map(([id, name]) => <Menu.RadioItem key={id} value={id} className="workspace-menu-item"><PawPrint size={14} strokeWidth={1} /><span>{name}</span><Menu.RadioItemIndicator><Check size={14} /></Menu.RadioItemIndicator></Menu.RadioItem>)}
    </Menu.RadioGroup></Menu.Popup></Menu.Positioner></Menu.Portal>
  </Menu.Root>;
}
