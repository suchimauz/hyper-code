/** Native card for an immutable plan. Generic input.submit deliberately cannot authorize it. */
export default {
    icon: 'list-checks', cancel: false,
    prepare() { throw new Error('Use planning.propose({plan}) to create an exact plan review'); },
    open(ctx: Context, opts: {input: types.input.Row}) {
        const esc=(text: string)=>ctx.fns.procs.ui.escape({text});
        return `<pre class="whitespace-pre-wrap break-words text-sm">${esc(String(opts.input.spec.plan ?? ''))}</pre><input type="hidden" name="proposalId" value="${esc(String(opts.input.spec.proposalId))}"><input type="hidden" name="expectedRevision" value="${Number(opts.input.spec.revision)}">`;
    },
    buttons(ctx: Context) {
        return ctx.fns.procs.ui.button({action:'planning-keep',label:'Keep planning',type:'submit',tone:'ghost',size:'sm',name:'decision',value:'keep'})
            +ctx.fns.procs.ui.button({action:'planning-approve',label:'Approve and implement',type:'submit',tone:'primary',size:'sm',name:'decision',value:'approve'});
    },
    submit() { throw new Error('Plan approval requires the human review HTTP endpoint'); },
    done(_ctx: Context, opts: {input: types.input.Row}) {
        return opts.input.result?.decision==='approve'?'<p>Approved — implementation requested.</p>':'<p>Keep planning — no implementation requested.</p>';
    },
} satisfies types.input.Kind;
