import { requestJson } from './hyper';

export type StatsRange = 'all' | '30d' | '7d';
export type WelcomeModel = { model: string; messages: number; totalTokens: number | null; inputTokens?: number | null; outputTokens?: number | null };
export type WelcomeDay = { date: string; messages: number; sessions: number; totalTokens: number | null; models?: { model: string; totalTokens: number | null }[] };
export type WelcomeStats = {
  refreshing?: boolean;
  range: StatsRange; timezone: string; asOf: string; sessions: number; messages: number;
  totalTokens: number | null; activeDays: number; peakHour: number | null; favoriteModel: string | null;
  models: WelcomeModel[]; daily: WelcomeDay[];
};
export function getWelcomeStats(range: StatsRange, signal?: AbortSignal) {
  return requestJson<WelcomeStats>(`/ui-lab-api/stats?range=${range}&timezone=UTC`, { signal });
}
export function compactCount(value: number | null | undefined): string {
  if (value == null) return '—';
  for (const [divisor, suffix] of [[1e9, 'B'], [1e6, 'M'], [1e3, 'k']] as const) {
    if (value >= divisor) return `${(value / divisor).toFixed(1).replace(/\.0$/, '')}${suffix}`;
  }
  return value.toLocaleString('en-US');
}
/** Calendar cells are UTC, matching the endpoint's day buckets; missing days are zero activity, not zero token coverage. */
export function heatmapDays(stats: WelcomeStats): WelcomeDay[] {
  const end = new Date(`${stats.asOf.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(end.getTime())) return [];
  const lookup = new Map(stats.daily.map(day => [day.date, day]));
  return Array.from({ length: 182 }, (_, index) => {
    const date = new Date(end.getTime() - (181 - index) * 86400000).toISOString().slice(0, 10);
    return lookup.get(date) ?? { date, messages: 0, sessions: 0, totalTokens: null };
  });
}
