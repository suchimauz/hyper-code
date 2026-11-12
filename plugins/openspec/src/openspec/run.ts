import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';

/**
 * Runs the bundled OpenSpec CLI so that all spec and change artifacts are stored in the workspace's .mauzcode/openspec.
 *
 * The CLI runs with `<workspace>/.mauzcode` as its working directory, so every OpenSpec artifact (config.yaml, specs/, changes/, archive) lives in `<workspace>/.mauzcode/openspec`
 * and nothing is written to the project root. Use for any OpenSpec step: `init`, `new change <id>`, `list`,
 * `status`, `instructions`, `show`, `validate`, `archive`. Local workspaces only; `store` commands and
 * `--store` are rejected because they would move artifacts elsewhere. `init` without `--tools` gets
 * `--tools none` (no assistant skill files). Output is bounded and ANSI-free.
 */
export default async function (ctx: Context, session: Session | null, opts: {
    /** CLI arguments after `openspec`, e.g. ["new", "change", "add-login"] or ["list", "--json"]. @minItems 1 */
    args: string[];
    /** Workspace directory to use instead of the agent's; absolute local path. */
    dir?: string;
    /** Kill the CLI after this many milliseconds. @default 60000 @minimum 1000 @maximum 300000 */
    timeoutMs?: number;
}): Promise<{ ok: boolean; exitCode: number; root: string; stdout: string; stderr: string; truncated: boolean }> {
    if (!Array.isArray(opts.args) || !opts.args.length || opts.args.some(a => typeof a !== 'string' || a.includes('\0')))
        throw new Error('openspec.run: args must be a non-empty string array');
    if (opts.args[0] === 'store' || opts.args.some(a => a === '--store' || a.startsWith('--store=')))
        throw new Error('openspec.run: stores are not supported; artifacts always live in <workspace>/.mauzcode/openspec');
    if (!opts.dir && String(session?.agent?.workspaceHost ?? '').trim())
        throw new Error('openspec.run: the workspace is on an SSH host; OpenSpec runs only for local workspaces');
    const workspace = opts.dir ?? session?.agent?.workspaceDir ?? '';
    if (!path.isAbsolute(workspace)) throw new Error('openspec.run: an absolute workspace directory is required');
    if (!(await stat(workspace).catch(() => null))?.isDirectory()) throw new Error('openspec.run: workspace directory not found: ' + workspace);
    const cwd = path.join(workspace, '.mauzcode');
    await mkdir(cwd, { recursive: true });
    const args = [...opts.args];
    if (args[0] === 'init' && !args.some(a => a === '--tools' || a.startsWith('--tools='))) args.push('--tools', 'none');
    const cli = path.join(import.meta.dir, '../../node_modules/@fission-ai/openspec/bin/openspec.js');
    if (!(await Bun.file(cli).exists())) throw new Error('openspec.run: CLI missing; run `bun install` in plugins/openspec');
    const timeout = Math.min(300000, Math.max(1000, opts.timeoutMs ?? 60000));
    const proc = Bun.spawn([process.execPath, cli, ...args], {
        cwd, stdin: 'ignore', stdout: 'pipe', stderr: 'pipe',
        env: { ...process.env, OPENSPEC_NO_UPDATE_CHECK: '1', NO_COLOR: '1', FORCE_COLOR: '0', CI: '1' },
    });
    const timer = setTimeout(() => proc.kill(), timeout);
    const [out, err, exitCode] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]).finally(() => clearTimeout(timer));
    const LIMIT = 64 * 1024;
    const clean = (s: string) => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');
    const stdout = clean(out), stderr = clean(err);
    return {
        ok: exitCode === 0, exitCode, root: path.join(cwd, 'openspec'),
        stdout: stdout.slice(0, LIMIT), stderr: stderr.slice(0, LIMIT),
        truncated: stdout.length > LIMIT || stderr.length > LIMIT,
    };
}
