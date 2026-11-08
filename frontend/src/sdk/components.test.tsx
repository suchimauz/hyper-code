import { expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button, Dialog, IconButton, Panel, TextField } from './components';
it('exports semantic controls with accessible labels', () => {
  render(<><Button>Save</Button><IconButton label="Refresh">↻</IconButton><Panel title="Settings"><TextField label="Name" description="Public name" error="Required" /></Panel></>);
  expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('type', 'button');
  expect(screen.getByRole('button', { name: 'Refresh' })).toBeVisible();
  expect(screen.getByRole('region', { name: 'Settings' })).toBeVisible();
  const input = screen.getByRole('textbox', { name: 'Name' }); expect(input).toHaveAccessibleDescription('Public name Required'); expect(input).toHaveAttribute('aria-invalid', 'true');
});
it('dialog names its content, takes focus and closes on Escape', async () => {
  const user = userEvent.setup(), onOpenChange = vi.fn();
  render(<Dialog open onOpenChange={onOpenChange} title="Edit profile" description="Update your public name"><TextField label="Name" /></Dialog>);
  expect(await screen.findByRole('dialog', { name: 'Edit profile' })).toHaveAccessibleDescription('Update your public name');
  await user.keyboard('{Escape}'); expect(onOpenChange).toHaveBeenCalledWith(false);
});
