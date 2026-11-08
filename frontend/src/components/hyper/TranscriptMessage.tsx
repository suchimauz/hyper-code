import { useState } from 'react';
import { choiceResultId, QuestionHistory } from './QuestionHistory';
import { Check, Copy } from 'lucide-react';
import { MessageAttachments } from './MessageAttachments';
import { ChatMarkdown } from './ChatMarkdown';
import type { ChatEvent } from '../../lib/hyper';
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

/** User bubble and message actions mirror dsh MessageItem/MessageActions. */
export function TranscriptMessage({ event, agentId }: { event: ChatEvent; agentId: string }) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  if (choiceResultId(event)) return <QuestionHistory event={event} agentId={agentId} />;
  if (isCommandEvent(event)) return <CommandRow event={event} />;
  if (isPeer(event)) return <AgentMessage event={event} />;
  if (isCompaction(event)) return <CompactionRow event={event} />;
  if (event.type === 'tool_call' || event.type === 'tool_result') return <ToolRow event={event} agentId={agentId} />;
  if (event.type === 'thinking') return <ThinkingRow running={false} summary={event.publicSummary || ''} durationMs={event.durationMs} interrupted={event.thinkingStatus === 'interrupted'} />;
  if (event.type === 'goal_transition') return <GoalRow event={event} />;
  if (event.type === 'llm_retry') return <RetryRow event={event} />;
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
    <div className="markdown"><ChatMarkdown>{event.text || (event.html ? 'Этот ответ содержит специальный HTML-блок; его отображение пока не поддерживается.' : '')}</ChatMarkdown></div>
    {attachments}
  </article>;
}
