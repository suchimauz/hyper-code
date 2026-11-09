/**
 * Build and serve a fixed public sign-in asset
 *
 * Serve only the auth-entry React bundle and its stylesheet. No request path reaches the filesystem and no Vite source, shell APIs, credentials or arbitrary imports are exposed.
 * @param opts.kind Fixed public asset type; no arbitrary file names are accepted.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Fixed public asset type; no arbitrary file names are accepted. */
        kind: "js" | "css";
    },
): Promise<Response> {
    const root = ctx.fns.procs.project.projectRoot({});
    type Assets = { js: string; css: string };
    type Cache = { key: string; promise: Promise<Assets | null> };
    const state = ctx.state as typeof ctx.state & { authReactAssets?: Cache };
    // Share JS/CSS and concurrent requests. Source timestamps invalidate on local edits;
    // a failed build is cached too, so anonymous traffic cannot trigger a build storm.
    const paths = ['auth-entry.tsx', 'AuthPage.tsx', 'styles/auth.css'];
    const stamps = await Promise.all(paths.map(path => Bun.file(root + '/frontend/src/' + path).stat().then(stat => stat.mtimeMs)));
    const key = root + ':' + stamps.join(':');
    if (state.authReactAssets?.key !== key) {
        const promise = (async (): Promise<Assets | null> => {
            const result = await Bun.build({entrypoints:[root + '/frontend/src/auth-entry.tsx'], target:'browser', format:'esm', minify:true, define:{'process.env.NODE_ENV':JSON.stringify('production')}});
            if (!result.success) return null;
            const js = result.outputs.find(item => item.path.endsWith('.js'));
            const css = result.outputs.find(item => item.path.endsWith('.css'));
            if (!js || !css) return null;
            return { js: await js.text(), css: await css.text() };
        })().catch(error => { console.error('Auth asset build failed', error); return null; });
        state.authReactAssets = { key, promise };
    }
    const assets = await state.authReactAssets.promise;
    if (!assets) return new Response('Sign-in assets unavailable', {status:503,headers:{'cache-control':'no-store'}});
    return new Response(assets[opts.kind], {headers:{'content-type':opts.kind==='js'?'text/javascript; charset=utf-8':'text/css; charset=utf-8','cache-control':'no-cache','x-content-type-options':'nosniff'}});
}
