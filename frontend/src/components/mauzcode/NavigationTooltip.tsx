import { useRef, type ReactElement, type ReactNode } from 'react';
import { Tooltip } from '@base-ui/react/tooltip';
import './navigation-tooltip.css';

/** Read-only row preview; does not intercept selection, disclosure or action clicks. */
/** `hoverablePopup={false}` closes the tooltip as soon as the pointer leaves the trigger, even when it moves onto the popup. */
export function NavigationTooltip({ trigger, children, delay = 500, closeDelay = 120, hoverablePopup = true }: { trigger: ReactElement; children: ReactNode; delay?: number; closeDelay?: number; hoverablePopup?: boolean }) {
  const ref = useRef<HTMLButtonElement>(null);
  return <Tooltip.Root disableHoverablePopup={!hoverablePopup}><Tooltip.Trigger render={trigger} ref={ref} delay={delay} closeDelay={closeDelay} />
    <Tooltip.Portal><Tooltip.Positioner anchor={() => ref.current?.parentElement ?? ref.current} side="right" align="start" sideOffset={8} collisionPadding={8} className="navigation-tooltip-positioner">
      <Tooltip.Popup role="tooltip" className="navigation-tooltip">{children}</Tooltip.Popup>
    </Tooltip.Positioner></Tooltip.Portal>
  </Tooltip.Root>;
}
export function workspaceTooltipPath(dir: string, host: string | null) {
  const path = dir.replace(/^\/(?:home|Users)\/[^/]+(?=\/|$)/, '~');
  return host ? `${host}:${path}` : path;
}
export function workspaceCreatedLabel(timestamp?: number | null) {
  if (timestamp == null || !Number.isFinite(timestamp)) return null;
  const d = new Date(timestamp);
  if (!Number.isFinite(d.getTime())) return null;
  return `Created ${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
