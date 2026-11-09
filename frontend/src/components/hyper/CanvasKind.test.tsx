import { expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CanvasKind } from './CanvasKind';
vi.mock('../../extensions/installed', () => ({ installedExtensions: { canvasKinds: [{ key: 'test/test.map', kind: 'test.map', component: ({ context, item }: { context: { agentId: string; theme: string }; item: { state: { zoom: number } } }) => <p>{context.agentId}:{context.theme}:{item.state.zoom}</p> }] } }));
it('renders a host-granted React kind with current identity and state', () => {
  const item = { id: 1, title: 'Map', active: true, icon: 'square', kind: 'test.map', state: { zoom: 2 } };
  const view = render(<CanvasKind agentId="a" item={item} theme="dark" />);
  expect(screen.getByText('a:dark:2')).toBeInTheDocument(); expect(document.querySelector('iframe')).toBeNull();
  view.rerender(<CanvasKind agentId="a" item={{...item,state:{zoom:3}}} theme="light" />);
  expect(screen.getByText('a:light:3')).toBeInTheDocument();
});
it('ungranted kinds retain agent-bound isolated content', () => {
  render(<CanvasKind agentId="a" item={{id:2,title:'Safe preview',active:true,icon:'square',kind:'html'}} theme="dark" />);
  expect(screen.getByTitle('Canvas: Safe preview')).toHaveAttribute('src','/canvas/a/item/2/document?theme=dark');
});
