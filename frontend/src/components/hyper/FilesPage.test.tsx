import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FilesPage, parseFilesLocation } from './FilesPage';
import { requestJson } from '../../sdk/api';
vi.mock('./CodeEditor', () => ({ CodeEditor: ({ value, onChange, path }: { value: string; onChange: (v: string) => void; path: string }) => <textarea aria-label={`Текст файла ${path}`} defaultValue={value} onChange={event => onChange(event.target.value)} /> }));
vi.mock('../../sdk/api', () => ({ requestJson: vi.fn() }));
const request=vi.mocked(requestJson);
beforeEach(()=>{request.mockReset(); window.history.replaceState({},'', '/files?path=/work/a.txt');});
it.each([['/files/absolute/work/a%20b.txt','/work/a b.txt',''],['/files/embed/work/a.txt','/work/a.txt',''],['/files/remote/box/work/a.txt','/work/a.txt','box'],['/files/remote/embed/box/work/a.txt','/work/a.txt','box']])('decodes %s',(route,path,host)=>{expect(parseFilesLocation(new URL(route,'https://hyper.test'))).toMatchObject({path,host});});
it('loads CSRF before native read and explicitly saves with snapshot',async()=>{
 request.mockResolvedValueOnce({csrfToken:'cookie-token'}).mockResolvedValueOnce({path:'/work/a.txt',content:'old'}).mockResolvedValueOnce({path:'/work/a.txt',content:'new'});
 render(<FilesPage/>);fireEvent.change(await screen.findByRole('textbox'),{target:{value:'new'}});fireEvent.click(screen.getByRole('button',{name:/Сохранить/}));
 await waitFor(()=>expect(request).toHaveBeenLastCalledWith('/files?path=%2Fwork%2Fa.txt',{method:'PUT',csrfToken:'cookie-token',body:{content:'new',expectedContent:'old'}}));
 expect(request.mock.calls.some(([url])=>String(url).includes('/canvas/'))).toBe(false);
});
it('remote HTML uses sandboxed raw preview',async()=>{
 window.history.replaceState({},'','/files/remote/box/work/a.html');request.mockResolvedValueOnce({path:'/work/a.html',preview:true,previewKind:'html'});
 const view=render(<FilesPage csrfToken="token"/>);await screen.findByRole('link',{name:'Скачать файл'});expect(view.container.querySelector('iframe')).toHaveAttribute('sandbox','');expect(view.container.querySelector('iframe')).toHaveAttribute('src','/files/raw?path=%2Fwork%2Fa.html&host=box');
});
