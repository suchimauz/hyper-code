import { FileText, FilePlus2, FilePenLine, Search, Terminal, Code2, Wrench } from 'lucide-react';
const kinds = {
  read: { icon: FileText, label: 'Read' }, write: { icon: FilePlus2, label: 'Write' },
  edit: { icon: FilePenLine, label: 'Edit' }, grep: { icon: Search, label: 'Grep' },
  find: { icon: Search, label: 'Glob' }, glob: { icon: Search, label: 'Glob' }, bash: { icon: Terminal, label: 'Bash' },
  eval: { icon: Code2, label: 'Eval' }, tools_eval: { icon: Code2, label: 'Eval' },
};
export function toolKind(name: string) { return kinds[(name.split('.').pop() || name) as keyof typeof kinds] || { icon: Wrench, label: name }; }
