/**
 * Starts the dedicated Raylane headless Chrome user service and verifies its loopback CDP endpoint
 *
 * Instance-local replacement for the graphical Chrome launcher. Use through chrome.ensure or browser/CDP automatic recovery. Starts the already approved raylane-chrome.service without killing sessions, changing profiles, disabling the sandbox or opening network listeners. Refuses unexpected endpoints and fails with bounded diagnostics if the user service is unavailable.
 * @param opts.wait Maximum seconds to wait for service startup and a healthy Chrome DevTools endpoint. @default 8 @minimum 1 @maximum 60
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Maximum seconds to wait for service startup and a healthy Chrome DevTools endpoint. @default 8 @minimum 1 @maximum 60 */
        wait?: number;
    },
): Promise<{ browserUrl: string; userDataDir: string; profile: string; tmuxSession: string }> {
    const wait = opts.wait ?? 8;
    if (!Number.isFinite(wait) || wait < 1 || wait > 60) throw new Error('wait must be between 1 and 60 seconds');
    const browserUrl = ctx.fns.procs.env.cdpUrl({});
    if (browserUrl !== 'http://127.0.0.1:9222') throw new Error('Raylane headless launcher only supports http://127.0.0.1:9222; refuse to redirect another browser');
    const deadline = Date.now() + wait * 1000;
    const proc = Bun.spawn(['timeout', String(wait) + 's', 'systemctl', '--user', 'start', 'raylane-chrome.service'], { stdout: 'pipe', stderr: 'pipe' });
    const [exitCode, stderr] = await Promise.all([proc.exited, new Response(proc.stderr).text()]);
    if (exitCode !== 0) throw new Error('raylane-chrome.service start failed (' + exitCode + '): ' + stderr.slice(0,1600));
    let lastError = 'endpoint not ready';
    while (Date.now() < deadline) {
      try {
        const response = await fetch(browserUrl + '/json/version', {signal: AbortSignal.timeout(Math.max(1, Math.min(1000, deadline - Date.now())))});
        if (response.ok) {
          const info = await response.json() as { Browser?: string; webSocketDebuggerUrl?: string };
          if (info.Browser?.startsWith('Chrome/') && info.webSocketDebuggerUrl?.startsWith('ws://127.0.0.1:9222/')) return { browserUrl, userDataDir: '/home/suchimauz/.local/state/raylane-browser/profile', profile: 'Default', tmuxSession: '' };
          lastError = 'unexpected CDP identity';
        } else lastError = 'HTTP ' + response.status;
      } catch (error) { lastError = String(error); }
      if (Date.now() < deadline) await Bun.sleep(Math.min(200, deadline - Date.now()));
    }
    throw new Error('Headless Chrome did not become ready within ' + wait + 's: ' + lastError);
}
