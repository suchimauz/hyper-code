import { useEffect, useRef, useState } from 'react';
import { requestJson, ApiError, type ExtensionViewProps } from '@mauzcode/ui';

import { Network, Plus } from 'lucide-react';
import { Button } from '../ui/Button';
import { SettingsField as TextField } from './SettingsField';
import './settings.css';

type Proxy = { id: string; name: string | null; host: string; port: number; hasAuth: boolean; revision: number; users?:Array<{provider:string;account:string}> };
type Check = { ok: boolean; revision: number; checkedAt: string; durationMs: number; query?: string; country?: string; regionName?: string; city?: string; isp?: string; org?: string; as?: string; timezone?: string; message?: string; code?: string };
const checkErrors: Record<string, string> = { timeout:'Время проверки истекло.', proxy_dns:'Не удалось разрешить имя прокси.', proxy_connect:'Не удалось подключиться к прокси.', auth_refused:'Прокси отклонил аутентификацию.', connect_refused:'Прокси отклонил соединение с сервисом.', http_error:'Сервис вернул ошибку HTTP.', rate_limit:'Лимит проверок исчерпан. Повторите позже.', invalid_response:'Сервис вернул некорректный ответ.', cancelled:'Проверка отменена.' };
const endpoint = (item: Proxy) => `${item.host.includes(':') ? `[${item.host}]` : item.host}:${item.port}`;
const empty = { name: '', host: '', port: '', auth: false, username: '', password: '' };
/** Parse the complete clipboard value before changing any form fields. */
export function parseProxyPaste(value: string) {
  const match = value.startsWith('[') ? /^\[([^\]]+)\]:(\d+):([^:]+):([\s\S]+)$/.exec(value) : /^([^:]+):(\d+):([^:]+):([\s\S]+)$/.exec(value);
  if (!match) throw new Error('Ожидается HOST:PORT:USER:PASS или [IPv6]:PORT:USER:PASS.');
  const [, host, port, username, password] = match;
  const validHost = host.includes(':') ? (() => { try { return new URL(`http://[${host}]/`).hostname.length > 0; } catch { return false; } })() : /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(host) && host.split('.').every(part => part.length > 0 && part.length <= 63 && !part.startsWith('-') && !part.endsWith('-'));
  if (!validHost || (/^[\d.]+$/.test(host) && (host.split('.').length !== 4 || host.split('.').some(part => !/^\d{1,3}$/.test(part) || Number(part) > 255 || (part.length > 1 && part.startsWith('0'))))) || host.length > 253 || !Number.isInteger(Number(port)) || Number(port) < 1 || Number(port) > 65535 || new TextEncoder().encode(username).length > 255 || new TextEncoder().encode(password).length > 255) throw new Error('Проверьте адрес, порт (1–65535) и длину учётных данных (до 255 байт).');
  return { host, port: String(Number(port)), auth: true, username, password };
}
const message = (e: unknown) => e instanceof ApiError && e.status === 429 ? 'Слишком много проверок. Повторите позже (учитывается Retry-After сервиса).' : e instanceof ApiError && e.status === 409 ? 'Запись изменена в другой вкладке. Список обновлён; откройте редактирование заново.' : e instanceof Error ? e.message : 'Не удалось выполнить действие.';
export function SocksProxiesPanel({ context }: ExtensionViewProps) {
  const [items, setItems] = useState<Proxy[]>([]), [loaded, setLoaded] = useState(false), [error, setError] = useState('');
  const [form, setForm] = useState(empty), [editing, setEditing] = useState<Proxy | null>(null), [open, setOpen] = useState(false), [replace, setReplace] = useState(false);
  const [busy, setBusy] = useState(false), [checking, setChecking] = useState<string[]>([]), [results, setResults] = useState<Record<string, Check>>({});
  const [removing, setRemoving] = useState<Proxy | null>(null);
  const addButton = useRef<HTMLDivElement>(null), removeButton = useRef<HTMLButtonElement | null>(null);
  const lock = useRef(false), active = useRef(new Map<string, AbortController>()), versions = useRef(new Map<string, number>());
  const refresh = async (signal?: AbortSignal) => { const data = await requestJson<{items: Proxy[]}>('/settings/proxies', { signal }); setItems(data.items); setLoaded(true); };
  useEffect(() => { const controller = new AbortController(); void refresh(controller.signal).catch(e => { if (!controller.signal.aborted) setError(message(e)); }); return () => { controller.abort(); for (const c of active.current.values()) c.abort(); }; }, []);
  const invalidate = (id: string) => { versions.current.set(id, (versions.current.get(id) ?? 0) + 1); active.current.get(id)?.abort(); setResults(old => { const next = {...old}; delete next[id]; return next; }); };
  const close = () => { setOpen(false); setEditing(null); setForm(empty); setReplace(false); addButton.current?.querySelector('button')?.focus(); };
  const edit = (item: Proxy) => { invalidate(item.id); setRemoving(null); setEditing(item); setForm({name:item.name ?? '',host:item.host,port:String(item.port),auth:item.hasAuth,username:'',password:''}); setReplace(false); setOpen(true); setError(''); };
  const mutate = async (body: object) => { if (lock.current || context.readOnly) return; lock.current = true; setBusy(true); setError(''); try { await requestJson('/settings/proxies', {method:'POST',body}); close(); await refresh(); } catch (e) { setForm(old => ({...old,username:'',password:''})); setError(message(e)); if (e instanceof ApiError && e.status === 409) { close(); try { await refresh(); } catch (refreshError) { setError(`${message(e)} ${message(refreshError)}`); } } } finally { lock.current = false; setBusy(false); } };
  const check = async (item: Proxy) => {
    if (active.current.has(item.id) || context.readOnly) return;
    const controller = new AbortController(), version = versions.current.get(item.id) ?? 0; active.current.set(item.id,controller); setChecking(old=>[...old,item.id]); setError('');
    try { const result = await requestJson<Check>('/settings/proxies',{method:'POST',body:{action:'check',id:item.id},signal:controller.signal}); if (!controller.signal.aborted && (versions.current.get(item.id) ?? 0) === version && (result.revision === item.revision || (!result.ok && result.revision === 0))) setResults(old=>({...old,[item.id]:result})); }
    catch (e) { if (!controller.signal.aborted) setError(message(e)); }
    finally { if (active.current.get(item.id) === controller) active.current.delete(item.id); setChecking(old=>old.filter(id=>id!==item.id)); }
  };
  return <section className="settings-panel" aria-label="SOCKS5">
    <header className="settings-panel-header"><h2>SOCKS5</h2><p>Управление прокси</p></header>
    {error && <p className="settings-feedback is-error" role="alert">{error}</p>}{!loaded && !error && <p className="settings-loading" role="status">Загрузка…</p>}
    <div ref={addButton} className="settings-actions"><Button aria-expanded={open} disabled={context.readOnly || busy} onClick={()=>{close();setRemoving(null);setOpen(true);setError('');}}><Plus size={14} strokeWidth={1.5} aria-hidden="true" />Добавить прокси</Button></div>
    {open && <form className="ssh-card" autoComplete="off" onSubmit={event=>{event.preventDefault(); if (editing) invalidate(editing.id); void mutate({action:editing?'update':'add',...(editing?{id:editing.id,revision:editing.revision}:{}),name:form.name,host:form.host,port:Number(form.port),auth:form.auth,...(form.auth && (!editing?.hasAuth || replace)?{username:form.username,password:form.password}:{})});}}>
      <div className="ssh-form" role="group" aria-label={editing?'Редактировать SOCKS5':'Новый SOCKS5'}><h3 className="ssh-card-name">{editing?'Редактировать SOCKS5':'Новый SOCKS5'}</h3>
      <TextField disabled={busy || context.readOnly} label="Метка" autoFocus value={form.name} maxLength={100} onChange={e=>setForm({...form,name:e.target.value})}/>
      <TextField disabled={busy || context.readOnly} label="IP или DNS-имя" value={form.host} required maxLength={253} onChange={e=>setForm({...form,host:e.target.value})} onPaste={e=>{const text=e.clipboardData.getData('text'); if (!text.includes(':')) return; try { if (new URL(`http://[${text}]/`).hostname) return; } catch { /* Not a bare IPv6 address; try the composite format. */ } e.preventDefault(); try { const parsed=parseProxyPaste(text); setForm({...form,...parsed}); setReplace(true); setError(''); } catch (error) { setError(message(error)); }}} hint="Можно вставить HOST:PORT:USER:PASS; для IPv6 — [IPv6]:PORT:USER:PASS. Пароль может содержать двоеточия."/>
      <TextField disabled={busy || context.readOnly} label="Порт" type="number" min={1} max={65535} step={1} required value={form.port} onChange={e=>setForm({...form,port:e.target.value})}/>
      <label className="settings-check"><input disabled={busy || context.readOnly} type="checkbox" checked={form.auth} onChange={e=>setForm({...form,auth:e.target.checked,username:'',password:''})}/> Аутентификация</label>
      {form.auth && editing?.hasAuth && <label className="settings-check"><input disabled={busy || context.readOnly} type="checkbox" checked={replace} onChange={e=>{setReplace(e.target.checked);setForm({...form,username:'',password:''});}}/> Заменить логин и пароль</label>}
      {form.auth && editing?.hasAuth && !replace && <p className="settings-note">Сохранённые логин и пароль не изменятся.</p>}
      {form.auth && (!editing?.hasAuth || replace) && <><TextField disabled={busy || context.readOnly} label="Логин" autoComplete="off" required value={form.username} onChange={e=>setForm({...form,username:e.target.value})}/><TextField disabled={busy || context.readOnly} label="Пароль" type="password" autoComplete="new-password" required value={form.password} onChange={e=>setForm({...form,password:e.target.value})}/></>}
      <div className="settings-actions"><Button variant="primary" disabled={busy || context.readOnly} type="submit">{busy?'Сохранение…':'Сохранить прокси'}</Button><Button disabled={busy} type="button" onClick={close}>Отмена</Button></div></div>
    </form>}
    {loaded && !items.length && <p className="settings-note">Прокси пока нет.</p>}
    <div className="ssh-list">{items.map(item=><article className="ssh-card" key={item.id}><header className="ssh-card-header"><div className="ssh-card-title"><h3 className="ssh-card-name"><Network size={16} strokeWidth={1.5} aria-hidden="true" /><span className="ssh-pinned">{item.name || endpoint(item)}</span></h3><p className="ssh-card-target">{endpoint(item)} · {item.hasAuth?'С аутентификацией':'Без аутентификации'}</p></div></header><div className="ssh-card-tabs">
      <button type="button" className="ssh-card-tab" disabled={busy || context.readOnly} onClick={()=>edit(item)}>Редактировать</button>
      <button type="button" className="ssh-card-tab" title="Проверка через ip-api.com (HTTP)" disabled={busy || context.readOnly || checking.includes(item.id) || editing?.id===item.id} onClick={()=>void check(item)}>{checking.includes(item.id)?'Проверка…':'Проверить'}</button>
      {checking.includes(item.id) && <button type="button" className="ssh-card-tab" onClick={()=>active.current.get(item.id)?.abort()}>Отменить проверку</button>}
      <button type="button" className="ssh-card-tab is-danger" disabled={busy || context.readOnly || !!item.users?.length} title={item.users?.length ? "Прокси привязан к аккаунтам" : undefined} onClick={event=>{removeButton.current=event.currentTarget;setRemoving(item);}}>Удалить</button></div>
      {!!item.users?.length && <p className="settings-note">Используется: {item.users.map(u=>`${u.provider}/${u.account}`).join(", ")}. Удаление недоступно, пока есть привязки.</p>}
      {removing?.id===item.id && <div className="settings-confirm" role="group" aria-label="Удаление прокси" onKeyDown={event=>{if(event.key==='Escape' && !busy){event.preventDefault();event.stopPropagation();setRemoving(null);removeButton.current?.focus();}}}>
        <p className="settings-note">Удалить прокси «{item.name || endpoint(item)}»?</p>
        <div className="settings-actions"><Button autoFocus disabled={busy} onClick={()=>{setRemoving(null);removeButton.current?.focus();}}>Отмена</Button><Button variant="primary" disabled={busy || context.readOnly} onClick={()=>{invalidate(item.id);setRemoving(null);void mutate({action:'remove',id:item.id,revision:item.revision});}}>Удалить прокси</Button></div>
      </div>}
      {editing?.id===item.id && <p className="settings-note">Перед проверкой сохраните изменения или отмените редактирование.</p>}
      {results[item.id] && <div role="status">{results[item.id].ok?<dl className="settings-kv">{(['query','country','regionName','city','isp','org','as','timezone'] as const).map(key=>results[item.id][key] && <div className="settings-kv-row" key={key}><dt>{{query:'Внешний IP',country:'Страна',regionName:'Регион',city:'Город',isp:'Провайдер',org:'Организация',as:'AS',timezone:'Часовой пояс'}[key]}</dt><dd>{results[item.id][key]}</dd></div>)}</dl>:<p>{results[item.id].message || checkErrors[results[item.id].code ?? ''] || results[item.id].code || 'Проверка не удалась.'}</p>}<p className="settings-footnote">Проверено: {results[item.id].checkedAt} · Общая длительность: {results[item.id].durationMs} мс.</p></div>}
    </article>)}</div>
  </section>;
}
