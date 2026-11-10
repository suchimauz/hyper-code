import { useEffect, useState } from 'react';
import { requestJson } from '../../lib/hyper';
import { liveRefresh } from '../../lib/liveRefresh';
import { PluginInputHost } from './PluginInputHost';
import { usePluginUi } from '../../extensions/pluginRuntime';
import { SecretCard, type SecretInput } from './SecretCard';

type PendingInput = { id: string; kind: string; title: string; message?: string; saveAs?: string; mode?: string };
/** Only metadata enters React. Fields and secure transports stay in their server document. */
export function SecureInputHost({ agentId }: { agentId: string }) {
  const { registry } = usePluginUi();
  const [inputs, setInputs] = useState<PendingInput[]>([]);
  const [error, setError] = useState('');
  const [opened, setOpened] = useState<string | null>(null);
  useEffect(() => {
    setInputs([]); setOpened(null); setError('');
    const live = liveRefresh({
      name: `secure-inputs:${agentId}`,
      fallbackMs: 5000,
      matches: event => !event.agentId || event.agentId === agentId,
      read: async signal => {
        try {
          const next = await requestJson<{ inputs: PendingInput[] }>(`/input/compat?agentId=${encodeURIComponent(agentId)}`, { signal });
          if (!signal.aborted) { setInputs(next.inputs); setError(''); }
        } catch {
          if (!signal.aborted) setError('Не удалось загрузить защищённые формы. Повторим автоматически.');
        }
      },
    });
    return live.dispose;
  }, [agentId]);
  const theme = document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && window.matchMedia?.('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  const done = (id: string) => setInputs(list => list.filter(item => item.id !== id));
  return <>{registry.inputKinds.length > 0 && <PluginInputHost agentId={agentId} />}{error && <p role="status">{error}</p>}{inputs.filter(input => input.kind === 'secret').map(input => <SecretCard key={input.id} agentId={agentId} input={input as SecretInput} theme={theme} onDone={() => done(input.id)} />)}{inputs.filter(input => !['secret', 'choice', 'confirm', 'grid', 'planning-review'].includes(input.kind) && !registry.inputKinds.some(entry => entry.kind === input.kind)).map(input => <section key={input.id} aria-label={input.title}>
    <button type="button" aria-expanded={opened === input.id} onClick={() => setOpened(opened === input.id ? null : input.id)}>{input.title} · {opened === input.id ? 'Скрыть' : 'Открыть защищённую форму'}</button>
    <p>Если форма недоступна, восстановите её плагин в разделе «Плагины». Подтверждение не выполнено.</p>{input.kind === 'redmine-approval' && <a href={`/input/compat?agentId=${encodeURIComponent(agentId)}&id=${encodeURIComponent(input.id)}&theme=${theme}`} target="_blank" rel="noopener noreferrer">Открыть подтверждение в защищённой странице</a>}
    {opened === input.id && input.kind !== 'redmine-approval' && <iframe title={input.title} src={`/input/compat?agentId=${encodeURIComponent(agentId)}&id=${encodeURIComponent(input.id)}&theme=${theme}`} referrerPolicy="no-referrer" sandbox="allow-scripts allow-forms allow-same-origin" style={{ width: '100%', height: 480, border: '1px solid var(--border)', borderRadius: 12 }} />}
  </section>)}</>;
}
