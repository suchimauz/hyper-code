export type LiveStatus = 'connecting' | 'connected' | 'disconnected';
export type LiveEvent = { type?: string; topic?: string; agentId?: string };
declare global {
  interface Window {
    mauzcodeLive?: {
      subscribe: (options: { name: string; types?: string[]; onEvent: (event: LiveEvent) => void; resync: (reason: string) => void }) => () => void;
      refreshTopics?: () => void;
      getStatus?: () => LiveStatus;
      onStatus?: (listener: (status: LiveStatus) => void) => () => void;
    };
  }
}
let loading: Promise<void> | undefined;
/** Reuse MauzCode's transport and reconnect/resume recovery; never open a second SSE implementation. */
export function loadLiveClient(): Promise<void> {
  if (window.mauzcodeLive) return Promise.resolve();
  if (loading) return loading;
  loading = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '/procs/events/client.js'; script.async = true;
    script.onload = () => window.mauzcodeLive ? resolve() : reject(new Error('Live transport unavailable'));
    script.onerror = () => { script.remove(); reject(new Error('Не удалось подключить живые обновления')); };
    document.head.append(script);
  }).catch(error => { loading = undefined; throw error; });
  return loading;
}
