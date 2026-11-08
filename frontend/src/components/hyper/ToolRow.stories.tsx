import type { Meta, StoryObj } from '@storybook/react-vite';
import { ToolRow } from './ToolRow';
const event = { idx: 1, ts: 1, type: 'tool_call', name: 'read', text: null, preview: 'Read App.tsx' };
const details = { ...event, args: '{"path":"src/App.tsx"}', argsTruncated: false, result: 'export function App() {\n  return <main>Hello</main>;\n}', resultTruncated: false, isError: false };
const meta = { title: 'Hyper/ToolRow', component: ToolRow, args: { event, agentId: 'fixture', initialDetails: details }, decorators: [Story => <div style={{ maxWidth: 760, padding: 24 }}><Story /></div>] } satisfies Meta<typeof ToolRow>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Read: Story = {};
export const Variants: Story = { render: () => <>{[
  ['read', 'Read src/App.tsx', { path: 'src/App.tsx' }, 'export default App;'],
  ['grep', 'Search scrollbar', { pattern: 'scrollbar', path: 'src' }, 'src/styles/scrollbar.css:6: scrollbar-width: thin;'],
  ['edit', 'Edit tokens.css', { path: 'src/styles/tokens.css', edits: [{ oldText: '--accent: blue;', newText: '--accent: #d97757;' }] }, 'Edited tokens.css'],
  ['bash', 'Run bun run build', { command: 'bun run build' }, 'Build complete'],
  ['plugin.custom', 'plugin.custom example', { query: 'example' }, '{"ok":true}'],
].map(([name, preview, args, result], idx) => <ToolRow key={idx} agentId="fixture" event={{ ...event, idx, name: String(name), preview: String(preview) }} initialDetails={{ ...details, idx, name: String(name), args: JSON.stringify(args), result: String(result) }} />)}</> };
export const Error: Story = { args: { event: { ...event, type: 'tool_result', name: 'bash', isError: true, preview: 'exit 1: test failed' }, initialDetails: { ...details, type: 'tool_result', name: 'bash', isError: true, args: '{}', result: 'exit 1: test failed' } } };
