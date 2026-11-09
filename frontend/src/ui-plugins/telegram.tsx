import { useEffect, useRef, useState } from 'react';
import { Button, Dialog, Panel, TextField, requestJson, type ExtensionViewProps, type UiExtension } from '@hyper/ui';
const telegramStyles = ".telegram-page { padding: var(--space-4); color: var(--text); }\n.telegram-layout { display: grid; grid-template-columns: minmax(220px, 30%) minmax(0, 1fr); gap: var(--space-4); }\n.telegram-layout aside, .telegram-conversation { min-width: 0; }\n.telegram-dialogs { max-height: 65vh; overflow: auto; margin-top: var(--space-3); }\n.telegram-chat { display: flex; align-items: center; gap: var(--space-2); width: 100%; min-height: 48px; padding: var(--space-3); border: 1px solid transparent; border-radius: var(--radius-sm); background: var(--surface); color: var(--text); text-align: left; cursor: pointer; font: inherit; }\n.telegram-chat > span:nth-child(2) { min-width: 0; flex: 1; }\n.telegram-chat[aria-pressed=true] { border-color: var(--line-strong); background: var(--input-bg); }\n.telegram-chat:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: -2px; }\n.telegram-preview { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-secondary); font-size: var(--font-sm); }\n.telegram-avatar { display: inline-grid; place-items: center; width: 36px; height: 36px; border-radius: 50%; position: relative; overflow: hidden; flex-shrink: 0; background: var(--input-bg); }\n.telegram-avatar img { position: absolute; width: 100%; height: 100%; object-fit: cover; }\n.telegram-messages { list-style: none; padding: var(--space-2); display: flex; flex-direction: column; gap: var(--space-3); max-height: 55vh; overflow: auto; }\n.telegram-message { border: 1px solid var(--line); border-radius: var(--radius-md); padding: var(--space-3); max-width: 90%; width: fit-content; }\n.telegram-outgoing .telegram-message { margin-left: auto; background: var(--input-bg); }\n.telegram-message p, .telegram-send-preview { white-space: pre-wrap; overflow-wrap: anywhere; }\n.telegram-message small { color: var(--text-secondary); }\n.telegram-conversation form { display: grid; gap: var(--space-3); }\n@media (max-width: 640px) { .telegram-layout { grid-template-columns: 1fr; } .telegram-dialogs { max-height: 28vh; } .telegram-page { padding: var(--space-2); } }\n";

type Chat = { id: string; title: string; lastMessage: string | null; unreadCount: number };
type Message = { id: number; date: string; sender: string; senderId: string | null; outgoing: boolean; text: string };
type Draft = { chat: string; title: string; text: string };
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);
function Avatar({ id, title }: { id: string; title: string }) {
  const [failed, setFailed] = useState(false);
  return <span className="telegram-avatar" aria-hidden="true">{title.slice(0, 2)}{!failed && /^\d+$/.test(id) && <img src={`/telegram/api/avatar/${encodeURIComponent(id)}`} alt="" loading="lazy" onError={() => setFailed(true)} />}</span>;
}

/** Personal Telegram conversations. Opening and polling never send; each send requires a frozen preview. */
export function TelegramPage({ context }: ExtensionViewProps) {
  const [chats, setChats] = useState<Chat[]>([]), [active, setActive] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]), [query, setQuery] = useState('');
  const [text, setText] = useState(''), [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState(''), [sendError, setSendError] = useState('');
  const [loading, setLoading] = useState(true), [messageLoading, setMessageLoading] = useState(false);
  const [sending, setSending] = useState(false), [refresh, setRefresh] = useState(0);
  const sendingRef = useRef(false);
  const [csrfToken, setCsrfToken] = useState<string | undefined>();
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    void requestJson<{ dialogs: Chat[]; csrfToken?: string }>('/telegram/api/dialogs?max=150', { signal: controller.signal }).then(data => {
      if (!controller.signal.aborted) { setChats(data.dialogs); setCsrfToken(data.csrfToken); }
    }).catch(error => { if (!controller.signal.aborted) setError(errorText(error)); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [refresh]);
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    setMessages([]); setMessageLoading(true); setError('');
    const load = async () => {
      try {
        const data = await requestJson<{ messages: Message[] }>(`/telegram/api/messages?chat=${encodeURIComponent(active.id)}&max=100`, { signal: controller.signal });
        if (!controller.signal.aborted) { setMessages(data.messages); setError(''); }
      } catch (error) { if (!controller.signal.aborted) setError(errorText(error)); }
      finally { if (!controller.signal.aborted) { setMessageLoading(false); timer = setTimeout(load, 3000); } }
    };
    void load();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [active, refresh]);
  async function send() {
    if (!draft || context.readOnly || sendingRef.current) return;
    const snapshot = draft;
    sendingRef.current = true; setSending(true); setSendError('');
    try {
      await requestJson('/telegram/api/send', { method: 'POST', csrfToken, body: { chat: snapshot.chat, text: snapshot.text, confirm: true } });
      setDraft(null); setText(''); setRefresh(value => value + 1);
    } catch (error) {
      setSendError(`${errorText(error)}. Сообщение не отправляется повторно автоматически. Проверьте диалог перед новой попыткой.`);
      setDraft(null);
    } finally { sendingRef.current = false; setSending(false); }
  }
  return <div className="telegram-page"><style>{telegramStyles}</style>
    <Panel title="Telegram" actions={<Button disabled={sending} onClick={() => setRefresh(value => value + 1)}>Обновить</Button>}>
      <p>Личные сообщения</p>
      {error && <p role="alert">{error}</p>}
      {sendError && <p role="alert">{sendError}</p>}
      <div className="telegram-layout">
        <aside aria-label="Диалоги">
          <TextField label="Поиск диалогов" type="search" value={query} onChange={event => setQuery(event.target.value)} />
          {loading && <p role="status">Загрузка диалогов…</p>}
          {!loading && !chats.length && !error && <p>Нет личных диалогов</p>}
          <div className="telegram-dialogs">{chats.filter(chat => `${chat.title} ${chat.lastMessage ?? ''}`.toLowerCase().includes(query.toLowerCase())).map(chat => <button type="button" className="telegram-chat" key={chat.id} aria-pressed={active?.id === chat.id} disabled={sending || !!draft} onClick={() => { setActive(chat); setText(''); setSendError(''); }}>
            <Avatar id={chat.id} title={chat.title} /><span><strong>{chat.title}</strong><span className="telegram-preview">{chat.lastMessage || 'Нет сообщений'}</span></span>{chat.unreadCount > 0 && <span aria-label="Непрочитанные">{chat.unreadCount}</span>}
          </button>)}</div>
          {!!query && !chats.some(chat => `${chat.title} ${chat.lastMessage ?? ''}`.toLowerCase().includes(query.toLowerCase())) && <p>Ничего не найдено</p>}
        </aside>
        <section aria-label="Сообщения" className="telegram-conversation">
          <h3>{active?.title ?? 'Выберите диалог'}</h3>
          {messageLoading && <p role="status">Загрузка сообщений…</p>}
          <ol className="telegram-messages">{messages.map(message => <li key={message.id} className={message.outgoing ? 'telegram-outgoing' : ''}>
            <div className="telegram-message"><small>{message.outgoing ? 'Я' : message.sender} · <time dateTime={message.date}>{new Date(message.date).toLocaleString()}</time></small><p>{message.text || 'Медиа-сообщение'}</p></div>
          </li>)}</ol>
          {active && !messageLoading && !messages.length && !error && <p>В диалоге нет сообщений</p>}
          <form onSubmit={event => { event.preventDefault(); if (active && text.trim() && !context.readOnly && !sending) { setSendError(''); setDraft({ chat: active.id, title: active.title, text: text.trim() }); } }}>
            <TextField label="Сообщение" value={text} disabled={!active || context.readOnly || sending || !!draft} onChange={event => setText(event.target.value)} />
            <Button type="submit" disabled={!active || !text.trim() || context.readOnly || sending || !!draft}>Проверить отправку</Button>
          </form>
          {context.readOnly && <p>Только чтение</p>}
        </section>
      </div>
    </Panel>
    <Dialog open={!!draft} onOpenChange={open => { if (!open && !sending) setDraft(null); }} title="Подтвердить отправку в Telegram" closeLabel="Закрыть">
      <p>Получатель: <strong>{draft?.title}</strong> ({draft?.chat})</p>
      <p className="telegram-send-preview">{draft?.text}</p>
      <Button disabled={sending} onClick={() => setDraft(null)}>Отмена</Button>
      <Button disabled={sending || context.readOnly} onClick={() => void send()}>{sending ? 'Отправка…' : 'Подтвердить и отправить'}</Button>
    </Dialog>
  </div>;
}
export const telegramExtension: UiExtension = { id: 'telegram', apiVersion: 1, pages: [{ id: 'overview', title: 'Telegram', component: TelegramPage }], navigation: [{ page: 'overview', title: 'Telegram' }] };
