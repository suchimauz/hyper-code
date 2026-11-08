/** dsh deriveSummary priorities, with Hyper's file/code aliases. No result text is used. */
export function toolSummary(name: string, args: Record<string, unknown>): string {
  const kind = name.split('.').pop() || name;
  const firstLine = (text: string) => text.split(/\r?\n/, 1)[0];
  const search = ['grep', 'find', 'glob'].includes(kind);
  if (search && Array.isArray(args.queries)) {
    const queries = args.queries.filter((value): value is string => typeof value === 'string' && value.length > 0);
    if (queries.length) return queries.map(firstLine).join(', ').slice(0, 1000);
  }
  const keys = kind === 'bash' ? ['description', 'command']
    : ['read', 'edit', 'write'].includes(kind) ? ['path', 'file_path', 'file', ...(kind === 'read' ? ['url'] : [])]
    : search ? ['query', 'pattern', 'url']
    : ['eval', 'tools_eval'].includes(kind) ? ['description'] : [];
  const picked = keys.map(key => args[key]).find(value => typeof value === 'string' && value.length > 0)
    ?? Object.values(args).find(value => typeof value === 'string' && value.length > 0);
  return (typeof picked === 'string' ? firstLine(picked) : Object.keys(args).length ? JSON.stringify(args) : '').slice(0, 1000);
}
