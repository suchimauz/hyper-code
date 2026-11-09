import { useEffect, useState } from 'react';
import { Panel, requestJson, type UiExtension } from '@hyper/ui';

type InitialPrompt = { agentId: string; title: string; prompt: string; characters: number; estimatedTokens: number };
/** Literal, read-only full-system-prompt reader. Authorization is enforced by the endpoint. */
export function InitialPromptPage() {
  const id = new URLSearchParams(window.location.search).get('promptAgent') ?? '';
  const [data, setData] = useState<InitialPrompt | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setData(null); setError('');
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) { setError('Invalid agent identifier'); return; }
    void requestJson<InitialPrompt>(`/agent/${encodeURIComponent(id)}/initialPrompt`, { signal: controller.signal, headers: { Accept: 'application/json' } })
      .then(value => { if (!controller.signal.aborted) setData(value); })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause)); });
    return () => controller.abort();
  }, [id]);
  return <Panel title="Initial prompt">
    <a href={`/?agent=${encodeURIComponent(id)}`}>Back to chat</a>
    <p>The current assembled full system prompt, shown exactly as text. This is not a historical snapshot or the first user message.</p>
    {error ? <p role="alert">{error}</p> : !data || data.agentId !== id ? <p role="status">Loading initial prompt…</p> : <>
      <h2>{data.title}</h2>
      <p>{data.characters.toLocaleString()} characters · {data.estimatedTokens.toLocaleString()} estimated tokens</p>
      <pre aria-label="Full system prompt" tabIndex={0} style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{data.prompt}</pre>
    </>}
  </Panel>;
}
export const initialPromptExtension: UiExtension = { id: 'initial-prompt', apiVersion: 1, pages: [{ id: 'overview', title: 'Initial prompt', component: InitialPromptPage }] };
