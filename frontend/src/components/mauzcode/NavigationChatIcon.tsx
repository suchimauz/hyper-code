import { Cpu } from 'lucide-react';
import type { NavigationIcon } from '../../lib/navigation';
/** SVG is an inert image, never document markup. Provider marks inherit theme ink. */
export function NavigationChatIcon({ icon, active = false }: { icon?: NavigationIcon | null; active?: boolean }) {
  const src = icon?.src.startsWith('data:image/svg+xml,') ? icon.src : null;
  return <span className={`navigation-chat-icon ${active ? 'is-running' : ''}`} aria-hidden="true">
    {src ? icon?.custom ? <img src={src} alt="" draggable={false} /> : <span className="navigation-provider-icon" style={{ maskImage: `url("${src}")`, WebkitMaskImage: `url("${src}")` }} /> : <Cpu size={14} strokeWidth={1} />}
  </span>;
}
