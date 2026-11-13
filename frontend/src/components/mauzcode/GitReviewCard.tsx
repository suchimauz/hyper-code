import { useId, useState, useSyncExternalStore } from 'react';
import { ChevronDown, ChevronUp, GitPullRequestArrow } from 'lucide-react';
import type { ChatEvent, GitReviewReference } from '../../lib/mauzcode';
import { usePluginUi } from '../../extensions/pluginRuntime';
import { ExtensionBoundary } from '../../extensions/ExtensionHost';
import './tool-row.css';
import './question-history.css';
import './git-review-card.css';

const plural = (n: number) => n % 100 >= 11 && n % 100 <= 14 ? 'комментариев' : n % 10 === 1 ? 'комментарий' : n % 10 >= 2 && n % 10 <= 4 ? 'комментария' : 'комментариев';
/** The shell's useTheme writes the resolved theme to <html data-theme>; the transcript does not receive it as a prop,
 * so subscribe to that attribute and re-render plugin details whenever the person (or the OS in system mode) switches it. */
const readTheme = (): 'light' | 'dark' => document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
const subscribeTheme = (change: () => void) => {
  const observer = new MutationObserver(change);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => observer.disconnect();
};
export function useDocumentTheme() { return useSyncExternalStore(subscribeTheme, readTheme, () => 'light' as const); }

/** Host-owned Git review receipt: a compact count card whose details are read live by the git plugin's
 * granted chatCards renderer only while expanded. Nothing fetched here returns to the transcript. */
export function GitReviewCard({ event, reference, agentId }: { event: ChatEvent; reference: GitReviewReference; agentId: string }) {
  const [expanded, setExpanded] = useState(false);
  const theme = useDocumentTheme();
  const detailsId = useId();
  const { registry } = usePluginUi();
  const Details = registry.chatCards?.find(card => card.kind === 'git.review')?.component;
  const location = `${reference.host === 'local' ? '' : reference.host + ':'}${reference.dir}`;
  return <article className="tool-row question-history git-review-card" data-chat-flow-kind="git-review" data-event-idx={event.idx}>
    <button className="tool-row-summary question-history-toggle" type="button" aria-expanded={expanded} aria-controls={detailsId} onClick={() => setExpanded(value => !value)}>
      <span className="tool-row-leading"><GitPullRequestArrow className="tool-row-icon" size={14} strokeWidth={1.4} aria-hidden="true" />{expanded ? <ChevronUp className="tool-row-toggle" size={14} aria-hidden="true" /> : <ChevronDown className="tool-row-toggle" size={14} aria-hidden="true" />}</span>
      <span className="tool-row-title">Git review · {reference.count}</span>
      <span className="tool-row-dot" aria-hidden="true" /><span className="tool-row-description" title={location}>{reference.count} {plural(reference.count)} · {location}</span>
    </button>
    <div id={detailsId} hidden={!expanded} className="tool-row-panel question-history-details">
      {expanded && <div className="tool-specialized-body"><div className="tool-io git-review-card-body">
        {Details
          ? <ExtensionBoundary><Details context={{ agentId, theme, readOnly: true }} eventIdx={event.idx} reference={{ ...reference, ids: [...reference.ids] }} /></ExtensionBoundary>
          : <p className="git-review-card-note" role="status">Подробности недоступны: интерфейс плагина Git не загружен.</p>}
      </div></div>}
    </div>
  </article>;
}
