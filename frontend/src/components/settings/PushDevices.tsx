import { useState } from 'react';
import { Check, Laptop, type LucideIcon, Monitor, MonitorSmartphone, Smartphone, Tablet, Trash2, X } from 'lucide-react';
import { Button } from '../ui/Button';

/** One active push subscription owned by the signed-in user; endpoint hash only, never a raw endpoint. */
export type PushDevice = { id: string; endpointHash: string; createdAt: number; expiresAt: number; provider: 'apple' | 'google' | 'mozilla' | 'other'; userAgent: string | null; current: boolean };

const PROVIDER_LABEL: Record<PushDevice['provider'], string> = { apple: 'Apple push', google: 'Google push (FCM)', mozilla: 'Mozilla push', other: 'Push service' };
const shortHash = (hash: string) => '••' + hash.slice(-8);
const dateLabel = (ms: number) => new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

/** Coarse platform label parsed from the user agent captured at opt-in; never treated as identity. */
export const deviceLabel = (ua: string | null): string | null => {
  if (!ua) return null;
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /CrOS/.test(ua) ? 'ChromeOS' : /Macintosh|Mac OS X/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : null;
  const browser = /CriOS\//.test(ua) ? 'Chrome' : /FxiOS\//.test(ua) ? 'Firefox' : /EdgiOS\//.test(ua) ? 'Edge' : /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /SamsungBrowser\//.test(ua) ? 'Samsung Internet' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : null;
  return os || browser ? [os, browser].filter(Boolean).join(' · ') : null;
};

/** Device-kind icon for the user agent captured at opt-in; generic device icon when the family is unknown. */
export const deviceIcon = (ua: string | null): LucideIcon => {
  if (!ua) return MonitorSmartphone;
  if (/iPhone|Android/.test(ua)) return Smartphone;
  if (/iPad/.test(ua)) return Tablet;
  if (/Macintosh|Mac OS X|CrOS/.test(ua)) return Laptop;
  if (/Windows|Linux/.test(ua)) return Monitor;
  return MonitorSmartphone;
};

/**
 * Read-only device list with per-device removal. Rows prefer the device name parsed from the
 * opt-in user agent, fall back to the push provider, and show the connected date plus a hash
 * tail that identifies the endpoint without exposing it. `currentHash` is the sha-256 of this
 * browser's own subscription endpoint — that row gets a This-device badge and no Remove button
 * (it is disabled through the dedicated flow); every other row offers owner-scoped removal
 * through `onRemove` after an inline confirmation.
 */
export function PushDevices({ devices, currentHash, onRemove, busy }: { devices: PushDevice[] | null; currentHash: string | null; onRemove?: (id: string) => void; busy?: boolean }) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  if (devices === null) return null;
  if (devices.length === 0) return <p className="settings-footnote">No devices receive notifications yet.</p>;
  return <ul className="push-devices" aria-label="Connected devices">
    {devices.map(device => {
      const isThisDevice = currentHash !== null && device.endpointHash === currentHash;
      const Icon = deviceIcon(device.userAgent);
      return <li key={device.id} className="push-device">
        <span className="push-device-icon" aria-hidden="true"><Icon size={18} strokeWidth={1.5} /></span>
        <span className="push-device-body">
          <span className="push-device-name">{deviceLabel(device.userAgent) ?? PROVIDER_LABEL[device.provider]}{isThisDevice && <span className="push-device-badge">This device</span>}</span>
          <span className="push-device-meta">
            <span>Connected {dateLabel(device.createdAt)}</span>
            <code>{shortHash(device.endpointHash)}</code>
          </span>
        </span>
        {!isThisDevice && onRemove && <span className="push-device-actions">
          {confirmId === device.id
            ? <><Button variant="ghost" size="compact" className="push-device-remove" aria-label="Confirm remove" title="Confirm remove" disabled={busy} onClick={() => { setConfirmId(null); onRemove(device.id); }}><Check size={16} strokeWidth={2} aria-hidden="true" /></Button><Button variant="ghost" size="compact" aria-label="Cancel" title="Cancel" disabled={busy} onClick={() => setConfirmId(null)}><X size={16} strokeWidth={2} aria-hidden="true" /></Button></>
            : <Button variant="ghost" size="compact" className="push-device-remove" aria-label="Remove" title="Remove" disabled={busy} onClick={() => setConfirmId(device.id)}><Trash2 size={16} strokeWidth={1.75} aria-hidden="true" /></Button>}
        </span>}
      </li>;
    })}
  </ul>;
}
