import { useEffect, useState } from 'react';
import { Button, Dialog, Panel, TextField, requestJson, subscribeLive, type ExtensionViewProps, type UiExtension } from '@mauzcode/ui';

/** Read-only dev/test fixture for the public SDK. Never install in the production registry. */
function Overview({ context }: ExtensionViewProps) {
  const [name, setName] = useState('');
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let controller: AbortController | undefined;
    let disposed = false;
    const refresh = () => {
      controller?.abort(); controller = new AbortController();
      void requestJson<{ agents: unknown[] }>('/api/v1/agents', { signal: controller.signal }).then(data => {
        if (!disposed) { setCount(data.agents.length); setError(null); }
      }).catch(cause => { if (!disposed && cause?.name !== 'AbortError') setError(cause instanceof Error ? cause.message : 'Данные недоступны'); });
    };
    refresh();
    const stop = subscribeLive({ name: 'sdk-example', types: ['agents.changed'], onEvent: refresh, resync: refresh, onError: cause => setError(String(cause)) });
    return () => { disposed = true; controller?.abort(); stop(); };
  }, []);
  return <div className="mauzcode-extension-demo"><div hidden data-live-topic="agents" />
    <Panel title="Пример публичного SDK"><p>Это доверенное React-расширение использует только публичный @mauzcode/ui.</p>
      <p>Доступные разговоры: {count ?? '…'}. Текущий агент: {context.agentId ?? 'не выбран'}.</p>
      {error && <p role="alert">{error}</p>}
      <TextField label="Локальная заметка" value={name} onChange={event => setName(event.target.value)} description="Не сохраняется и никуда не отправляется." />
      <Button onClick={() => setOpen(true)}>Показать заметку</Button>
    </Panel>
    <Dialog open={open} onOpenChange={setOpen} title="Пример диалога"><p>{name || 'Заметка пуста'}</p></Dialog>
  </div>;
}

export const sdkExample: UiExtension = {
  id: 'sdk-example', apiVersion: 1,
  pages: [{ id: 'overview', title: 'UI SDK', component: Overview }],
  navigation: [{ page: 'overview', title: 'UI SDK' }],
  panels: [{ id: 'overview', title: 'Пример SDK', component: Overview }],
  actions: [{ id: 'top', title: 'В начало страницы', run: () => { window.scrollTo({ top: 0, behavior: 'instant' }); } }],
};
