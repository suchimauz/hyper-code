import { useEffect, useState } from 'react';
import type { LiveStatus } from '@mauzcode/ui';

export type LiveIndicator = 'live' | 'connecting' | 'stopped';
/** Host transport status: onStatus reports changes only and the script may load after mount, so re-read periodically. */
export function useTransportStatus(): [LiveStatus, (s: LiveStatus) => void] {
  const [transport, setTransport] = useState<LiveStatus>(() => (typeof window !== 'undefined' && window.mauzcodeLive?.getStatus?.()) || 'connecting');
  useEffect(() => {
    let off: (() => void) | undefined;
    const sync = () => {
      const client = window.mauzcodeLive;
      if (!client) return;
      const current = client.getStatus?.();
      if (current) setTransport(current);
      if (!off) off = client.onStatus?.(setTransport) ?? (() => {});
    };
    sync();
    const timer = setInterval(sync, 3000);
    return () => { clearInterval(timer); off?.(); };
  }, []);
  return [transport, setTransport];
}
export const indicatorOf = (transport: LiveStatus, subscriptionError: boolean, watcher: string | undefined): LiveIndicator =>
  subscriptionError || transport === 'disconnected' || watcher === 'error' ? 'stopped' : transport === 'connected' && watcher ? 'live' : 'connecting';
