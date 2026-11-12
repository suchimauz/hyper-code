import { requestJson } from './mauzcode';
import type { NavigationIcon } from './navigation';

export type QuotaWindow = { usedPercent: number; windowMinutes?: number | null; resetsAt?: number | null };
/** Secret-free subscription account row as exposed by the UI Lab bridge. */
export type SavedProxy = {id:string;name:string|null;host:string;port:number};
export type LlmAccount = {
  proxy?: SavedProxy | null;
  provider: string; account: string; label: string; source: string; sshInstance: string | null;
  available: boolean; needsReconnect: boolean; usedPercent: number | null; resetsAt: number | null;
  windows: { primary?: QuotaWindow; secondary?: QuotaWindow; tertiary?: QuotaWindow } | null;
  planType: string | null; parkedAgents: number;
};
/** Bounded phase metadata only; never raw provider output or credentials. */
export type LoginDiagnostics = {
  startedAt: number; endedAt: number | null; exitCode: number | null;
  reason: 'network' | 'tls' | 'permission' | 'http' | 'missing-credentials' | 'cli-exit' | 'timeout' | 'interrupted' | null;
  httpCode: number | null;
  stages: { phase: 'ssh-preflight' | 'cli-login' | 'credential-check' | 'login-status'; startedAt: number; endedAt: number | null; exitCode: number | null }[];
};
/** Safe in-progress login hint: never contains tokens. */
export type LlmLogin = {
  diagnostics?: LoginDiagnostics;
  id: string | null; provider: string; account: string; instance: string | null; status: string;
  verificationUri: string | null; userCode: string | null; needsCode: boolean; callbackSubmitted: boolean; error: string | null;
};
export type LlmConnectionsState = { proxies?:SavedProxy[]; accounts: LlmAccount[]; logins: LlmLogin[]; instances: string[]; csrfToken: string; providerIcons?: Record<string, NavigationIcon | null> };
export type LoginProvider = 'codex' | 'claude-code' | 'kimi-coding' | 'xai';
export type LlmAction =
  | { action: 'login'; provider: LoginProvider; account: string; instance?: string; method?:'cli'|'oauth'; proxyId?:string|null }
  | { action: 'code'; id?: string; provider?: string; account?: string; code: string }
  | { action: 'cancel'; id: string; provider?:string }
  | { action: 'users'; provider: string; account: string }
  | { action: 'remove'; provider: string; account: string; confirmed: true; archiveUsers?: boolean };
export type LlmActionResult = { message?: string; id?: string | null; users?: { id: string; title: string | null; model: string | null }[]; archived?: string[] };

const PATH = '/ui-lab-api/llm-connections';

export async function getLlmConnections(signal?: AbortSignal): Promise<LlmConnectionsState> {
  const data = await requestJson<LlmConnectionsState>(PATH, { signal });
  if (!Array.isArray(data.accounts) || !Array.isArray(data.logins) || typeof data.csrfToken !== 'string') throw new Error('Не удалось загрузить LLM Connections');
  return data;
}

export function runLlmAction(action: LlmAction, csrfToken: string) {
  return requestJson<LlmActionResult>(PATH, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken }, body: JSON.stringify(action) });
}

/** Splits registry slots `ssh.<instance>.<account>` into their parts. */
export function accountSlot(item: Pick<LlmAccount, 'account' | 'sshInstance'>) {
  const remote = /^ssh\.([^.]+)\.(.+)$/.exec(item.account);
  if (remote) return { name: remote[2]!, instance: remote[1]! };
  return { name: item.account === 'default' ? 'main' : item.account, instance: item.sshInstance };
}

export const LOGIN_PROVIDERS: LoginProvider[] = ['codex', 'claude-code', 'kimi-coding', 'xai'];
export const REMOVABLE = new Set(['anthropic-oauth', 'xai', 'claude-code', 'codex', 'kimi-coding']);
