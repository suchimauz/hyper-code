import { Component, useState, type ReactNode } from 'react';
import { Button } from '../components/ui/Button';
import type { ExtensionContext, RegisteredAction, RegisteredView } from './types';
import './extensions.css';

export class ExtensionBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <p role="alert">Расширение недоступно. Откройте его заново.</p> : this.props.children; }
}

/** Placement, error isolation and identity belong to MauzCode, not to the extension. */
export function ExtensionSurface({ view, context, onClose }: { view: RegisteredView; context: ExtensionContext; onClose: () => void }) {
  const View = view.component;
  return <section className="mauzcode-extension-surface" aria-label={view.title}>
    <header><h2>{view.title}</h2><Button onClick={onClose} aria-label={`Закрыть ${view.title}`}>Закрыть</Button></header>
    <ExtensionBoundary key={`${view.key}:${context.agentId}`}><View context={context} /></ExtensionBoundary>
  </section>;
}

export function ExtensionActionButton({ action, context }: { action: RegisteredAction; context: ExtensionContext }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return <><Button disabled={pending || (!!action.mutates && context.readOnly)} onClick={async () => {
    if (pending || (action.mutates && context.readOnly)) return;
    setPending(true); setError(null);
    try { await action.run(context); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Действие не выполнено'); }
    finally { setPending(false); }
  }}>{action.title}</Button>{error && <p role="alert">{error}</p>}</>;
}
