import { useEffect, useState } from 'react';
import { phosphorClass } from '../../lib/plugins';

/** Load the local Phosphor icon font once per document (no SVG markup or URLs from plugin metadata).
 * Returns the validated icon class, or null when the class is invalid or the font failed to load. */
export function usePhosphorFont(icon: string | null | undefined): string | null {
  const cls = phosphorClass(icon ?? null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!cls) return;
    let link = document.querySelector<HTMLLinkElement>('link[data-phosphor]');
    const created = !link;
    if (!link) {
      link = document.createElement('link');
      link.rel = 'stylesheet'; link.href = '/ui/vendor/phosphor.css'; link.dataset.phosphor = '';
    }
    const onError = () => { link.dataset.phosphorFailed = 'true'; setFailed(true); };
    const onLoad = () => { delete link.dataset.phosphorFailed; setFailed(false); };
    setFailed(link.dataset.phosphorFailed === 'true');
    link.addEventListener('error', onError);
    link.addEventListener('load', onLoad);
    if (created) document.head.append(link);
    return () => { link.removeEventListener('error', onError); link.removeEventListener('load', onLoad); };
  }, [cls]);
  return cls && !failed ? cls : null;
}
