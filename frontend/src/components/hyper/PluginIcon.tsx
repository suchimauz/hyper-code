import { useEffect, useState } from 'react';
import { Puzzle } from 'lucide-react';
import { phosphorClass } from '../../lib/plugins';

/** Local icon font only: plugin metadata cannot introduce SVG markup or URLs. */
export function PluginIcon({ icon }: { icon?: string | null }) {
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
  return <span className="plugins-tile" aria-hidden="true">{cls && !failed ? <i className={`ph ${cls}`} /> : <Puzzle size={20} strokeWidth={1.25} />}</span>;
}
