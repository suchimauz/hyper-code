import { CircleDashed, ListChecks, Paperclip, Terminal } from 'lucide-react';
import type { ComposerCommand } from '../../hooks/useCommandMenu';
import './command-menu.css';

export function CommandMenu({ id, commands, index, status, error, onPick, onHover, onRetry }: {
  id: string; commands: ComposerCommand[]; index: number; status: 'idle' | 'loading' | 'ready' | 'error'; error: string;
  onPick: (command: ComposerCommand) => void; onHover: (index: number) => void; onRetry: () => void;
}) {
  return <div className="command-menu" onMouseDown={event => event.preventDefault()}>
    <div id={id} role="listbox" aria-label="Добавить файл или выполнить команду" aria-busy={status === 'loading'}>
      {status === 'ready' && (['Add', 'Commands'] as const).map(section => commands.some(c => c.section === section) && <div role="group" aria-label={section} key={section}>
        <div className="command-menu-label">{section}</div>
        {commands.map((command, itemIndex) => {
          if (command.section !== section) return null;
          const Icon = command.name === 'file' ? Paperclip : command.name === 'plan' ? ListChecks : command.name === 'compact' ? CircleDashed : Terminal;
          return <button type="button" key={command.name} id={`${id}-${itemIndex}`} role="option" aria-disabled={command.disabled || undefined} aria-selected={index === itemIndex} className="command-menu-option" title={command.disabled ? 'Команда недоступна до создания чата или во время выполнения' : undefined} onPointerMove={() => onHover(itemIndex)} onClick={() => { if (!command.disabled) onPick(command); }}>
            <Icon size={14} strokeWidth={1.3} aria-hidden="true" /><span className="command-menu-name">{command.label}</span><span className="command-menu-description">{command.name === 'plan' ? 'Enter or leave plan mode' : command.name === 'compact' ? 'Compact older conversation history' : command.description}</span>
          </button>;
        })}
      </div>)}
    </div>
    {status === 'loading' && <div className="command-menu-message" role="status">Загрузка команд…</div>}
    {status === 'error' && <div className="command-menu-message" role="alert">{error} <button type="button" onClick={onRetry}>Повторить</button></div>}
    {status === 'ready' && !commands.length && <div className="command-menu-message" role="status">Команда не найдена</div>}
  </div>;
}
