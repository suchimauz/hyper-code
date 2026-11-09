import { expect, test } from 'bun:test';
import { Window } from 'happy-dom';
const source = await Bun.file(new URL('./$script_canvas.js', import.meta.url)).text();
function fixture() {
    const w = new Window({ url: 'http://localhost/canvas/a/item/7/document' });
    w.document.body.innerHTML = '<main data-canvas-agent="a" data-canvas-document="7"><section data-canvas-panel data-canvas-rev="p"><div data-canvas-body data-canvas-item="7" data-canvas-state="{}" data-canvas-body-rev="b"><iframe data-canvas-frame="7"></iframe><div data-canvas-files><a href="/files/absolute/tmp/example">file</a></div></div></section></main>';
    w.document.head.innerHTML = '<meta name="csrf-token" content="document-token">';
    const requests: { url: string; body?: string; headers?: Record<string,string> }[] = [];
    let subscription: any;
    (w as any).hyperLive = { subscribe: (s: any) => { subscription = s; } };
    (w as any).fetch = async (url: string, opts?: any) => { requests.push({url, body: opts?.body, headers: opts?.headers}); return {ok: true, json: async () => ({state:{n:1}}), text: async () => '<section data-canvas-panel data-canvas-rev="p"></section>'}; };
    w.eval(source);
    return {w,requests,subscription};
}
test('document bridge ignores messages from unrelated windows', async () => {
    const {w,requests} = fixture();
    w.dispatchEvent(new w.MessageEvent('message', {data:{hyperCanvas:1,type:'state',state:{n:1}},source:w}));
    await Promise.resolve();
    expect(requests).toHaveLength(0);
    await w.happyDOM.close();
});
test('sandbox state from the pinned frame uses only its item endpoint', async () => {
    const {w,requests} = fixture();
    const frame = w.document.querySelector('iframe')!;
    w.dispatchEvent(new w.MessageEvent('message', {data:{hyperCanvas:1,type:'state',state:{n:1}},source:frame.contentWindow}));
    await new Promise(resolve=>setTimeout(resolve,0));
    expect(requests[0]).toEqual({url:'/canvas/a/item/7',body:JSON.stringify({state:{n:1}}),headers:{'content-type':'application/json','x-csrf-token':'document-token'}});
    await w.happyDOM.close();
});
test('document resync only fetches its authorized item document, never the retired panel', async () => {
    const {w,requests,subscription} = fixture();
    await subscription.resync();
    expect(requests.map(r=>r.url)).toEqual(['/canvas/a/item/7/document?fragment=1']);
    expect(source).not.toContain('/panel');
    expect(source).not.toContain('data-canvas-resizer');
    expect(source).not.toContain('setAgent:');
    await w.happyDOM.close();
});
test('rich file navigation keeps its item binding', async () => {
    const {w,requests} = fixture();
    w.document.querySelector('a')!.dispatchEvent(new w.MouseEvent('click', {bubbles:true,cancelable:true,button:0}));
    await Promise.resolve();
    expect(JSON.parse(requests[0]!.body!)).toEqual({navigate:{itemId:7,file:{path:'/tmp/example',tab:''}}});
    expect(requests[0]!.headers?.['x-csrf-token']).toBe('document-token');
    await w.happyDOM.close();
});
