import { useEffect, useState } from 'react';
import { requestJson, type ExtensionChatCardProps } from '@mauzcode/ui';
import { errorText, rangeLabel, shortHash, type ReviewComment } from './model';

/** Response of GET /gitUi?op=reviewCard: live details in send order; never a historical snapshot. */
export type ReviewCardItem = { id: string; state: 'available'; changedAfterSend: boolean; comment: ReviewComment } | { id: string; state: 'unavailable' };
export type ReviewCardData = { eventIdx: number; host: string; dir: string; count: number; sentAt: number; items: ReviewCardItem[] };

const STYLE = `.git-review-details{display:grid;gap:8px;margin:0;padding:0;list-style:none;font:12px/1.5 var(--font-sans,inherit)}
.git-review-details li{display:grid;gap:2px;padding-top:6px;border-top:1px solid var(--line)}
.git-review-details li:first-child{border-top:0;padding-top:0}
.git-review-meta{display:flex;flex-wrap:wrap;gap:6px;color:var(--text-tertiary)}
.git-review-path{font-family:var(--font-mono,monospace);color:var(--text);overflow-wrap:anywhere}
.git-review-badge{padding:0 6px;border:1px solid var(--line);border-radius:999px}
.git-review-body{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}
.git-review-note{margin:0;color:var(--text-tertiary)}
@media (prefers-contrast:more){.git-review-badge{border-color:currentColor}}`;

/** Expanded Git review chat card: reads the exact sent IDs through the authorized plugin endpoint on demand. */
export function ReviewCardDetails({ context, eventIdx }: ExtensionChatCardProps) {
  const [state, setState] = useState<{ data?: ReviewCardData; error?: string; denied?: boolean }>({});
  useEffect(() => {
    if (!context.agentId) return;
    const controller = new AbortController();
    setState({});
    requestJson<ReviewCardData>('/gitUi?agentId=' + encodeURIComponent(context.agentId) + '&op=reviewCard&eventIdx=' + eventIdx, { signal: controller.signal })
      .then(data => setState({ data }))
      .catch(error => { if (!controller.signal.aborted) setState({ error: errorText(error), denied: (error as { status?: unknown } | null)?.status === 403 }); });
    return () => controller.abort();
  }, [context.agentId, eventIdx]);
  if (state.error) return <p className="git-review-note" role="alert">{state.denied ? 'Нет доступа: ' : 'Не удалось загрузить комментарии: '}{state.error}</p>;
  if (!state.data) return <p className="git-review-note" role="status">Загрузка комментариев…</p>;
  return <div className="git-review-card-details"><style>{STYLE}</style>
    <p className="git-review-note">Показано текущее состояние комментариев, а не снимок на момент отправки.</p>
    <ol className="git-review-details" aria-label="Комментарии Git review">
      {state.data.items.map((item, index) => item.state === 'unavailable'
        ? <li key={item.id} data-review-state="unavailable"><span className="git-review-meta"><span>{index + 1}.</span><span className="git-review-badge">Недоступен</span></span><p className="git-review-note">Комментарий удалён или недоступен ({item.id.slice(0, 8)}).</p></li>
        : <li key={item.id} data-review-state="available">
          <span className="git-review-meta">
            <span>{index + 1}.</span><span className="git-review-path">{item.comment.path}</span><span>{rangeLabel(item.comment)}</span>
            <span>{item.comment.scope === 'commit' ? 'commit ' + shortHash(item.comment.commit_hash) : item.comment.worktree_group}</span>
            <span className="git-review-badge">{item.comment.status === 'open' ? 'Открыт' : 'Решён'}</span>
            {item.changedAfterSend && <span className="git-review-badge">Текущая версия (изменён после отправки)</span>}
            {item.comment.outdated && <span className="git-review-badge">Устарел</span>}
          </span>
          <p className="git-review-body">{item.comment.body}</p>
          {item.comment.resolution_note && <p className="git-review-note">Решение: {item.comment.resolution_note}</p>}
        </li>)}
    </ol>
  </div>;
}
