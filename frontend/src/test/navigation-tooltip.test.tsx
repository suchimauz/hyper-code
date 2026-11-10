import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { WorkspaceChatRow } from '../components/mauzcode/WorkspaceChatRow';
import { NavigationTooltip, workspaceCreatedLabel, workspaceTooltipPath } from '../components/mauzcode/NavigationTooltip';

it('shows exact model and effort in a hover preview without selecting a chat', async () => {
  const select = vi.fn();
  render(<WorkspaceChatRow chat={{ id:'aa',title:'Task',model:'ssh/host:codex/account:gpt-6-astra',modelLabel:'gpt-6-astra',effort:{requested:'high',applied:'high',label:'High',downgraded:false},runState:'idle',hasUnread:false,lastReplyAt:Date.now()-3600000 }} selected={false} archivedView={false} onSelect={select} />);
  const row=screen.getByRole('button', {name:/aa Task/});
  await userEvent.hover(row);
  const tip=await screen.findByRole('tooltip');
  expect(tip).toHaveTextContent('gpt-6-astra High');expect(tip).toHaveTextContent('Idle');expect(select).not.toHaveBeenCalled();
  fireEvent.click(row);expect(select).toHaveBeenCalledWith('aa');
  await waitFor(()=>expect(screen.queryByRole('tooltip')).not.toBeInTheDocument());
});
it('retains workspace path and real creation date, omitting unknown dates', async () => {
  const label=workspaceCreatedLabel(new Date(2026,10,3,19,59).getTime());
  expect(label).toBe('Created 2026-11-3 19:59');expect(workspaceCreatedLabel(null)).toBeNull();
  expect(workspaceTooltipPath('/home/user/project',null)).toBe('~/project');
  expect(workspaceTooltipPath('/works/project','host')).toBe('host:/works/project');
  render(<NavigationTooltip trigger={<button>Workspace</button>}><div>Project</div><div>~/project</div><div>{label}</div></NavigationTooltip>);
  fireEvent.focus(screen.getByRole('button',{name:'Workspace'}));
  expect(await screen.findByRole('tooltip')).toHaveTextContent('~/projectCreated 2026-11-3 19:59');
});
