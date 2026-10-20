/** Render owner-only SSH instance setup with shared form controls; provider accounts belong to LLM Connections. */
export default async function (ctx: Context, session: Session | null, opts: { req: Request; params: Record<string, string> }) {
    if (session?.user?.role !== 'owner') return new Response('Only owners can manage SSH instances', { status: 403 });
    const ui = ctx.fns.procs.ui;
    const esc = Bun.escapeHTML;
    const query = new URL(opts.req.url).searchParams;
    const items = await ctx.fns.sshInstance.list({});
    const hidden = (name: string, value: string) => `<input type="hidden" name="${esc(name)}" value="${esc(value)}">`;
    const label = (text: string, control: string, hint = '') => `<label class="block min-w-0 space-y-1.5"><span class="text-xs font-medium text-base-content">${esc(text)}</span>${control}${hint ? `<span class="block text-2xs leading-relaxed text-subtle">${esc(hint)}</span>` : ''}</label>`;
    const createForm = `<form action="/sshInstance" method="post" class="space-y-5">
      ${hidden('action', 'create')}
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        ${label('Name', ui.field({ name: 'name', placeholder: 'work-server', maxlength: 64, pattern: '[A-Za-z0-9][A-Za-z0-9_.-]*', ariaLabel: 'Instance name', class: 'w-full' }), 'A short name to recognize this server in LLM Connections.')}
        ${label('Host', ui.field({ name: 'host', placeholder: 'server.example.com', ariaLabel: 'SSH host', class: 'w-full' }))}
        ${label('User', ui.field({ name: 'user', placeholder: 'runner', maxlength: 64, ariaLabel: 'SSH user', class: 'w-full' }))}
        ${label('Port', ui.field({ name: 'port', type: 'number', value: '22', min: 1, max: 65535, step: 1, ariaLabel: 'SSH port', class: 'w-full' }))}
      </div>
      <div class="flex flex-wrap items-center justify-between gap-3 border-t border-base-300 pt-4">
        <p class="max-w-md text-xs leading-relaxed text-subtle">A dedicated SSH key is created locally. Adding a server does not connect to it.</p>
        ${ui.button({ action: 'create-ssh-instance', label: 'Add instance', type: 'submit', tone: 'primary' })}
      </div>
    </form>`;
    const add = items.length
        ? `<details class="rounded-xl border border-base-300 bg-base-100"><summary class="cursor-pointer px-5 py-4 text-sm font-medium text-base-content">Add SSH instance</summary><div class="px-5 pb-5">${createForm}</div></details>`
        : ui.card({ title: 'Add SSH instance', body: createForm, class: 'rounded-xl' });
    const cards = items.map(item => {
        const trusted = !!item.pinnedHostKey;
        const target = item.host.includes(':') ? `[${item.host}]` : item.host;
        const badge = `<span class="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-2xs font-medium ${trusted ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}"><span class="size-1.5 rounded-full bg-current" aria-hidden="true"></span>${trusted ? 'Host verified' : 'Setup required'}</span>`;
        const probe = `<form action="/sshInstance" method="post">${hidden('name', item.name)}${hidden('action', 'probe')}${ui.button({ action: 'probe-ssh-instance', label: 'Test connection', type: 'submit', disabled: !trusted, title: trusted ? 'Check SSH, Python 3 and installed CLIs' : 'Verify the host key before connecting' })}</form>`;
        const key = `<div class="space-y-2"><p class="text-xs leading-relaxed text-subtle">Add this public key to <code>~/.ssh/authorized_keys</code> for the remote user. The private key stays in Hyper.</p><pre tabindex="0" aria-label="SSH public key" class="overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-base-200 p-3 font-mono text-2xs leading-relaxed text-base-content select-all">${esc(item.publicKey)}</pre></div>`;
        const trustForm = (replace: boolean) => `<form action="/sshInstance" method="post" class="space-y-4">${hidden('name', item.name)}${hidden('action', 'trust')}${replace ? hidden('replace', 'yes') : ''}
          ${label(replace ? 'New host public key' : 'Host public key', ui.textarea({ name: 'hostKey', placeholder: 'ssh-ed25519 AAAA…', rows: 3, required: true, ariaLabel: 'Verified host public key', class: 'w-full font-mono text-xs' }), 'Use the server’s /etc/ssh/ssh_host_ed25519_key.pub from a trusted console — not Hyper’s client public key. A key scan alone is not verification.')}
          ${ui.checkboxGroup({ name: 'confirmed', options: [{ value: 'yes', label: replace ? 'I independently verified the new host key and confirm replacement. Provider accounts will need reconnection.' : 'I independently verified this host key.' }] })}
          <div class="flex justify-end">${ui.button({ action: replace ? 'replace-ssh-host-key' : 'trust-ssh-instance', label: replace ? 'Replace host key' : 'Verify host', type: 'submit', tone: 'primary' })}</div>
        </form>`;
        const trust = trusted
            ? `<p class="text-xs text-subtle">Pinned host key</p><pre tabindex="0" aria-label="Pinned host key" class="overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-base-200 p-3 font-mono text-2xs leading-relaxed text-subtle select-all">${esc(item.pinnedHostKey!)}</pre><details><summary class="cursor-pointer text-xs font-medium">Replace host key</summary><div class="mt-4">${trustForm(true)}</div></details>`
            : trustForm(false);
        const setup = trusted
            ? `<details class="border-t border-base-300 pt-4"><summary class="cursor-pointer text-xs font-medium text-subtle">SSH keys &amp; security</summary><div class="mt-4 space-y-4">${key}${trust}</div></details>`
            : `<div class="space-y-5 border-t border-base-300 pt-5"><div class="space-y-2"><h3 class="text-xs font-semibold text-base-content">1. Authorize Hyper on the server</h3>${key}</div><div class="space-y-3"><h3 class="text-xs font-semibold text-base-content">2. Verify the server identity</h3>${trust}</div></div>`;
        const edit = `<details class="border-t border-base-300 pt-4"><summary class="cursor-pointer text-xs font-medium text-base-content">Edit connection</summary><form action="/sshInstance" method="post" class="mt-4 space-y-4">${hidden('name', item.name)}${hidden('action', 'save')}
          <p class="text-xs leading-relaxed text-subtle">The instance name stays unchanged. Changing host, user or port clears host verification and requires reconnecting provider accounts. Hyper’s public key stays the same.</p>
          <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
            ${label('Host', ui.field({ name: 'host', value: item.host, ariaLabel: 'SSH host', class: 'w-full' }))}
            ${label('User', ui.field({ name: 'user', value: item.user, maxlength: 64, ariaLabel: 'SSH user', class: 'w-full' }))}
            ${label('Port', ui.field({ name: 'port', type: 'number', value: String(item.port), min: 1, max: 65535, step: 1, ariaLabel: 'SSH port', class: 'w-full' }))}
          </div><div class="flex justify-end">${ui.button({ action: 'save-ssh-instance', label: 'Save changes', type: 'submit', tone: 'primary' })}</div>
        </form></details>`;
        const remove = `<details class="border-t border-base-300 pt-4"><summary class="cursor-pointer text-xs font-medium text-error">Remove instance</summary><form action="/sshInstance" method="post" class="mt-4 space-y-4">${hidden('name', item.name)}${hidden('action', 'remove')}
          <p class="text-xs leading-relaxed text-subtle">Removes this connection and its provider-account records from Hyper. Remote credentials and authorized_keys are not changed. Existing requests may finish; this does not revoke server access.</p>
          ${ui.checkboxGroup({ name: 'confirmed', options: [{ value: 'yes', label: `Remove ${item.name} and its account records from Hyper.` }] })}
          <div class="flex justify-end">${ui.button({ action: 'remove-ssh-instance', label: 'Remove instance', type: 'submit', tone: 'danger' })}</div>
        </form></details>`;
        return `<section data-ssh-instance="${esc(item.name)}">${ui.card({ class: 'rounded-xl', body: `<div class="space-y-5"><div class="flex flex-wrap items-start justify-between gap-3"><div class="min-w-0 space-y-1.5"><div class="flex flex-wrap items-center gap-2"><h2 class="text-sm font-semibold text-base-content">${esc(item.name)}</h2>${badge}</div><p class="break-all font-mono text-xs text-subtle">${esc(item.user)}@${esc(target)}:${item.port}</p></div>${probe}</div>${setup}${edit}${remove}</div>` })}</section>`;
    }).join('');
    const message = query.get('message');
    const feedback = message ? `<div role="status" aria-live="polite" class="rounded-xl border ${query.get('result') === 'error' ? 'border-error/30 bg-error/10 text-error' : 'border-base-300 bg-base-100 text-base-content'} px-4 py-3 text-xs leading-relaxed">${esc(message)}</div>` : '';
    return { title: 'SSH Instances', main: `<div data-page="ssh-instances" class="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
      <header class="space-y-2"><h1 class="text-xl font-semibold tracking-tight text-base-content">SSH Instances</h1><p class="max-w-2xl text-sm leading-relaxed text-subtle">Connect a server to run subscription requests remotely. Manage provider accounts in <a href="/llms" class="text-primary underline underline-offset-4">LLM Connections</a>.</p></header>
      ${feedback}${items.length ? `<div class="space-y-4">${cards}</div>` : ''}${add}
      <p class="text-2xs leading-relaxed text-faint">The remote server needs Python 3 and Codex or Claude CLI. Use Edit connection to change its address, or SSH keys &amp; security to replace a verified host key.</p>
    </div>` };
}
