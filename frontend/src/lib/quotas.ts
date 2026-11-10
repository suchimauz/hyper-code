import { requestJson } from './mauzcode';
import type { NavigationIcon } from './navigation';

export type QuotaTone = 'neutral' | 'warning' | 'critical' | 'error';
/** One measured quota period; null percent means the provider did not report it. */
export type QuotaWindow = { usedPercent: number | null; resetsAt: number | null; tone: QuotaTone };
export type QuotaPeriod = 'fiveHour' | 'weekly' | 'monthly';
/** Unified provider quota row from GET /api/v1/quotas. Providers without usage report kind "status". */
export type QuotaAccount = {
  id: string; provider: string; account: string; label: string; model: string;
  connection: 'local' | 'mauzcode' | 'ssh'; host?: string;
  kind: 'quota' | 'status';
  windows?: Partial<Record<QuotaPeriod, QuotaWindow>>;
  status?: 'available' | 'unavailable' | 'disabled' | 'unknown';
  quotaStatus?: 'fresh' | 'stale' | 'unavailable';
  /** Epoch ms of the last successful quota fetch; shown instead of "Fresh data" when stale. */
  quotaUpdatedAt?: number | null;
  tone: QuotaTone; planType?: string | null; needsReconnect?: boolean; parkedAgents: number;
  icon?: NavigationIcon | null;
};
export type QuotasResponse = { updatedAt: number; accounts: QuotaAccount[] };

export const QUOTA_PERIODS: { key: QuotaPeriod; label: string; title: string }[] = [
  { key: 'fiveHour', label: '5ч', title: '5 часов' },
  { key: 'weekly', label: 'Нед.', title: 'Неделя' },
  { key: 'monthly', label: 'Мес.', title: 'Месяц' },
];

export function getQuotas(signal?: AbortSignal) { return requestJson<QuotasResponse>('/api/v1/quotas', { signal }); }
/** Inert native provider marks keyed by provider id, served by the UI bridge. */
export function getProviderIcons(signal?: AbortSignal) { return requestJson<{ icons: Record<string, NavigationIcon | null> }>('/ui-lab-api/provider-icons', { signal }); }

const TONE_RANK: Record<QuotaTone, number> = { neutral: 0, warning: 1, critical: 2, error: 3 };
/** Worst backend tone across accounts; the frontend never recomputes thresholds. */
export function worstQuotaTone(accounts: QuotaAccount[]): QuotaTone {
  return accounts.reduce<QuotaTone>((worst, a) => TONE_RANK[a.tone] > TONE_RANK[worst] ? a.tone : worst, 'neutral');
}

/** Short account caption: drops provider and host noise from backend labels. */
export function quotaAccountCaption(a: QuotaAccount): string {
  if (a.account && a.account !== 'default') return a.account;
  const head = a.label.split('·')[0]?.trim();
  return head || a.provider;
}

export function quotaStatusSymbol(status: QuotaAccount['status']): string {
  return status === 'available' ? '✓' : status === 'unavailable' ? '!' : status === 'disabled' ? '−' : '?';
}

/** Multiline tooltip: periods with local reset time, plan and parked agents. */
export function quotaTooltip(a: QuotaAccount, locale?: string): string {
  const lines = [a.label];
  if (a.kind === 'status') lines.push(`Статус: ${a.status ?? 'unknown'}`);
  else for (const p of QUOTA_PERIODS) {
    const w = a.windows?.[p.key];
    if (!w) continue;
    const pct = w.usedPercent == null ? 'нет данных' : `${Math.round(w.usedPercent)}%`;
    const reset = w.resetsAt ? `, сброс ${new Date(w.resetsAt).toLocaleString(locale, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : '';
    lines.push(`${p.title}: ${pct}${reset}`);
  }
  if (a.kind === 'quota' && !QUOTA_PERIODS.some(p => a.windows?.[p.key])) lines.push('Квота не измерена');
  if (a.quotaStatus === 'stale') lines.push('Данные устарели');
  if (a.needsReconnect) lines.push('Нужно переподключить');
  if (a.planType) lines.push(`План: ${a.planType}`);
  if (a.parkedAgents) lines.push(`Ждут агенты: ${a.parkedAgents}`);
  return lines.join('\n');
}
