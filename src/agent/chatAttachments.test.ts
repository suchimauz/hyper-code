import { test, expect } from 'bun:test';
import { Window } from 'happy-dom';
const source = await Bun.file(new URL('./$script_chat.js', import.meta.url)).text();
function fixture() {
 const w = new Window({url:'http://local/agent/a'}), d = w.document;
 (w as any).requestAnimationFrame = () => 0;
 const revoked: string[] = []; let sequence = 0;
 (w.URL as any).createObjectURL = () => 'blob:local-' + ++sequence;
 (w.URL as any).revokeObjectURL = (url: string) => revoked.push(url);
 d.body.innerHTML = '<main><section id="chat-panel" data-agent-id="a"><div id="messages"></div><form id="form" hx-post="/agent/a"><button type="button" data-chat-retry></button><input name="requestId"><input id="files" type="file" multiple><button data-attach-button type="button"></button><div data-attachments></div><textarea id="input"></textarea></form></section></main>';
 w.eval(source);
 const files = d.querySelector('#files') as any, form = d.querySelector('#form')!;
 const image = new w.File(['image'], '<unsafe>.png', {type:'image/png'}), doc = new w.File(['document'], 'notes.txt', {type:'text/plain'});
 const select = (items = [image, doc]) => { const dt = new w.DataTransfer(); items.forEach(f => dt.items.add(f)); files.files = dt.files; files.dispatchEvent(new w.Event('change')); };
 const send = (status: number) => { if(form.hasAttribute('data-chat-send-failed'))(form.querySelector('[data-chat-retry]') as any).click();else form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true})); form.dispatchEvent(new w.CustomEvent('htmx:after:request',{bubbles:true,detail:{ctx:{sourceElement:form,response:{status}}}})); };
 return {w,d,files,form,select,send,revoked};
}
test('attachment cards safely show names, size, local preview and accessible dismiss', async () => {
 const f = fixture(); f.select();
 expect(f.d.querySelectorAll('.chat-attachment-card').length).toBe(2);
 expect(f.d.querySelector('.chat-attachment-details')!.textContent).toBe('<unsafe>.png5 B');
 expect(f.d.querySelector('unsafe')).toBeNull();
 const trigger = f.d.querySelector('.chat-attachment-thumbnail') as any; trigger.click();
 const dialog = f.d.querySelector('dialog') as any;
 expect(dialog.open).toBe(true); expect(dialog.querySelector('img').src).toBe('blob:local-1');
 expect(dialog.getAttribute('aria-label')).toContain('<unsafe>.png');
 dialog.dispatchEvent(new f.w.Event('cancel', {cancelable:true}));
 expect(f.d.querySelector('dialog')).toBeNull(); expect(f.d.activeElement).toBe(trigger);
 trigger.click(); (f.d.querySelector('.chat-attachment-preview-close') as any).click();
 expect(f.d.querySelector('dialog')).toBeNull(); await f.w.happyDOM.close();
});
test('individual removal updates real FileList, content attributes, URL cleanup and focus', async () => {
 const f = fixture(); f.select();
 expect(f.form.hasAttribute('data-composer-has-content')).toBe(true);
 (f.d.querySelector('.chat-attachment-remove') as any).click();
 expect([...f.files.files].map((file:any)=>file.name)).toEqual(['notes.txt']); expect(f.revoked).toEqual(['blob:local-1']);
 (f.d.querySelector('.chat-attachment-remove') as any).click();
 expect(f.files.files.length).toBe(0); expect(f.form.hasAttribute('data-composer-has-content')).toBe(false);
 expect(f.d.querySelector('[data-attachments]')!.classList.contains('hidden')).toBe(true); await f.w.happyDOM.close();
});
test('failed submission retains attachments and successful submission releases previews', async () => {
 const f = fixture(); f.select(); f.send(500);
 expect(f.files.files.length).toBe(2); expect(f.revoked).toEqual([]);
 f.send(200); expect(f.files.files.length).toBe(0); expect(f.revoked).toEqual(['blob:local-1']);
 expect(f.d.querySelectorAll('.chat-attachment-card').length).toBe(0); await f.w.happyDOM.close();
});
test('navigation and pagehide release URLs and dialogs; pageshow reconstructs thumbnails', async () => {
 const f = fixture(); f.select(); (f.d.querySelector('.chat-attachment-thumbnail') as any).click();
 f.w.dispatchEvent(new f.w.Event('pagehide')); expect(f.revoked).toEqual(['blob:local-1']); expect(f.d.querySelector('dialog')).toBeNull();
 f.w.dispatchEvent(new f.w.Event('pageshow')); expect(f.d.querySelector('img')!.getAttribute('src')).toBe('blob:local-2');
 f.d.querySelector('main')!.dispatchEvent(new f.w.Event('htmx:before:cleanup',{bubbles:true}));
 expect(f.revoked).toEqual(['blob:local-1','blob:local-2']); await f.w.happyDOM.close();
});
