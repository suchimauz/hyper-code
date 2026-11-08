import type { ReactElement, ReactNode } from 'react';
import { Tooltip as BaseTooltip } from '@base-ui/react/tooltip';
import './floating.css';
/** Shared keyboard/hover tooltip, portaled above clipping containers. */
export function Tooltip({ children, label, delay = 200, side = 'top' }: { children: ReactElement; label: ReactNode; delay?: number; side?: 'top' | 'bottom' }) {
  return <BaseTooltip.Provider delay={delay}><BaseTooltip.Root>
    <BaseTooltip.Trigger render={children} />
    <BaseTooltip.Portal><BaseTooltip.Positioner side={side} sideOffset={8} className="floating-positioner">
      <BaseTooltip.Popup className="ui-tooltip">{label}</BaseTooltip.Popup>
    </BaseTooltip.Positioner></BaseTooltip.Portal>
  </BaseTooltip.Root></BaseTooltip.Provider>;
}
