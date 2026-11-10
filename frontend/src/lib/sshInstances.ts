import { requestJson } from './mauzcode';

/** Secret-free SSH instance descriptor as exposed by the UI Lab bridge. */
export type SshInstance = { name: string; host: string; user: string; port: number; publicKey: string; pinnedHostKey: string | null; updatedAt: number };
export type SshProbe = { python3: boolean; codex: boolean; claude: boolean };
export type SshInstancesState = { instances: SshInstance[]; csrfToken: string };
export type SshEndpoint = { name: string; host: string; user: string; port: number };
export type SshAction =
  | ({ action: 'create' } & SshEndpoint)
  | ({ action: 'save' } & SshEndpoint)
  | { action: 'trust'; name: string; hostKey: string; confirmed: true; replace?: boolean }
  | { action: 'probe'; name: string }
  | { action: 'remove'; name: string; confirmed: true };
export type SshActionResult = { message: string; instance?: SshInstance; probe?: SshProbe; removed?: string };

const PATH = '/ui-lab-api/ssh-instances';

export async function getSshInstances(signal?: AbortSignal): Promise<SshInstancesState> {
  const data = await requestJson<SshInstancesState>(PATH, { signal });
  if (!Array.isArray(data.instances) || typeof data.csrfToken !== 'string') throw new Error('Не удалось загрузить SSH Instances');
  return data;
}

export function runSshAction(action: SshAction, csrfToken: string) {
  return requestJson<SshActionResult>(PATH, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken }, body: JSON.stringify(action) });
}

/** OpenSSH target with IPv6 literals bracketed. */
export function sshTarget(item: Pick<SshInstance, 'host' | 'user' | 'port'>) {
  return `${item.user}@${item.host.includes(':') ? `[${item.host}]` : item.host}:${item.port}`;
}
