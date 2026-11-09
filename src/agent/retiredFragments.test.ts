import { expect, test } from 'bun:test';

// React Transcript/Composer own rendering. Keep the durable JSON routes and
// protected input transports; never resurrect their unauthenticated HTML twins.
test('retired transcript fragments and orphan renderers stay removed', async () => {
    for (const file of [
        '$route_$id_events.html_GET.ts', '$route_$id_stream.html_GET.ts',
        '$route_$id_active-tool_GET.ts', '$route_$id_active-tool-details_GET.ts',
        '$route_$id_next_GET.ts', 'renderHistoryPage.ts',
        'renderTransientStream.ts', 'renderActiveToolCall.ts', 'activeToolDetails.ts',
    ]) expect(await Bun.file(new URL(file, import.meta.url)).exists()).toBe(false);
});

test('JSON event, status and durable queue routes remain available', async () => {
    for (const file of [
        '$route_$id_events_GET.ts', '$route_$id_status_GET.ts',
        '$route_$id_queue_GET.ts', '$route_$id_queue_POST.ts',
    ]) expect(await Bun.file(new URL(file, import.meta.url)).exists()).toBe(true);
});
