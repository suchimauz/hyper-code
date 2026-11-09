import { useCallback, useEffect, useState } from 'react';
import { Button, Panel, TextField, requestJson, ApiError, type ExtensionViewProps, type UiExtension } from '@hyper/ui';

type Item = { module: string; key: string; type: string; title?: string; description?: string; source: string; path?: string; value?: string | number | boolean; defaultValue?: unknown; configured?: boolean; options?: string[]; min?: number; max?: number };
type Snapshot = { status: { openai: { set: boolean }; anthropic: { set: boolean }; kimi: { set: boolean }; groq: { set: boolean }; openrouter: { set: boolean }; kimiCoding: { loggedIn: boolean }; codex: { loggedIn: boolean; email?: string | null } }; flows: Record<string, { status: string; url?: string; userCode?: string; error?: string }> };
const errorText = (e: unknown) => e instanceof ApiError && e.status === 401 ? 'Войдите в систему, чтобы открыть настройки.' : e instanceof ApiError && e.status === 403 ? 'Нет доступа владельца или истёк токен запроса. Обновите страницу.' : e instanceof Error ? e.message : 'Не удалось выполнить действие.';
function ProviderKey({ name, label, configured, readOnly, refresh }: { name: string; label: string; configured: boolean; readOnly: boolean; refresh: () => Promise<void> }) {
  const [value, setValue] = useState(''); const [busy, setBusy] = useState(false); const [message, setMessage] = useState(''); const [error, setError] = useState('');
  return <form autoComplete="off" onSubmit={async event => { event.preventDefault(); if (busy || readOnly) return; setBusy(true); setError(''); setMessage(''); try { await requestJson('/settings/env', { method: 'POST', body: { action: 'env', key: name, value } }); setValue(''); setMessage('Ключ сохранён.'); await refresh(); } catch (e) { setValue(''); setError(errorText(e)); } finally { setBusy(false); } }}>
    <TextField label={label} type="password" autoComplete="new-password" value={value} onChange={e => setValue(e.target.value)} disabled={readOnly || busy} description={configured ? 'Ключ установлен. Введите новый, чтобы заменить.' : 'Ключ не установлен.'} />
    <Button type="submit" disabled={readOnly || busy || !value.trim()}>{busy ? 'Сохранение…' : 'Сохранить ключ'}</Button>
    {message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}
  </form>;
}
function Overview({ context }: ExtensionViewProps) {
  const [data, setData] = useState<Snapshot | null>(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [message, setMessage] = useState('');
  const refresh = useCallback(async (signal?: AbortSignal) => { const next = await requestJson<Snapshot>('/settings?format=json', { signal }); setData(next); setError(''); }, []);
  useEffect(() => { const controller = new AbortController(); let timer: ReturnType<typeof setTimeout>; const poll = async () => { try { await refresh(controller.signal); } catch (e) { if (!controller.signal.aborted) setError(errorText(e)); } if (!controller.signal.aborted) timer = setTimeout(() => { void poll(); }, 3000); }; void poll(); return () => { controller.abort(); clearTimeout(timer); }; }, [refresh]);
  const action = async (name: string) => { if (busy || context.readOnly) return; setBusy(true); setError(''); setMessage(''); try { await requestJson('/settings/env', { method: 'POST', body: { action: name } }); setMessage('Действие выполнено.'); await refresh(); } catch (e) { setError(errorText(e)); } finally { setBusy(false); } };
  return <div><Panel title="Ключи провайдеров"><p>Доступно только владельцу. Ключи сохраняются в .env и применяются без перезапуска. Сохранённые значения не показываются.</p>
    {error && <p role="alert">{error}</p>}{!data && !error && <p role="status">Загрузка настроек…</p>}
    {data && ([['openai', 'OPENAI_API_KEY', 'OpenAI'], ['anthropic', 'ANTHROPIC_API_KEY', 'Anthropic'], ['kimi', 'KIMI_API_KEY', 'Kimi'], ['groq', 'GROQ_API_KEY', 'Groq'], ['openrouter', 'OPENROUTER_API_KEY', 'OpenRouter']] as const).map(([id, name, label]) => <ProviderKey key={id} name={name} label={label} configured={data.status[id].set} readOnly={context.readOnly} refresh={refresh} />)}
  </Panel>
  {data && (['kimi', 'codex'] as const).map(provider => { const connected = provider === 'kimi' ? data.status.kimiCoding.loggedIn : data.status.codex.loggedIn; const flow = data.flows[provider]; return <Panel key={provider} title={provider === 'kimi' ? 'Kimi Coding — подписка' : 'Codex — подписка ChatGPT'}>
    <p>{connected ? 'Подключено' : 'Не подключено'}</p>{provider === 'codex' && data.status.codex.email && <p>{data.status.codex.email}</p>}
    <p>Используется файл авторизации CLI. Токены в интерфейс не передаются.</p>
    <Button disabled={context.readOnly || busy || flow?.status === 'pending'} onClick={() => { void action(`${provider}-login`); }}>{connected ? 'Подключить заново' : 'Подключить'}</Button>
    {connected && <Button disabled={context.readOnly || busy} onClick={() => { if (window.confirm('Удалить локальные данные авторизации этой подписки?')) void action(`${provider}-logout`); }}>Выйти</Button>}
    {flow?.status === 'pending' && <div role="status"><p>Завершите авторизацию у провайдера. Статус обновляется автоматически.</p>{flow.url && <a href={flow.url} target="_blank" rel="noopener noreferrer">Открыть авторизацию</a>}{flow.userCode && <p>Код: <code>{flow.userCode}</code></p>}</div>}
    {flow?.error && <p role="alert">{flow.error}</p>}
  </Panel>; })}{message && <p role="status">{message}</p>}</div>;
}
function SettingRow({ item, readOnly, refresh }: { item: Item; readOnly: boolean; refresh: () => Promise<void> }) {
  const [value, setValue] = useState(item.type === 'secret' ? '' : String(item.value ?? '')); const [checked, setChecked] = useState(!!item.value); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [message, setMessage] = useState('');
  useEffect(() => { setValue(item.type === 'secret' ? '' : String(item.value ?? '')); setChecked(!!item.value); }, [item]);
  const name = `${item.module}.${item.key}`; const disabled = readOnly || busy || item.source === 'file';
  const act = async (action: 'save' | 'reset') => { if (disabled) return; setBusy(true); setError(''); setMessage(''); try { await requestJson('/settings/declared', { method: 'POST', body: { action, name, value: item.type === 'boolean' ? checked : item.type === 'number' ? Number(value) : value } }); if (item.type === 'secret') setValue(''); await refresh(); setMessage(action === 'reset' ? 'Переопределение удалено.' : 'Сохранено.'); } catch (e) { if (item.type === 'secret') setValue(''); setError(errorText(e)); } finally { setBusy(false); } };
  return <Panel title={item.title || name}><form autoComplete="off" onSubmit={e => { e.preventDefault(); void act('save'); }}><p><code>{name}</code> · Источник: {item.source}</p>{item.description && <p>{item.description}</p>}
    {item.source === 'file' ? <p>Значение: <code>{JSON.stringify(item.value)}</code><br />Измените файл: <code>{item.path}</code></p> : item.type === 'boolean' ? <label><input type="checkbox" checked={checked} disabled={disabled} onChange={e => setChecked(e.target.checked)} /> {item.title || item.key}</label> : item.type === 'enum' ? <label>{item.title || item.key}<select value={value} disabled={disabled} onChange={e => setValue(e.target.value)}>{item.options?.map(o => <option key={o} value={o}>{o}</option>)}</select></label> : item.type === 'text' ? <label>{item.title || item.key}<textarea rows={4} value={value} disabled={disabled} onChange={e => setValue(e.target.value)} /></label> : <TextField label={item.title || item.key} type={item.type === 'secret' ? 'password' : item.type === 'number' ? 'number' : 'text'} min={item.min} max={item.max} step="any" autoComplete={item.type === 'secret' ? 'new-password' : 'off'} value={value} disabled={disabled} onChange={e => setValue(e.target.value)} description={item.type === 'secret' ? `${item.configured ? 'Секрет установлен.' : 'Секрет не установлен.'} Пустое поле оставляет значение без изменений.` : undefined} />}
    {item.type !== 'secret' && <p>По умолчанию: <code>{JSON.stringify(item.defaultValue) ?? '—'}</code></p>}
    {item.source !== 'file' && <Button type="submit" disabled={disabled || (item.type === 'number' && value.trim() === '')}>{busy ? 'Сохранение…' : 'Сохранить'}</Button>}
    {item.source === 'db' && <Button type="button" disabled={disabled} onClick={() => { if (window.confirm(`Удалить переопределение ${name}? Будет использовано окружение или значение по умолчанию.`)) void act('reset'); }}>Сбросить</Button>}
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
  </form></Panel>;
}
function Declared({ context }: ExtensionViewProps) {
  const [items, setItems] = useState<Item[] | null>(null); const [error, setError] = useState(''); const [query, setQuery] = useState('');
  const refresh = useCallback(async (signal?: AbortSignal) => { const data = await requestJson<{ items: Item[] }>('/settings/declared?format=json', { signal }); setItems(data.items); setError(''); }, []);
  useEffect(() => { const controller = new AbortController(); void refresh(controller.signal).catch(e => { if (!controller.signal.aborted) setError(errorText(e)); }); return () => controller.abort(); }, [refresh]);
  return <div><Panel title="Объявленные настройки"><p>Значения из файлов доступны только для чтения. Сброс удаляет переопределение из базы, но не меняет окружение или файлы.</p><TextField label="Найти настройку" value={query} onChange={e => setQuery(e.target.value)} />{error && <p role="alert">{error}</p>}{!items && !error && <p role="status">Загрузка…</p>}{items && <p role="status">Настроек: {items.length}</p>}</Panel>
    {items?.filter(i => `${i.module}.${i.key} ${i.title ?? ''}`.toLowerCase().includes(query.toLowerCase())).map(i => <SettingRow key={`${i.module}.${i.key}`} item={i} readOnly={context.readOnly} refresh={refresh} />)}
  </div>;
}
export const settingsExtension: UiExtension = { id: 'settings', apiVersion: 1, pages: [{ id: 'overview', title: 'Ключи и подписки', component: Overview }, { id: 'declared', title: 'Объявленные настройки', component: Declared }], navigation: [{ page: 'overview', title: 'Ключи и подписки' }, { page: 'declared', title: 'Объявленные настройки' }] };
