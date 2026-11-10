import { useState } from 'react';
import { AssistantHtml } from './AssistantHtml';
import { ToolBusyRow } from './ToolBusyRow';
import { isLifecycleEvent, LifecycleRow } from './LifecycleRow';
import { choiceResultId, QuestionHistory } from './QuestionHistory';
import { Check, Copy } from 'lucide-react';
import { MessageAttachments } from './MessageAttachments';
import { ChatMarkdown } from './ChatMarkdown';
import type { ChatEvent } from '../../lib/mauzcode';
import { ThinkingRow } from './ThinkingRow';
import { ToolRow } from './ToolRow';
import { isPeer } from './transcriptGroups';
import { AgentMessage } from './AgentMessage';
import { CompactionRow } from './CompactionRow';
import { isCompaction } from './compactionEvents';
import './transcript-message.css';
import { CommandRow } from './CommandRow';
import { GoalRow } from './GoalRow';
import { RetryRow } from './RetryRow';
import { commandMessage, isCommandEvent } from './commandEvents';

/** Profile photos follow the sign-in HTTPS-only policy; never render supplied HTML. */
function HumanAuthor({ author }: { author: NonNullable<ChatEvent['author']> }) {
  let picture: string | undefined;
  try {
    const url = new URL(author.picture || '');
    if (url.protocol === 'https:' && !url.username && !url.password) picture = url.href;
  } catch { /* Missing or malformed photos use initials. */ }
  const [failedPicture, setFailedPicture] = useState<string>();
  const hue = Number.isFinite(author.hue) ? ((author.hue % 360) + 360) % 360 : 210;
  return <div className="user-message-author">
    {picture && failedPicture !== picture
      ? <img className="user-message-avatar" src={picture} alt="" referrerPolicy="no-referrer" loading="lazy" onError={() => setFailedPicture(picture)} />
      : <span className="user-message-avatar user-message-initials" aria-hidden="true" style={{ backgroundColor: `hsl(${hue} 55% 45%)` }}>{author.initials || '?'}</span>}
    <span className="user-message-author-name">{author.name}</span>
  </div>;
}

/** User bubble and message actions mirror dsh MessageItem/MessageActions. */
export function TranscriptMessage({ event, agentId }: { event: ChatEvent; agentId: string }) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  if (choiceResultId(event)) return <QuestionHistory event={event} agentId={agentId} />;
  if (isCommandEvent(event)) return <CommandRow event={event} />;
  if (isPeer(event)) return <AgentMessage event={event} />;
  if (isLifecycleEvent(event)) return <LifecycleRow event={event} />;
  if (event.type === 'job') return null;
  if (isCompaction(event)) return <CompactionRow event={event} />;
  if (event.type === 'tool_call' || event.type === 'tool_result') return <ToolRow event={event} agentId={agentId} />;
  if (event.type === 'thinking') return <ThinkingRow running={false} summary={event.publicSummary || ''} durationMs={event.durationMs} interrupted={event.thinkingStatus === 'interrupted'} />;
  if (event.type === 'goal_transition') return <GoalRow event={event} />;
  if (event.type === 'llm_retry') return <RetryRow event={event} />;
  if (event.type === 'tool_busy' || event.type === 'tool_aborted') return <ToolBusyRow event={event} agentId={agentId} />;
  if (event.type === 'stop') return <p className="transcript-notice">Выполнение остановлено</p>;
  if (event.type === 'planning_mode' || event.type === 'planning_proposal') return event.text ? <CommandRow event={{ ...event, commandName: 'plan' }} /> : null;
  const attachments = event.attachments?.length ? <MessageAttachments attachments={event.attachments} agentId={agentId} /> : null;
  if (event.type === 'user') {
    const command = commandMessage(event);
    const displayText = command ? event.command!.text : event.text;
    const date = new Date(event.ts);
    const hasTime = Number.isFinite(date.getTime()) && event.ts > 0;
    return <article className="message message--user" data-chat-flow-kind="user" data-event-idx={event.idx}>
      <div className="user-message-stack">
        {event.author && !event.author.id.startsWith('agent:') && event.navigationEligible !== false && <HumanAuthor author={event.author} />}
        {attachments}
        {!!displayText && <div className="user-message-bubble">{command ? <>{command.prefix}<span className="user-command-token">{command.token}</span>{command.suffix}</> : displayText}</div>}
      </div>
      <div className="user-message-actions">
        {hasTime && <time dateTime={date.toISOString()} title={date.toLocaleString()}>{date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}</time>}
        {!!event.text && <button type="button" className="user-message-copy" aria-label={copied ? 'Скопировано' : 'Копировать сообщение'} onClick={async () => { try { await navigator.clipboard.writeText(displayText!); setCopied(true); setCopyError(false); } catch { setCopyError(true); } }} onBlur={() => setCopied(false)} onMouseLeave={() => setCopied(false)}>{copied ? <Check size={16} strokeWidth={1} /> : <Copy size={16} strokeWidth={1} />}</button>}
        {copyError && <span role="status">Не удалось скопировать</span>}
      </div>
    </article>;
  }
  return <article className={`message message--assistant ${event.type === 'error' ? 'message--error' : ''}`} data-event-idx={event.idx}>
    {event.type === 'assistant' && event.htmlSource === 'assistant-answer' && event.html
      ? <AssistantHtml html={event.html} />
      : <div className="markdown"><ChatMarkdown>{event.text || (event.html ? 'HTML-ответ недоступен без подтверждённого источника.' : '')}</ChatMarkdown></div>}
    {attachments}
  </article>;
}
