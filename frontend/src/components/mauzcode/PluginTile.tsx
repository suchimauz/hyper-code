import { PhosphorIcon } from './PhosphorIcon';

/** The framed plugin tile used by the Plugins and plugin Pages lists. */
export function PluginTile({ icon }: { icon?: string | null }) {
  return <span className="plugins-tile" aria-hidden="true"><PhosphorIcon icon={icon} size={22} fallbackSize={20} strokeWidth={1.25} /></span>;
}
