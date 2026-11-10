import { useState } from 'react';
import { MessageInput } from './MessageInput';
export type ComposerProps = { onSend: (text: string) => void; disabled?: boolean };
export function Composer({ onSend, disabled }: ComposerProps) {
  const [text, setText] = useState('');
  const send = () => { if (!disabled && text.trim()) { onSend(text.trim()); setText(''); } };
  return <MessageInput value={text} onChange={setText} onSend={send} disabled={disabled} />;
}
