import { choiceResultId, coalesceQuestionHistory, QuestionHistoryList } from './QuestionHistory';
import { Fragment, useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { ChatMarkdown } from './ChatMarkdown';
import type { ChatEvent, EventPage } from '../../lib/hyper';
import { CurrentAction } from './CurrentAction';
import { ThinkingRow } from './ThinkingRow';
import { ActiveToolRow } from './ActiveToolRow';
import { TranscriptMessage as Message } from './TranscriptMessage';
import { ProcessGroup, WorkGroup } from './WorkGroups';
import { processEntries, workTurns } from './transcriptGroups';
import { coalesceCompactions } from './compactionEvents';
import { coalesceCommands } from './commandEvents';
import { captureTranscriptAnchor, restoreTranscriptAnchor, type TranscriptAnchor } from './transcriptScroll';
import { ChatNavigation, type ChatNavigationItem } from './ChatNavigation';
import { revealToolScroll } from './revealToolScroll';


export function Transcript({ agentId, events, page, hasOlder, loadingOlder, loadOlder, outline, loadThrough }: { agentId: string; events: ChatEvent[]; page: EventPage | null; hasOlder: boolean; loadingOlder: boolean; loadOlder: () => Promise<void>; outline?: ChatNavigationItem[]; loadThrough?: (idx: number) => Promise<void> }) {
  const [awayFromBottom, setAwayFromBottom] = useState(false);
  const root = useRef<HTMLDivElement>(null); const follow = useRef(true); const previousFirst = useRef<number | undefined>(undefined); const height = useRef(0);
  const anchor = useRef<TranscriptAnchor | null>(null);
  const revealTarget = useRef<HTMLElement | null>(null);
  const cancelReveal = useRef<(() => void) | null>(null);
  const previousTail = useRef<number | null>(null);
  useLayoutEffect(() => {
    const el = root.current; if (!el) return;
    const reveal = (event: Event) => {
      const target = (event as CustomEvent<{ element: HTMLElement }>).detail.element;
      if (!el.contains(target)) return;
      cancelReveal.current?.();
      revealTarget.current = target;
      follow.current = false;
      anchor.current = captureTranscriptAnchor(el);
      // A loading placeholder claims ownership but does not start scrolling.
      if ((event as CustomEvent<{ ready?: boolean }>).detail.ready === false) return;
      cancelReveal.current = revealToolScroll(el, target, () => {
        revealTarget.current = null;
        cancelReveal.current = null;
        anchor.current = captureTranscriptAnchor(el);
        follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 25;
        setAwayFromBottom(!follow.current);
      });
    };
    const cancel = () => { cancelReveal.current?.(); cancelReveal.current = null; revealTarget.current = null; anchor.current = captureTranscriptAnchor(el); };
    el.addEventListener('pointerdown', cancel);
    el.addEventListener('keydown', cancel);
    el.addEventListener('hyper:reveal-tool', reveal);
    el.addEventListener('wheel', cancel, { passive: true });
    el.addEventListener('touchstart', cancel, { passive: true });
    return () => { cancel(); el.removeEventListener('pointerdown', cancel); el.removeEventListener('keydown', cancel); el.removeEventListener('hyper:reveal-tool', reveal); el.removeEventListener('wheel', cancel); el.removeEventListener('touchstart', cancel); };
  }, []);
  useLayoutEffect(() => {
    const el = root.current; if (!el) return;
    const prepended = previousFirst.current != null && events[0]?.idx != null && events[0].idx < previousFirst.current;
    const ownInput = previousTail.current != null && events.some(event => event.idx > previousTail.current! && event.type === 'user' && event.navigationEligible === true);
    if (ownInput) { cancelReveal.current?.(); follow.current = true; revealTarget.current = null; }
    if (revealTarget.current) { /* Do not fight the one-shot disclosure animation. */ }
    else if (follow.current && !prepended) el.scrollTop = el.scrollHeight;
    else if (!restoreTranscriptAnchor(el, anchor.current) && prepended) el.scrollTop += el.scrollHeight - height.current;
    previousTail.current = events.at(-1)?.idx ?? null;
    anchor.current = captureTranscriptAnchor(el);
    previousFirst.current = events[0]?.idx; height.current = el.scrollHeight;
  }, [events, page?.partial?.text]);
  useLayoutEffect(() => {
    const el = root.current; const content = el?.firstElementChild;
    if (!el || !content || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      if (revealTarget.current) return;
      else if (follow.current) el.scrollTop = el.scrollHeight;
      else restoreTranscriptAnchor(el, anchor.current);
      anchor.current = captureTranscriptAnchor(el);
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, []);
  return <div className="transcript-frame"><div ref={root} className="chat-scroll" style={{ overflowAnchor: 'none' }} aria-label="Сообщения" onScroll={() => { const el = root.current!; if (!revealTarget.current) follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 25; anchor.current = captureTranscriptAnchor(el); setAwayFromBottom(!follow.current); }}>
    <div className="chat-content">
    {hasOlder && <div className="load-older-row"><button type="button" className="load-older" disabled={loadingOlder} onClick={() => { void loadOlder(); }}>{loadingOlder ? 'Загрузка…' : 'Ранее в разговоре'}</button></div>}
    {workTurns(coalesceQuestionHistory(coalesceCommands(coalesceCompactions(events))), !!page?.isRunning, page?.runs).map((turn, turnIndex, turns) => <Fragment key={`${agentId}:${turn.key}`}>
      {turn.input && <Message event={turn.input} agentId={agentId} />}
      <WorkGroup turn={turn}>
        {processEntries(turn.events.filter(event => !choiceResultId(event))).map((entry, entryIndex, entries) => entry.kind === 'message'
          ? <Message key={entry.event.idx} event={entry.event} agentId={agentId} />
          : <ProcessGroup key={entry.key} events={entry.events} live={!!page?.isRunning && turn.status === 'open' && turnIndex === turns.length - 1 && entryIndex === entries.length - 1}>
            {entry.events.map(event => <Message key={event.idx} event={event} agentId={agentId} />)}
          </ProcessGroup>)}
        <QuestionHistoryList events={turn.events} agentId={agentId} />
      </WorkGroup>
      {turn.answer && <Message event={turn.answer} agentId={agentId} />}
    </Fragment>)}
    {page?.thinking && <ThinkingRow summary={page.thinking.publicSummary} />}
    {page?.activeTools?.map((run, index, runs) => <ActiveToolRow key={run.id} run={run} autoOpen={index === runs.length - 1} />)}
    {page?.partial && <article className="message message--assistant streaming-message"><div className="markdown"><ChatMarkdown>{page.partial.text}</ChatMarkdown></div></article>}
    {page?.isRunning && <CurrentAction page={page} />}
    {!events.length && !page?.partial && !page?.isRunning && <p className="transcript-notice">Начните разговор с агентом.</p>}
    </div>
  </div><ChatNavigation events={events} scrollRef={root} outline={outline} loadThrough={loadThrough} onNavigateStart={() => { cancelReveal.current?.(); revealTarget.current = null; follow.current = false; }} />{awayFromBottom && <div className="chat-to-bottom-slot"><button type="button" className="chat-to-bottom" aria-label="К последнему сообщению" onClick={() => { const el = root.current; if (!el) return; cancelReveal.current?.(); revealTarget.current = null; follow.current = true; el.scrollTo({ top: el.scrollHeight, behavior: 'instant' }); setAwayFromBottom(false); }}><ChevronDown size={14} strokeWidth={1} /></button></div>}</div>;
}
