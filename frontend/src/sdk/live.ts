import { useEffect, useRef } from 'react';
import { loadLiveClient, type LiveEvent } from '../lib/live';
export type { LiveEvent, LiveStatus } from '../lib/live';
export type LiveSubscriptionOptions = {
  name: string;
  types?: string[];
  onEvent: (event: LiveEvent) => void;
  /** Required: refetch authoritative data after reconnect/resume or transport recovery. */
  resync: (reason: string) => void;
  onError: (error: unknown) => void;
};
/** Reuses the host transport. Returns cleanup immediately, including while the script is loading. */
export function subscribeLive(options: LiveSubscriptionOptions): () => void {
  if (typeof options.resync !== 'function') throw new TypeError('Live subscriptions require resync');
  let disposed = false;
  let unsubscribe: (() => void) | undefined;
  void loadLiveClient().then(() => {
    if (disposed) return;
    if (!window.mauzcodeLive) throw new Error('Live transport unavailable');
    const cleanup = window.mauzcodeLive.subscribe({ name: options.name, types: options.types,
      onEvent: event => { if (!disposed) options.onEvent(event); },
      resync: reason => { if (!disposed) options.resync(reason); },
    });
    // A synchronous transport callback can itself cause disposal.
    if (disposed) cleanup(); else unsubscribe = cleanup;
  }).catch(error => { if (!disposed) options.onError(error); });
  return () => { if (disposed) return; disposed = true; unsubscribe?.(); unsubscribe = undefined; };
}
/** Keep current callbacks without reconnecting on every render; changing name/types resubscribes. */
export function useLiveSubscription(options: LiveSubscriptionOptions): void {
  const callbacks = useRef(options);
  useEffect(() => { callbacks.current = options; });
  const typesKey = JSON.stringify(options.types ?? []);
  useEffect(() => subscribeLive({ name: options.name, types: JSON.parse(typesKey) as string[],
    onEvent: event => callbacks.current.onEvent(event),
    resync: reason => callbacks.current.resync(reason),
    onError: error => callbacks.current.onError(error),
  }), [options.name, typesKey]);
}
