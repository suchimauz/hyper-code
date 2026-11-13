import { useRef, type KeyboardEvent } from 'react';
import { moveIndex, shortHash, type Section } from './model';
import type { LiveIndicator } from './useLive';

export const SECTIONS: { id: Section; label: string }[] = [{ id: 'changes', label: 'Changes' }, { id: 'history', label: 'History' }, { id: 'comments', label: 'Comments' }];
const LIVE_TEXT: Record<LiveIndicator, string> = { live: 'Live', connecting: 'Connecting…', stopped: 'Not live' };
export const Icon = ({ d, size = 14 }: { d: string; size?: number }) => <svg className="git-icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><path d={d} /></svg>;
export const ICONS = { refresh: 'M21 12a9 9 0 1 1-2.6-6.4M21 4v5h-5', back: 'M15 18l-6-6 6-6', send: 'M22 2L11 13M22 2l-7 20-4-9-9-4z', branch: 'M6 3v12M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 9a9 9 0 0 1-9 9', alert: 'M12 9v4m0 4h.01M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z', check: 'M20 6L9 17l-5-5', file: 'M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8zM14 3v5h5', comment: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z', chevron: 'M6 9l6 6 6-6', stack: 'M12 2l9 5-9 5-9-5zM3 12l9 5 9-5M3 17l9 5 9-5', tag: 'M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8zM7.5 7.5h.01', cloud: 'M18 10h-1.3A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z', head: 'M12 2v20M5 9l7-7 7 7' };

type Props = {
  name: string; dir: string; host: string; branch?: string; head?: string;
  section: Section; onSection: (s: Section) => void; openCount: number;
  live: LiveIndicator; refreshing: boolean; onRefresh: () => void;
  unsent: number; sending: boolean; sendStatus: { kind: 'ok' | 'error'; text: string } | null; onSend: () => void; readOnly: boolean;
};
/** Translucent header: identity, segmented sections, live pill, Refresh and Send. */
export function Header(p: Props) {
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const index = SECTIONS.findIndex(s => s.id === p.section);
  const onKey = (e: KeyboardEvent, i: number) => {
    const next = moveIndex(e.key, i, SECTIONS.length, true);
    if (next === null) return;
    e.preventDefault(); p.onSection(SECTIONS[next].id); tabs.current[next]?.focus();
  };
  return <header className="git-bar">
    <div className="git-title">
      <h2 title={p.dir}>{p.name}</h2>
      <span className="git-meta">
        {p.host !== 'local' && <span className="git-host">{p.host}</span>}
        {p.branch && <span className="git-branch"><Icon d={ICONS.branch} size={12} />{p.branch}</span>}
        {p.head && <code className="git-head" title={p.head}>{shortHash(p.head)}</code>}
      </span>
    </div>
    <div className="git-seg" role="tablist" aria-label="Git sections" style={{ ['--n' as string]: SECTIONS.length, ['--i' as string]: Math.max(0, index) }}>
      <span className="git-seg-thumb" aria-hidden="true" />
      {SECTIONS.map((s, i) => <button key={s.id} ref={el => { tabs.current[i] = el; }} type="button" role="tab" id={'git-tab-' + s.id}
        aria-selected={s.id === p.section} aria-controls="git-panel" tabIndex={s.id === p.section ? 0 : -1}
        onClick={() => p.onSection(s.id)} onKeyDown={e => onKey(e, i)}>
        {s.label}{s.id === 'comments' && p.openCount > 0 && <span className="git-badge" aria-label={p.openCount + ' open'}>{p.openCount}</span>}
      </button>)}
    </div>
    <div className="git-actions">
      <span className="git-live" data-state={p.live} title={p.live === 'stopped' ? 'Live updates unavailable — use Refresh' : undefined}>
        <span className="git-live-dot" aria-hidden="true" />{LIVE_TEXT[p.live]}
      </span>
      <button type="button" className="git-icon-btn" onClick={p.onRefresh} disabled={p.refreshing} aria-label="Refresh" title="Refresh" aria-busy={p.refreshing || undefined}>
        <span className="git-refresh-glyph" data-spinning={p.refreshing || undefined}><Icon d={ICONS.refresh} size={15} /></span>
      </button>
      {!p.readOnly && <button type="button" className="git-btn git-btn-primary git-send" onClick={p.onSend} disabled={p.unsent === 0 || p.sending} aria-busy={p.sending || undefined}
        aria-describedby={p.sendStatus ? 'git-send-status' : undefined}>
        {p.sending ? <span className="git-spinner" aria-hidden="true" /> : <Icon d={ICONS.send} size={13} />}
        {p.sending ? 'Sending…' : `Send to agent (${p.unsent})`}
      </button>}
      {p.sendStatus && <span id="git-send-status" className="git-send-status" data-kind={p.sendStatus.kind}>
        <Icon d={p.sendStatus.kind === 'ok' ? ICONS.check : ICONS.alert} size={12} />{p.sendStatus.text}</span>}
    </div>
  </header>;
}
