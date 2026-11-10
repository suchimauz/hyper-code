import { requestJson } from './mauzcode';

export type CronTask = {
  name: string; fn: string; args: unknown; scheduleType: string; everyMs: number | null; nextRunAt: number | null;
  enabled: boolean; state: string; source: string; sourceFile: string | null;
  lastStatus: string | null; lastStartedAt: number | null; lastFinishedAt: number | null; lastError: string | null;
};
export type CronTasksState = { tasks: CronTask[]; csrfToken: string };
export type CronAction = 'enable' | 'disable' | 'run' | 'remove';
export type CronFilter = 'all' | 'enabled' | 'inactive';

const PATH = '/ui-lab-api/cron-tasks';

export async function getCronTasks(signal?: AbortSignal): Promise<CronTasksState> {
  const data = await requestJson<CronTasksState>(PATH, { signal });
  if (!Array.isArray(data.tasks) || typeof data.csrfToken !== 'string') throw new Error('Не удалось загрузить задачи');
  return data;
}

export type CronRun = { id: string; scheduledAt: number | null; startedAt: number | null; finishedAt: number | null; status: string; result: string | null; error: string | null };

export async function getCronRuns(name: string, signal?: AbortSignal): Promise<CronRun[]> {
  const data = await requestJson<{ runs: CronRun[] }>(`${PATH}?runs=${encodeURIComponent(name)}`, { signal });
  if (!Array.isArray(data.runs)) throw new Error('Не удалось загрузить историю запусков');
  return data.runs;
}

export function runCronAction(name: string, action: CronAction, csrfToken: string) {
  return requestJson<{ ok: boolean }>(PATH, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken }, body: JSON.stringify({ name, action }) });
}

export type NewCronTask = { name: string; fn: string; every: string; args: Record<string, unknown>; now: boolean; once?: boolean };

export function addCronTask(task: NewCronTask, csrfToken: string) {
  return requestJson<{ ok: boolean }>(PATH, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken }, body: JSON.stringify({ action: task.once ? 'defer' : 'add', name:task.name,fn:task.fn,every:task.every,args:task.args,now:task.now }) });
}

/** "5m", "1h 30m", "2d" — the interval grammar cron.add accepts. */
export const validInterval = (text: string) => /^\s*(\d+\s*[dhms]\s*)+$/i.test(text) && /[1-9]/.test(text);

/** "every 5m", "once" — the real schedule, not a guess. */
export function cronSchedule(task: Pick<CronTask, 'scheduleType' | 'everyMs'>) {
  let ms = Number(task.everyMs ?? 0);
  if (task.scheduleType !== 'interval' || !ms) return 'Once';
  const parts: string[] = [];
  for (const [unit, size] of [['d', 86400000], ['h', 3600000], ['m', 60000], ['s', 1000]] as const) {
    const n = Math.floor(ms / size); if (n) { parts.push(`${n}${unit}`); ms -= n * size; }
  }
  return `Every ${parts.join(' ') || '<1s'}`;
}

export function filterCronTasks(tasks: CronTask[], filter: CronFilter, query: string) {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return tasks.filter(task => (filter === 'all' || (filter === 'enabled') === task.enabled)
    && words.every(word => `${task.name} ${task.fn}`.toLocaleLowerCase().includes(word)));
}

/** Relative time: "in 4m", "3h ago". */
export function relativeTime(at: number | null, now = Date.now()) {
  if (at == null || !Number.isFinite(at)) return '—';
  const diff = at - now, abs = Math.abs(diff), min = Math.round(abs / 60000);
  const text = abs < 60000 ? `${Math.max(1, Math.round(abs / 1000))}s` : min < 60 ? `${min}m` : min < 1440 ? `${Math.round(min / 60)}h` : `${Math.round(min / 1440)}d`;
  return diff >= 0 ? `in ${text}` : `${text} ago`;
}
