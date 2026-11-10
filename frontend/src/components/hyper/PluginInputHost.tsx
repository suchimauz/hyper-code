import { Component, useEffect, useRef, useState, type ReactNode } from 'react';
import { requestJson } from '../../lib/hyper';
import { liveRefresh } from '../../lib/liveRefresh';
import { usePluginUi } from '../../extensions/pluginRuntime';
import type { ExtensionInput, ExtensionInputProps } from '../../extensions/types';

class CardBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

/** Approved plugin cards consume server-projected metadata; completion always stays on the server. */
export function PluginInputHost({ agentId }: { agentId: string }) {
  const { registry } = usePluginUi();
  const [inputs, setInputs] = useState<ExtensionInput[]>([]);
  const [error, setError] = useState('');
  const refresh = useRef<() => void>(() => {});
  useEffect(() => {
    setInputs([]); setError('');
    const live = liveRefresh({
      name: `plugin-inputs:${agentId}`, fallbackMs: 5000,
      matches: event => !event.agentId || event.agentId === agentId,
      read: async signal => {
        try {
          const next = await requestJson<{ inputs: ExtensionInput[] }>(`/input/cards?agentId=${encodeURIComponent(agentId)}`, { signal });
          if (!signal.aborted) { setInputs(next.inputs); setError(''); }
        } catch { if (!signal.aborted) setError('Не удалось обновить формы. Повторим автоматически.'); }
      },
    });
    refresh.current = live.refresh;
    return () => { refresh.current = () => {}; live.dispose(); };
  }, [agentId]);
  const theme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  // /input/cards also returns terminal receipts for chat history; only live inputs are cards.
  return <>{error && <p role="status">{error}</p>}{inputs.filter(input => input.state === 'open' || input.state === 'processing').map(input => {
    const registration = registry.inputKinds.find(entry => entry.kind === input.kind);
    if (!registration) return null; // The compatibility host remains available for absent/unapproved plugins.
    const Card = registration.component;
    const context: ExtensionInputProps['context'] = { agentId, theme, readOnly: input.state !== 'open' };
    const fallback = <p role="alert">Форма недоступна. <a href={`/input/compat?agentId=${encodeURIComponent(agentId)}&id=${encodeURIComponent(input.id)}&theme=${theme}`} target="_blank" rel="noopener noreferrer">Открыть защищённую страницу</a></p>;
    return <CardBoundary key={`${registration.key}:${input.id}`} fallback={fallback}><Card context={context} input={input} onDone={() => refresh.current()} /></CardBoundary>;
  })}</>;
}
