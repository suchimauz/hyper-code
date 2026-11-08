import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { TranscriptMessage } from '../components/hyper/TranscriptMessage';
import { Transcript } from '../components/hyper/Transcript';
import type { EventPage } from '../lib/hyper';

it('renders user text literally in a right-aligned bubble with time and copy action', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  const text = '**not markdown**\nsecond line';
  const { container } = render(<TranscriptMessage agentId="fixture" event={{idx: 2, type: 'user', ts: 1700000000000, text}} />);
  expect(container.querySelector('.user-message-bubble')?.textContent).toBe(text);
  expect(container.querySelector('strong')).toBeNull();
  expect(container.querySelector('time')).toHaveAttribute('datetime', '2023-11-14T22:13:20.000Z');
  fireEvent.click(screen.getByRole('button', {name: 'Копировать сообщение'}));
  await waitFor(() => expect(writeText).toHaveBeenCalledWith(text));
  expect(await screen.findByRole('button', {name: 'Скопировано'})).toBeVisible();
});
it('has no assistant author badge in settled or streaming replies', () => {
  const page = { agentId: 'fixture', isRunning: true, partial: {text: 'Streaming reply'} } as EventPage;
  const {container} = render(<Transcript agentId="fixture" events={[{idx: 1, type: 'assistant', ts: 1, text: 'Final reply'}]} page={page} hasOlder={false} loadingOlder={false} loadOlder={async () => {}} />);
  expect(screen.getByText('Final reply')).toBeVisible();
  expect(screen.getByText('Streaming reply')).toBeVisible();
  expect(container.querySelector('.message-author')).toBeNull();
  expect(container.querySelector('.assistant-mark')).toBeNull();
});
