import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { AppShell } from './AppShell';
import { Toolbar } from './Toolbar';
import { Sidebar } from './Sidebar';
import { SplitPane } from './SplitPane';
import { Sheet } from './Sheet';
import { Button } from '../ui/Button';
const meta = { title: 'Компоновка/Workspace', component: AppShell } satisfies Meta<typeof AppShell>;
export default meta;
type Story = StoryObj;
function ResizableExample() {
  const [width, setWidth] = useState(360);
  return <div style={{ height: 480 }}><SplitPane secondaryWidth={width} onWidthChange={setWidth} primary={<Toolbar title="Canvas" />} secondary={<Toolbar title="Чат" subtitle="Потяните разделитель или используйте стрелки" />} /></div>;
}
function SheetExample() {
  const [open, setOpen] = useState(false);
  return <><Button onClick={() => setOpen(true)}>Открыть панель</Button><Sheet title="Агенты" open={open} onOpenChange={setOpen}><Sidebar header="MauzCode"><Button onClick={() => setOpen(false)}>Выбрать агента</Button></Sidebar></Sheet></>;
}
export const Shell: Story = { render: () => <div style={{ height: 480 }}><AppShell sidebar={<Sidebar header="MauzCode" footer="Рабочее пространство">Список агентов</Sidebar>}><Toolbar title="Новый интерфейс" /><p style={{ padding: 24 }}>Содержимое рабочей области</p></AppShell></div> };
export const Resizable: Story = { render: () => <ResizableExample /> };
export const MobileSheet: Story = { render: () => <SheetExample /> };
export const PanelToolbar: Story = { render: () => <Toolbar title="Canvas" subtitle="Рабочая область" actions={<Button>Открыть</Button>} /> };
