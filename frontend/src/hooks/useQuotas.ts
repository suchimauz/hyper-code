import { useEffect, useMemo, useState } from 'react';
import { getProviderIcons, getQuotas, type QuotaAccount } from '../lib/quotas';
import type { NavigationIcon } from '../lib/navigation';

/** Polls GET /api/v1/quotas every 60 s while the tab is visible; errors keep the last good snapshot. */
export function useQuotas(intervalMs = 60000) {
  const [accounts, setAccounts] = useState<QuotaAccount[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [icons, setIcons] = useState<Record<string, NavigationIcon | null>>({});
  // Provider marks change only with the catalogue: load once, cards fall back to a generic glyph meanwhile.
  useEffect(() => {
    const controller = new AbortController();
    getProviderIcons(controller.signal).then(data => setIcons(data.icons ?? {}), () => {});
    return () => controller.abort();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let busy = false;
    const schedule = () => { clearTimeout(timer); if (!document.hidden && !controller.signal.aborted) timer = setTimeout(() => { void read(); }, intervalMs); };
    async function read() {
      if (busy || controller.signal.aborted) return;
      busy = true;
      try { const data = await getQuotas(controller.signal); setAccounts(Array.isArray(data.accounts) ? data.accounts : []); setError(null); }
      catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : String(e)); }
      finally { busy = false; schedule(); }
    }
    const onVisibility = () => { if (document.hidden) clearTimeout(timer); else void read(); };
    document.addEventListener('visibilitychange', onVisibility);
    void read();
    return () => { controller.abort(); clearTimeout(timer); document.removeEventListener('visibilitychange', onVisibility); };
  }, [intervalMs]);
  const withIcons = useMemo(() => accounts && accounts.map(a => a.icon !== undefined || !icons[a.provider] ? a : { ...a, icon: icons[a.provider] }), [accounts, icons]);
  return { accounts: withIcons, error };
}
